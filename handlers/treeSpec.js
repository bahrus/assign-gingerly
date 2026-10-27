/**
 * Element-specification helpers shared by builtIns.tree and compileTree.
 *
 * Pure: no DOM access, so compileTree can run on a server.
 */
import { isFromStackReference } from '../resolve/getValues.js';
/** Whether a specification is a switch (`{ switch, cases, default? }`) rather than an element. */
export function isSwitch(spec) {
    return !!spec && typeof spec === 'object' && !Array.isArray(spec) && 'switch' in spec;
}
/** Check a switch's shape, so a malformed one fails with a clear message. */
export function checkSwitch(spec) {
    const { switch: on, cases } = spec;
    if (typeof on !== 'string')
        throw new Error('builtIns.tree: a switch needs a "switch" path, e.g. { switch: \'?.status\', cases: { … } }');
    if (!cases || typeof cases !== 'object' || Array.isArray(cases)) {
        throw new Error('builtIns.tree: a switch needs a "cases" object of case → specification');
    }
}
/** The map key whose specification applies to VM keys the map doesn't name. */
export const WILDCARD = '*';
/** The pattern a `'*'` specification gets when it has none. */
export const DEFAULT_WILDCARD_PATTERN = { textContent: '?.' };
/** `{ textContent: text }` patterns for string shorthand, one object per string (so pattern caches hit). */
const textPatterns = new Map();
/** A string in the pattern slot is shorthand for `{ textContent: string }`. */
function textPattern(text) {
    let pattern = textPatterns.get(text);
    if (!pattern) {
        pattern = { textContent: text };
        textPatterns.set(text, pattern);
    }
    return pattern;
}
/** Whether a specification is a snippet (`{ snippet: 'name' }`): static HTML from the `snippets` option. */
export function isSnippet(spec) {
    return !!spec && typeof spec === 'object' && !Array.isArray(spec) && 'snippet' in spec;
}
/** A snippet's HTML from the `snippets` option, trimmed (as both builtIns.tree and o2h use it); throws when it's missing. */
export function snippetSource(spec, snippets) {
    const html = snippets?.[spec.snippet];
    if (typeof html !== 'string')
        throw new Error(`builtIns.tree: snippet "${spec.snippet}" isn't in the snippets option`);
    return html.trim();
}
export function normalize(spec) {
    // Switches are resolved to a case, and snippets are cloned, before anything normalizes them
    if (isSwitch(spec))
        throw new Error('builtIns.tree: a switch has no element of its own to normalize');
    if (isSnippet(spec))
        throw new Error('builtIns.tree: a snippet has no element of its own to normalize');
    const [header, patternOrText, third] = Array.isArray(spec) ? spec : [spec];
    const pattern = typeof patternOrText === 'string' ? textPattern(patternOrText) : patternOrText;
    // The children slot: an array of static children, a repeat object ({ each, … }) or a nested tree ({ map, … })
    let children = [];
    let repeat;
    let nested;
    if (Array.isArray(third)) {
        children = third;
    }
    else if (third !== undefined) {
        if (third && typeof third === 'object' && 'each' in third) {
            repeat = third;
        }
        else if (third && typeof third === 'object' && 'map' in third) {
            nested = third;
        }
        else {
            throw new Error('builtIns.tree: the children slot must be an array of specifications, a repeat object { each, … } or a nested tree { map, … }');
        }
    }
    if (typeof header === 'string') {
        if (header.startsWith('$:')) {
            throw new Error(`builtIns.tree: itemscope manager headers ("${header}") are not supported yet; use { tag, ish: '${header.slice(2)}' }`);
        }
        return [header, header, undefined, pattern, children, repeat, nested];
    }
    if (typeof header === 'function') {
        throw new Error('builtIns.tree: class headers are not supported yet; use { tag, ish: Class }');
    }
    if (header && typeof header === 'object' && typeof header.tag === 'string') {
        return [header, header.tag, header.ish, pattern, children, repeat, nested];
    }
    throw new Error('builtIns.tree: an element header must be a tag name or { tag, ish? }');
}
/** The specification each unmatched key gets, per map (see wildcardSpecOf). */
const wildcardSpecs = new WeakMap();
/**
 * The specification for VM keys a map doesn't name: the map's `'*'` specification, with
 * the default pattern when it has none. One shared object per map (not per key or call),
 * so spec identity holds across calls, as it does for named keys.
 */
