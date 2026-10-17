/**
 * tree`…` — a lit-like tagged template that produces builtIns.tree element specifications.
 *
 * Authoring sugar only: the result is ordinary tree notation (`[header, pattern, children]`),
 * which stays the canonical, serializable form. Mapping, close to lit's:
 *
 * | In the template                      | Becomes                                               |
 * |--------------------------------------|-------------------------------------------------------|
 * | `name="literal"`, `name` (boolean)   | `'name :=': 'literal'` / `true` (baked under compile) |
 * | `name=${value}`                      | `'name :=': value`                                    |
 * | `.prop=${value}`                     | `prop: value` (a property)                            |
 * | `@click=${{ call: 'm' }}` / `${'m'}` | `' +=': { on: 'click', call: 'm' }` (event binding)   |
 * | `ish=${Manager}`                     | the `{ tag, ish }` header                             |
 * | `${each(of, { key, empty })}`        | the repeat `{ each, of, key, empty }` (one child)     |
 * | `${{ '_ ?=': […] }}` (attribute pos.) | merged into the pattern: any key markup can't express |
 * | `${null / undefined / false / ''}`   | nothing, as content (e.g. an optional child)          |
 * | text only / one `${value}` as content | `textContent: …`                                     |
 * | text mixed with `${…}`               | `'?. =&': { microJoin: [...] }`                       |
 * | `${tree`…`}` as content              | a child element (composition)                         |
 *
 * `${…}` values may be `?.` strings or `paths()` proxies (converted to their path).
 * Whitespace-only text between elements is dropped, and an element's content is trimmed
 * where the whitespace contains a line break (indentation). Elements may contain text or
 * elements, not both (except a leading text before the children, as in tree notation).
 *
 * Results are cached per call site: the same template with the same values returns the
 * same specification object, so builtIns.tree's spec identity (compile, literal skipping on
 * rebind) holds across calls.
 *
 * Parsed with a small parser of its own (not the browser's HTML parser, which would insert
 * `<tbody>`, auto-close `<p>`, etc.), so it also runs on a server.
 *
 * @example
 * const p = paths<Launch>();
 * const map = {
 *     launch: tree`
 *         <article class="card" aria-label=${p.label}>
 *             <h3 class="title">${p.name}</h3>
 *             <p>Launched ${p.date} by ${p.rocket}</p>
 *             <ul ${each(p.crew, { key: '?.id' })}><li>${'?.name'}</li></ul>
 *         </article>`,
 * };
 */

import { pathOf } from './paths.js';
import type { EachDirective, EachOptions, ElementSpecification, Pattern } from '../types/assign-gingerly/treeTypes.js';

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const HOLE = /(\d+)/g;
const SELF_EVENT_KEYS = [' +=', '?. +='];

/** A `${…}` position in the template. */
interface Hole {
    hole: number;
}

type Part = string | Hole;

interface ParsedElement {
    tag: string;
    attrs: { name: string; parts: Part[] | true }[];
    /** Values placed in attribute position (e.g. each()) */
    directives: number[];
    children: (ParsedElement | Part[])[];
}

/** Specifications this tag produced, so `${tree`…`}` in content is recognized as a child. */
const treeResults = new WeakSet<object>();

const cache = new WeakMap<TemplateStringsArray, { values: any[]; spec: ElementSpecification }>();

/** Make an element a repeat: `<ul ${each('?.items', { key: '?.id' })}><li>…</li></ul>`. */
export function each(of: any = '?.', options: EachOptions = {}): EachDirective {
    const { key, empty } = options;
    const directive: EachDirective = { kind: 'each', of: pathOf(of) ?? of };
    if (key !== undefined) directive.key = pathOf(key) ?? key;
    if (empty !== undefined) directive.empty = empty;
    return directive;
}

