/**
 * Element-specification helpers shared by builtIns.tree and compileTree.
 *
 * Pure: no DOM access, so compileTree can run on a server.
 */

import { isFromStackReference } from '../resolve/getValues.js';
import type {
    ElementSpecification, NestedTreeSpecification, NormalizedSpec, Pattern, RepeatSpecification, SwitchSpecification,
} from '../types/assign-gingerly/treeTypes.js';

/** Whether a specification is a switch (`{ switch, cases, default? }`) rather than an element. */
export function isSwitch(spec: ElementSpecification): spec is SwitchSpecification {
    return !!spec && typeof spec === 'object' && !Array.isArray(spec) && 'switch' in spec;
}

/** Check a switch's shape, so a malformed one fails with a clear message. */
export function checkSwitch(spec: SwitchSpecification): void {
    const { switch: on, cases } = spec;
    if (typeof on !== 'string') throw new Error('builtIns.tree: a switch needs a "switch" path, e.g. { switch: \'?.status\', cases: { … } }');
    if (!cases || typeof cases !== 'object' || Array.isArray(cases)) {
        throw new Error('builtIns.tree: a switch needs a "cases" object of case → specification');
    }
}

/** The map key whose specification applies to VM keys the map doesn't name. */
export const WILDCARD = '*';

/** The pattern a `'*'` specification gets when it has none. */
export const DEFAULT_WILDCARD_PATTERN: Pattern = { textContent: '?.' };

/** `{ textContent: text }` patterns for string shorthand, one object per string (so pattern caches hit). */
const textPatterns = new Map<string, Pattern>();

/** A string in the pattern slot is shorthand for `{ textContent: string }`. */
function textPattern(text: string): Pattern {
    let pattern = textPatterns.get(text);
    if (!pattern) {
        pattern = { textContent: text };
        textPatterns.set(text, pattern);
    }
    return pattern;
}