export function wildcardSpecOf(map) {
    const source = map[WILDCARD];
    // A switch keeps its cases as written, and a snippet is static (the default pattern is for a bare element)
    if (isSwitch(source) || isSnippet(source))
        return source;
    const cached = wildcardSpecs.get(map);
    if (cached?.source === source)
        return cached.spec;
    const [header, , , pattern = DEFAULT_WILDCARD_PATTERN, children, repeat, nested] = normalize(source);
    const spec = [header, pattern, repeat ?? nested ?? children];
    wildcardSpecs.set(map, { source, spec });
    return spec;
}
/** Whether a string RHS is a plain literal (not a reference, negation or protocol). */
export function isLiteralString(value) {
    return !(value.startsWith('?.') || value.startsWith('$0') || isFromStackReference(value)
        || value.startsWith('!') || value.includes('://'));
}
/** Map keys' VM key names (see mapKeyName), by key. */
const keyNames = new Map();
/**
 * The VM key a map key names: the key itself, or, for a key with a trailing comment
 * (`'rocket /* summary *\/'`), the part before it, trimmed. A comment lets a map render the same VM key
 * more than once: each key is its own entry (its own element), while the comment is ignored for the
 * lookup. Only one comment, only at the end: anything else is an error.
 */
export function mapKeyName(key) {
    let name = keyNames.get(key);
    if (name !== undefined)
        return name;
    name = key;
    if (key.includes('/*') || key.includes('*/')) {
        const trimmed = key.trimEnd();
        const open = trimmed.indexOf('/*');
        if (open < 0 || !trimmed.endsWith('*/') || trimmed.indexOf('*/') !== trimmed.length - 2 || trimmed.indexOf('/*', open + 2) >= 0) {
            throw new Error(`builtIns.tree: map key "${key}": a comment in a map key goes at its end, once (e.g. 'rocket /* summary */')`);
        }
        name = trimmed.slice(0, open).trim();
        if (name === '')
            throw new Error(`builtIns.tree: map key "${key}" is only a comment; put the VM key before it`);
    }
    keyNames.set(key, name);
    return name;
}
/** A map key that's a path (`'?.'`, `'?.congress?.house'`) rather than a VM key name. */
export function isPathKey(name) {
    return name.startsWith('?.');
}
/** Pre-split path keys, cached by name. */
const keyPaths = new Map();
/**
 * The value a map key names in the VM: `vm[name]`, or for a path key, the value at that path
 * (`'?.'` is the VM itself). Path keys are plain property paths: no pipes or references.
 */
export function mapKeyValue(name, from) {
    if (!isPathKey(name))
        return from?.[name];
    let segments = keyPaths.get(name);
    if (!segments)
        keyPaths.set(name, segments = name.split('?.').filter(segment => segment !== ''));
    let value = from;
    for (const segment of segments)
        value = value?.[segment];
    return value;
}
/**
 * The map's entries that render, in render order: map order, then `'*'` for the VM keys
 * the map doesn't name (in VM key order). Keys whose value is null / undefined are left
 * out, unless `keepNullish`. A key with a trailing comment names the VM key before it
 * (see mapKeyName), for `'*'` too. A path key (`'?.'`, `'?.a?.b'`) renders the value at that
 * path; for `'*'`, a one-step path key (`'?.a'`) names its VM key, as `'a'` would.
 */
export function mapEntries(map, from, keepNullish = false) {
    const entries = [];
    const push = (key, name, spec, templateKey) => {
        const value = mapKeyValue(name, from);
        if (value == null && !keepNullish)
            return;
        entries.push({ key, name, spec, value, templateKey });
    };
    const named = new Set();
    for (const key of Object.keys(map)) {
        if (key === WILDCARD)
            continue;
        const name = mapKeyName(key);
        if (!isPathKey(name))
            named.add(name);
        else if (/^\?\.[^?]+$/.test(name))
            named.add(name.slice(2));
        push(key, name, map[key], key);
    }
    if (map[WILDCARD] === undefined || from === null || typeof from !== 'object')
        return entries;
    const wildcardSpec = wildcardSpecOf(map);
    for (const key of Object.keys(from)) {
        if (!named.has(key))
            push(key, key, wildcardSpec, WILDCARD);
    }
    return entries;
}
/** A switch's `default`, as a case key (can't collide with a `cases` key). */
export const DEFAULT_CASE = Symbol('builtIns.tree default case');
/**
 * The case a switch picks for `value`: the discriminant (resolved against `value`) matched
 * with `String(…)` against the `cases` keys; nullish or unmatched → `default`. `spec` is
 * null / undefined when nothing renders.
 */