export function tree(strings: TemplateStringsArray, ...values: any[]): ElementSpecification {
    const cached = cache.get(strings);
    if (cached && sameValues(cached.values, values)) return cached.spec;
    const source = strings.reduce((text, s, i) => text + s + (i < values.length ? `${i}` : ''), '');
    const roots = parse(source).filter(node => !isBlankText(node));
    if (roots.length !== 1 || Array.isArray(roots[0])) {
        throw new Error(`tree\`…\`: expected exactly one root element in:\n${preview(strings)}`);
    }
    const spec = toSpec(roots[0] as ParsedElement, values, strings);
    treeResults.add(spec as object);
    cache.set(strings, { values, spec });
    return spec;
}

// ── Parsing ──────────────────────────────────────────────────────────────────

function parse(source: string): (ParsedElement | Part[])[] {
    const root: ParsedElement = { tag: '#root', attrs: [], directives: [], children: [] };
    const stack: ParsedElement[] = [root];
    let pos = 0;
    let text = '';
    const flushText = () => {
        if (text) stack[stack.length - 1].children.push(splitHoles(text));
        text = '';
    };
    while (pos < source.length) {
        const ch = source[pos];
        if (ch === '<' && source.startsWith('<!--', pos)) {
            const end = source.indexOf('-->', pos + 4);
            if (end < 0) throw new Error('tree`…`: unclosed comment');
            pos = end + 3;
            continue;
        }
        if (ch === '<' && source[pos + 1] === '/') {
            flushText();
            const end = source.indexOf('>', pos);
            const tag = source.slice(pos + 2, end).trim();
            const open = stack.pop()!;
            if (open === root || open.tag !== tag) {
                throw new Error(`tree\`…\`: </${tag}> doesn't match <${open === root ? '(none)' : open.tag}>`);
            }
            pos = end + 1;
            continue;
        }
        if (ch === '<' && /[A-Za-z]/.test(source[pos + 1] ?? '')) {
            flushText();
            pos = parseOpenTag(source, pos, stack);
            continue;
        }
        if (ch === '<' && source[pos + 1] === '') {
            throw new Error('tree`…`: a ${} tag name is not supported');
        }
        text += ch;
        pos++;
    }
    flushText();
    if (stack.length > 1) throw new Error(`tree\`…\`: <${stack[stack.length - 1].tag}> is not closed`);
    return root.children;
}

/** Parse `<tag attrs…>` at `pos`; pushes the element (and onto the stack unless void/self-closing). */
function parseOpenTag(source: string, pos: number, stack: ParsedElement[]): number {
    const tagMatch = /^<([A-Za-z][\w:.-]*)/.exec(source.slice(pos));
    const tag = tagMatch![1];
    const element: ParsedElement = { tag, attrs: [], directives: [], children: [] };
    pos += tagMatch![0].length;
    for (;;) {
        while (/\s/.test(source[pos] ?? '')) pos++;
        if (pos >= source.length) throw new Error(`tree\`…\`: <${tag} is not closed`);
        if (source[pos] === '>') { pos++; break; }
        if (source.startsWith('/>', pos)) {
            pos += 2;
            stack[stack.length - 1].children.push(element);
            return pos;
        }
        const hole = /^(\d+)/.exec(source.slice(pos));
        if (hole) {
            element.directives.push(Number(hole[1]));
            pos += hole[0].length;
            continue;
        }
        const nameMatch = /^[^\s=>/]+/.exec(source.slice(pos));
        if (!nameMatch) throw new Error(`tree\`…\`: unexpected "${source[pos]}" in <${tag}>`);
        const name = nameMatch[0];
        pos += name.length;
        while (/\s/.test(source[pos] ?? '')) pos++;
        if (source[pos] !== '=') {
            element.attrs.push({ name, parts: true });
            continue;
        }
        pos++;
        while (/\s/.test(source[pos] ?? '')) pos++;
        let raw: string;
        const quote = source[pos];
        if (quote === '"' || quote === "'") {
            const end = source.indexOf(quote, pos + 1);
            if (end < 0) throw new Error(`tree\`…\`: unclosed attribute value in <${tag}>`);
            raw = source.slice(pos + 1, end);
            pos = end + 1;
        } else {
            const match = /^[^\s>]+/.exec(source.slice(pos))!;
            raw = match[0];
            pos += raw.length;
        }
        element.attrs.push({ name, parts: splitHoles(raw) });
    }
    stack[stack.length - 1].children.push(element);
    if (!VOID_TAGS.has(tag.toLowerCase())) stack.push(element);
    return pos;
}