export function normalize(spec: ElementSpecification): NormalizedSpec {
    // Switches are resolved to a case before anything normalizes them
    if (isSwitch(spec)) throw new Error('builtIns.tree: a switch has no element of its own to normalize');
    const [header, patternOrText, third] = Array.isArray(spec) ? spec : [spec];
    const pattern = typeof patternOrText === 'string' ? textPattern(patternOrText) : patternOrText;
    // The children slot: an array of static children, a repeat object ({ each, … }) or a nested tree ({ map, … })
    let children: ElementSpecification[] = [];
    let repeat: RepeatSpecification | undefined;
    let nested: NestedTreeSpecification | undefined;
    if (Array.isArray(third)) {
        children = third;
    } else if (third !== undefined) {
        if (third && typeof third === 'object' && 'each' in third) {
            repeat = third;
        } else if (third && typeof third === 'object' && 'map' in third) {
            nested = third;
        } else {
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
const wildcardSpecs = new WeakMap<object, { source: ElementSpecification; spec: ElementSpecification }>();

/**
 * The specification for VM keys a map doesn't name: the map's `'*'` specification, with
 * the default pattern when it has none. One shared object per map (not per key or call),
 * so spec identity holds across calls, as it does for named keys.
 */
export function wildcardSpecOf(map: Record<string, ElementSpecification>): ElementSpecification {
    const source = map[WILDCARD];
    // A switch keeps its cases as written (the default pattern is for a bare element)
    if (isSwitch(source)) return source;
    const cached = wildcardSpecs.get(map);
    if (cached?.source === source) return cached.spec;
    const [header, , , pattern = DEFAULT_WILDCARD_PATTERN, children, repeat, nested] = normalize(source);
    const spec = [header, pattern, repeat ?? nested ?? children] as ElementSpecification;
    wildcardSpecs.set(map, { source, spec });
    return spec;
}

/** Whether a string RHS is a plain literal (not a reference, negation or protocol). */
export function isLiteralString(value: string): boolean {
    return !(value.startsWith('?.') || value.startsWith('$0') || isFromStackReference(value)
        || value.startsWith('!') || value.includes('://'));
}

// ── Structural decisions: what renders ───────────────────────────────────────
//
// Pure, so builtIns.tree and anything rendering the same specs elsewhere (a server-side
// stringifier, say) decide the same things the same way. Path resolution is passed in, so
// each caller resolves with its own options (pipes, aka, $parent, protocols …).

/**
 * Resolves a path (`'?.a?.b'`, `'$parent?.x'`, …) against a value. `forItem` is true for a
 * repeat's item keys, which resolve one level down (the array's holder is on the stack).
 */
export type TreePathResolver = (path: string, from: any, forItem?: boolean) => any;

/** One rendered map entry: its VM key, its specification and value, and the template id (`'*'` for wildcard keys). */
export interface TreeMapEntry {
    key: string;
    spec: ElementSpecification;
    value: any;
    templateKey: string;
}

/**
 * The map's entries that render, in render order: map order, then `'*'` for the VM keys
 * the map doesn't name (in VM key order). Keys whose value is null / undefined are left
 * out, unless `keepNullish`.
 */
export function mapEntries(map: Record<string, ElementSpecification>, from: any, keepNullish = false): TreeMapEntry[] {
    const entries: TreeMapEntry[] = [];
    const push = (key: string, spec: ElementSpecification, templateKey: string) => {
        const value = from?.[key];
        if (value == null && !keepNullish) return;
        entries.push({ key, spec, value, templateKey });
    };
    for (const key of Object.keys(map)) {
        if (key !== WILDCARD) push(key, map[key], key);
    }
    if (map[WILDCARD] === undefined || from === null || typeof from !== 'object') return entries;
    const wildcardSpec = wildcardSpecOf(map);
    for (const key of Object.keys(from)) {
        if (!(key in map)) push(key, wildcardSpec, WILDCARD);
    }
    return entries;
}

/** A switch's `default`, as a case key (can't collide with a `cases` key). */
export const DEFAULT_CASE: unique symbol = Symbol('builtIns.tree default case') as any;

/**
 * The case a switch picks for `value`: the discriminant (resolved against `value`) matched
 * with `String(…)` against the `cases` keys; nullish or unmatched → `default`. `spec` is
 * null / undefined when nothing renders.
 */
export function chooseCase(
    spec: SwitchSpecification, value: any, resolve: TreePathResolver
): { caseKey: string | typeof DEFAULT_CASE; spec: ElementSpecification | null | undefined } {
    checkSwitch(spec);
    const { switch: on, cases, default: fallback } = spec;
    const discriminant = resolve(on, value);
    const caseName = discriminant == null ? undefined : String(discriminant);
    if (caseName !== undefined && Object.hasOwn(cases, caseName)) return { caseKey: caseName, spec: cases[caseName] };
    return { caseKey: DEFAULT_CASE, spec: fallback };
}

/** What a repeat stamps for a value. `items[i]` is identified by `keys[i]`. */
export interface RepeatItems {
    items: any[];
    keys: unknown[];
    /** The first key that occurred twice (those items fall back to their index), for a warning */
    duplicate?: unknown;
    /** `empty`'s specification, when there are no items and it has one */
    empty?: ElementSpecification;
    /** Whether items resolve one level down: `of` isn't `'?.'`, so the value (the array's holder) goes on the stack */
    pushesHolder: boolean;
}

/**
 * The items a repeat stamps for `value`: the iterable at `of` (default `'?.'`, the value
 * itself; anything nullish or not iterable counts as empty), each identified by its `key`
 * (default: its index). A duplicate key falls back to `Symbol.for('builtIns.tree:index:<i>')`.
 */
export function repeatItems(repeat: RepeatSpecification, value: any, resolve: TreePathResolver): RepeatItems {
    const { of = '?.', key, empty } = repeat;
    const list = resolve(of, value);
    const items: any[] = list != null && typeof list[Symbol.iterator] === 'function' ? Array.from(list) : [];
    const keys: unknown[] = new Array(items.length);
    const seen = new Set<unknown>();
    let duplicate: unknown;
    let hasDuplicate = false;
    for (let index = 0; index < items.length; index++) {
        let itemKey: unknown = key === undefined ? index : resolve(key, items[index], true);
        if (seen.has(itemKey)) {
            if (!hasDuplicate) { hasDuplicate = true; duplicate = itemKey; }
            itemKey = Symbol.for(`builtIns.tree:index:${index}`);
        }
        seen.add(itemKey);
        keys[index] = itemKey;
    }
    const result: RepeatItems = { items, keys, pushesHolder: of !== '?.' };
    if (hasDuplicate) result.duplicate = duplicate;
    if (items.length === 0 && empty !== undefined) result.empty = empty;
    return result;
}