export function chooseCase(spec, value, resolve) {
    checkSwitch(spec);
    const { switch: on, cases, default: fallback } = spec;
    const discriminant = resolve(on, value);
    const caseName = discriminant == null ? undefined : String(discriminant);
    if (caseName !== undefined && Object.hasOwn(cases, caseName))
        return { caseKey: caseName, spec: cases[caseName] };
    return { caseKey: DEFAULT_CASE, spec: fallback };
}
/**
 * The items a repeat stamps for `value`: the iterable at `of` (default `'?.'`, the value
 * itself; anything nullish or not iterable counts as empty), each identified by its `key`
 * (default: its index). A duplicate key falls back to `Symbol.for('builtIns.tree:index:<i>')`.
 */
export function repeatItems(repeat, value, resolve) {
    const { of = '?.', key, empty } = repeat;
    const list = resolve(of, value);
    const items = list != null && typeof list[Symbol.iterator] === 'function' ? Array.from(list) : [];
    const keys = new Array(items.length);
    const seen = new Set();
    let duplicate;
    let hasDuplicate = false;
    for (let index = 0; index < items.length; index++) {
        let itemKey = key === undefined ? index : resolve(key, items[index], true);
        if (seen.has(itemKey)) {
            if (!hasDuplicate) {
                hasDuplicate = true;
                duplicate = itemKey;
            }
            itemKey = Symbol.for(`builtIns.tree:index:${index}`);
        }
        seen.add(itemKey);
        keys[index] = itemKey;
    }
    const result = { items, keys, pushesHolder: of !== '?.' };
    if (hasDuplicate)
        result.duplicate = duplicate;
    if (items.length === 0 && empty !== undefined)
        result.empty = empty;
    return result;
}
const HOLE = 'data-hole';
const VOID_ELEMENTS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW_TEXT_ELEMENTS = new Set(['script', 'style', 'textarea', 'title']);
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const TAG_NAME = /[A-Za-z][^\s/>]*/y;
const ATTR_NAME = /[^\s/>=]+/y;
const UNQUOTED = /[^\s>]*/y;
/** Decode the character references attribute values commonly hold (numeric, and a few named ones). */
function decodeEntities(text) {
    return text.replace(/&(#[xX][0-9a-fA-F]+|#\d+|[A-Za-z]+);/g, (whole, ref) => {
        if (ref[0] !== '#')
            return ENTITIES[ref] ?? whole;
        return String.fromCodePoint(ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10));
    });
}
const match = (re, text, at) => {
    re.lastIndex = at;
    return re.exec(text)?.[0];
};
/** Start and end tags, in order, skipping comments, doctypes and raw text (style, textarea, title). */
function* tokens(html) {
    let i = 0;
    while (true) {
        const lt = html.indexOf('<', i);
        if (lt < 0)
            return;
        if (html.startsWith('<!--', lt)) {
            const e = html.indexOf('-->', lt + 4);
            i = e < 0 ? html.length : e + 3;
            continue;
        }
        if (html[lt + 1] === '!' || html[lt + 1] === '?') {
            const e = html.indexOf('>', lt);
            i = e < 0 ? html.length : e + 1;
            continue;
        }
        const isEnd = html[lt + 1] === '/';
        const nameAt = lt + (isEnd ? 2 : 1);
        const name = match(TAG_NAME, html, nameAt);
        if (!name) {
            // A '<' in text
            i = lt + 1;
            continue;
        }
        let p = nameAt + name.length;
        if (isEnd) {
            const e = html.indexOf('>', p);
            i = e < 0 ? html.length : e + 1;
            yield { kind: 'end', name, start: lt, end: i, attrs: [], closed: false };
            continue;
        }
        const attrs = [];
        let selfClosed = false;
        while (p < html.length) {
            const before = p;
            while (p < html.length && /\s/.test(html[p]))
                p++;
            if (html[p] === '>') {
                p++;
                break;
            }
            if (html.startsWith('/>', p)) {
                selfClosed = true;
                p += 2;
                break;
            }
            if (html[p] === '/') {
                p++;
                continue;
            }
            const attrName = match(ATTR_NAME, html, p);
            if (!attrName) {
                p++;
                continue;
            }
            p += attrName.length;
            let value = '';
            let q = p;
            while (q < html.length && /\s/.test(html[q]))
                q++;
            if (html[q] === '=') {
                q++;
                while (q < html.length && /\s/.test(html[q]))
                    q++;
                const quote = html[q];
                if (quote === '"' || quote === "'") {
                    const e = html.indexOf(quote, q + 1);
                    value = html.slice(q + 1, e < 0 ? html.length : e);
                    p = e < 0 ? html.length : e + 1;
                }
                else {
                    value = match(UNQUOTED, html, q) ?? '';
                    p = q + value.length;
                }
            }
            attrs.push({ name: attrName, value: decodeEntities(value), start: before, end: p });
        }
        i = p;
        const lower = name.toLowerCase();
        yield { kind: 'start', name, start: lt, end: i, attrs, closed: selfClosed || VOID_ELEMENTS.has(lower) };
        if (RAW_TEXT_ELEMENTS.has(lower) && !selfClosed) {
            const e = html.toLowerCase().indexOf(`</${lower}`, i);
            i = e < 0 ? html.length : e;
        }
    }
}
/**
 * Split a snippet at its holes, without a DOM, for server rendering (o2h): what builtIns.tree finds
 * with the browser's parser, for **well-formed author markup**: quoted or unquoted attributes,
 * explicit end tags for holes and their contents (no implied end tags, e.g. an unclosed `<p>` or
 * `<li>`), and `/>` only on void elements or inside SVG / MathML. Refuses, as builtIns.tree does: a
 * hole inside another hole, a hole inside a `<template>`, and two holes with the same name.
 */