/** Split text into literal strings (entities decoded) and holes. */
function splitHoles(raw: string): Part[] {
    const parts: Part[] = [];
    let last = 0;
    for (const match of raw.matchAll(HOLE)) {
        const literal = decodeEntities(raw.slice(last, match.index));
        if (literal) parts.push(literal);
        parts.push({ hole: Number(match[1]) });
        last = match.index! + match[0].length;
    }
    const tail = decodeEntities(raw.slice(last));
    if (tail) parts.push(tail);
    return parts;
}

const NAMED_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decodeEntities(text: string): string {
    return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, body: string) => {
        if (body[0] === '#') {
            const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
            return Number.isFinite(code) ? String.fromCodePoint(code) : entity;
        }
        return NAMED_ENTITIES[body.toLowerCase()] ?? entity;
    });
}

// ── Conversion to tree notation ──────────────────────────────────────────────

const isHole = (part: Part): part is Hole => typeof part === 'object';
const isBlankText = (node: ParsedElement | Part[]) => Array.isArray(node) && node.every(part => typeof part === 'string' && !part.trim());
const isEachDirective = (value: any): value is EachDirective => !!value && typeof value === 'object' && value.kind === 'each';
const isTreeResult = (value: any) => !!value && typeof value === 'object' && treeResults.has(value);
const isNothing = (value: any) => value == null || value === false || value === '';
const isPlainObject = (value: any) => !!value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
/** A `${…}` value as it goes into a pattern: a paths() proxy becomes its `?.` string. */
const valueOf = (value: any) => pathOf(value) ?? value;

function toSpec(element: ParsedElement, values: any[], strings: TemplateStringsArray): ElementSpecification {
    const { tag } = element;
    const fail = (message: string): never => { throw new Error(`tree\`…\`: <${tag}>: ${message} in:\n${preview(strings)}`); };
    const pattern: Pattern = {};
    let ish: any;
    let events = 0;

    for (const { name, parts } of element.attrs) {
        const value = parts === true ? true : attributeValue(parts, values, fail, name);
        if (name === 'ish') {
            ish = value;
        } else if (name.startsWith('.')) {
            pattern[name.slice(1)] = value;
        } else if (name.startsWith('@')) {
            const on = name.slice(1);
            const config = typeof value === 'string' ? { call: value }
                : value && typeof value === 'object' ? value
                : fail(`@${on} needs an event config object (e.g. { call: 'method' }) or a method name`);
            const key = SELF_EVENT_KEYS[events++] ?? fail('at most two @event bindings per element are supported');
            pattern[key] = { on, ...config };
        } else {
            pattern[`${name} :=`] = value;
        }
    }

    let repeat: Record<string, any> | undefined;
    for (const index of element.directives) {
        const directive = values[index];
        if (isEachDirective(directive)) {
            if (repeat) fail('only one each(…) per element');
            repeat = { of: directive.of };
            if (directive.key !== undefined) repeat.key = directive.key;
            if (directive.empty !== undefined) repeat.empty = directive.empty;
        } else if (isPlainObject(directive)) {
            // A pattern spread: any keys the markup can't express (e.g. '_ ?=' ternaries, ' =>' handlers)
            for (const key of Object.keys(directive)) pattern[key] = valueOf(directive[key]);
        } else {
            fail('only each(…) or a pattern object can be placed in attribute position');
        }
    }

    const content = element.children.filter(node => !isBlankText(node));
    const header = ish === undefined ? tag : { tag, ish };
    let third: ElementSpecification[] | Record<string, any> | undefined;

    // Children: elements, and ${tree`…`} values in content; text before the first child is the element's own
    const children: ElementSpecification[] = [];
    const textParts: Part[] = [];
    for (const node of content) {
        if (!Array.isArray(node)) {
            children.push(toSpec(node, values, strings));
            continue;
        }
        for (const part of node) {
            // Nothing to render (as in lit): null, undefined, false or ''
            if (isHole(part) && isNothing(values[part.hole])) continue;
            if (isHole(part) && isTreeResult(values[part.hole])) {
                children.push(values[part.hole]);
            } else if (children.length > 0) {
                if (isHole(part) || part.trim()) fail('text after a child element isn\'t supported (wrap the text in an element)');
            } else {
                textParts.push(part);
            }
        }
    }
    const ownText = trimFormatting(textParts);
    if (repeat) {
        if (children.length !== 1 || ownText.length > 0) fail('an element with each(…) must contain exactly one child element (the item)');
        third = { each: children[0], ...repeat };
    } else {
        applyText(ownText, children.length > 0, pattern, values, fail);
        if (children.length > 0) third = children;
    }

    return (third ? [header, pattern, third] : [header, pattern]) as ElementSpecification;
}

