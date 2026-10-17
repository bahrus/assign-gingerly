/**
 * Element-specification helpers shared by builtIns.tree and compileTree.
 *
 * Pure: no DOM access, so compileTree can run on a server.
 */

import { isFromStackReference } from '../resolve/getValues.js';
import type {
    ElementSpecification, NestedTreeSpecification, NormalizedSpec, Pattern, RepeatSpecification,
} from '../types/assign-gingerly/treeTypes.js';

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