export function snippetParts(html) {
    const parts = [];
    const open = [];
    const names = new Set();
    let textStart = 0;
    const it = tokens(html);
    for (let next = it.next(); !next.done; next = it.next()) {
        const token = next.value;
        if (token.kind === 'end') {
            const k = open.lastIndexOf(token.name.toLowerCase());
            if (k >= 0)
                open.length = k;
            continue;
        }
        const holeAttr = token.attrs.find(a => a.name.toLowerCase() === HOLE);
        if (!holeAttr) {
            if (!token.closed)
                open.push(token.name.toLowerCase());
            continue;
        }
        const hole = holeAttr.value;
        if (names.has(hole))
            throw new Error(`snippet: two holes named "${hole}"`);
        names.add(hole);
        if (open.includes('template'))
            throw new Error(`snippet: a hole ("${hole}") inside a <template>, which isn't supported (yet)`);
        // Its end tag: each element opened inside it must be closed by name first
        let close;
        if (!token.closed) {
            const inside = [];
            for (let inner = it.next(); !inner.done; inner = it.next()) {
                const t = inner.value;
                const name = t.name.toLowerCase();
                if (t.kind === 'start') {
                    if (t.attrs.some(a => a.name.toLowerCase() === HOLE))
                        throw new Error(`snippet: a hole inside the hole "${hole}", which isn't supported`);
                    if (!t.closed)
                        inside.push(name);
                }
                else if (inside.length > 0 && inside[inside.length - 1] === name) {
                    inside.pop();
                }
                else if (inside.length === 0 && name === token.name.toLowerCase()) {
                    close = t;
                    break;
                }
                else {
                    throw new Error(`snippet: </${t.name}> in the hole "${hole}" where ${inside.length > 0 ? `<${inside[inside.length - 1]}>` : `<${token.name}>`} is open: holes and their contents must be well-formed (explicit end tags)`);
                }
            }
            if (!close)
                throw new Error(`snippet: the hole "${hole}" (<${token.name}>) has no end tag`);
        }
        if (token.start > textStart)
            parts.push(html.slice(textStart, token.start));
        parts.push({
            hole,
            tag: token.name,
            attrs: token.attrs.filter(a => a !== holeAttr).map(a => [a.name, a.value]),
            open: html.slice(token.start, holeAttr.start) + html.slice(holeAttr.end, token.end),
            fallback: close ? html.slice(token.end, close.start) : '',
            close: close ? html.slice(close.start, close.end) : '',
        });
        textStart = close ? close.end : token.end;
    }
    if (textStart < html.length)
        parts.push(html.slice(textStart));
    return parts;
}