/** An attribute's value: a literal string, or one `${…}` (as its value). Mixed text and `${}` isn't supported. */
function attributeValue(parts: Part[], values: any[], fail: (message: string) => never, name: string): any {
    if (parts.length === 0) return '';
    if (parts.length === 1) return isHole(parts[0]) ? valueOf(values[parts[0].hole]) : parts[0];
    return fail(`attribute "${name}" mixes text and \${…}; use a single \${…} (e.g. a pipe, or a computed value)`);
}

/** Drop leading/trailing whitespace that contains a line break (template indentation). */
function trimFormatting(parts: Part[]): Part[] {
    const result = [...parts];
    if (typeof result[0] === 'string') result[0] = result[0].replace(/^\s*\n\s*/, '');
    const last = result.length - 1;
    if (last >= 0 && typeof result[last] === 'string') result[last] = (result[last] as string).replace(/\s*\n\s*$/, '');
    return result.filter(part => part !== '');
}

/**
 * An element's own text: literal text or one `${…}` → textContent; text mixed with `${…}` →
 * microJoin (so values become elements; groundwork for hydrating server-rendered markup).
 * With child elements, only a leading literal text is possible (as in tree notation).
 */
function applyText(parts: Part[], hasChildren: boolean, pattern: Pattern, values: any[], fail: (message: string) => never): void {
    if (parts.length === 0) return;
    const holes = parts.filter(isHole);
    if (hasChildren && holes.length > 0) fail('${…} text next to child elements isn\'t supported (wrap it in an element)');
    if (holes.length === 0) {
        pattern.textContent = (parts as string[]).join('');
        return;
    }
    if (parts.length === 1) {
        const value = valueOf(values[holes[0].hole]);
        // A microJoin segment ({ prop, val }, e.g. from md) still needs microJoin
        if (value && typeof value === 'object' && 'prop' in value) {
            pattern['?. =&'] = { microJoin: [segmentOf(value)] };
        } else {
            pattern.textContent = value;
        }
        return;
    }
    pattern['?. =&'] = { microJoin: parts.map(part => (isHole(part) ? segmentOf(valueOf(values[part.hole])) : part)) };
}

/** A microJoin item: paths stay strings; { prop, val } segments get their val's path. */
function segmentOf(value: any): any {
    if (value && typeof value === 'object' && 'prop' in value && pathOf(value.val)) return { ...value, val: pathOf(value.val) };
    return value;
}

// ── Caching ──────────────────────────────────────────────────────────────────

function sameValues(a: any[], b: any[]): boolean {
    return a.length === b.length && a.every((value, i) => sameValue(value, b[i]));
}

/** Same value for caching: identical, the same path, or plain objects/arrays with the same entries (one level). */
function sameValue(a: any, b: any): boolean {
    if (a === b) return true;
    const pathA = pathOf(a);
    if (pathA !== undefined) return pathA === pathOf(b);
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b) || Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false;
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    return keysA.length === keysB.length && keysA.every(key => {
        const x = a[key];
        const y = b[key];
        return x === y || (pathOf(x) !== undefined && pathOf(x) === pathOf(y));
    });
}

function preview(strings: TemplateStringsArray): string {
    const text = strings.join('${…}').trim();
    return text.length > 300 ? `${text.slice(0, 300)}…` : text;
}
