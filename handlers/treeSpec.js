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
export function normalize(spec) {
    // Switches are resolved to a case before anything normalizes them
    if (isSwitch(spec))
        throw new Error('builtIns.tree: a switch has no element of its own to normalize');
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
    // A switch keeps its cases as written (the default pattern is for a bare element)
    if (isSwitch(source))
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
/**
 * The map's entries that render, in render order: map order, then `'*'` for the VM keys
 * the map doesn't name (in VM key order). Keys whose value is null / undefined are left
 * out, unless `keepNullish`.
 */
export function mapEntries(map, from, keepNullish = false) {
    const entries = [];
    const push = (key, spec, templateKey) => {
        const value = from?.[key];
        if (value == null && !keepNullish)
            return;
        entries.push({ key, spec, value, templateKey });
    };
    for (const key of Object.keys(map)) {
        if (key !== WILDCARD)
            push(key, map[key], key);
    }
    if (map[WILDCARD] === undefined || from === null || typeof from !== 'object')
        return entries;
    const wildcardSpec = wildcardSpecOf(map);
    for (const key of Object.keys(from)) {
        if (!(key in map))
            push(key, wildcardSpec, WILDCARD);
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
