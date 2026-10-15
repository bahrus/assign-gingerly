/**
 * Element-specification helpers shared by builtIns.tree and compileTree.
 *
 * Pure: no DOM access, so compileTree can run on a server.
 */

import { isFromStackReference } from '../resolve/getValues.js';
import type { ElementSpecification, NormalizedSpec, Pattern, RepeatSpecification } from '../types/assign-gingerly/treeTypes.js';

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
    // The children slot: an array of static children, or a repeat object ({ each, … })
    let children: ElementSpecification[] = [];
    let repeat: RepeatSpecification | undefined;
    if (Array.isArray(third)) {
        children = third;
    } else if (third !== undefined) {
        if (!third || typeof third !== 'object' || !('each' in third)) {
            throw new Error('builtIns.tree: the children slot must be an array of specifications or a repeat object { each, … }');
        }
        repeat = third;
    }
    if (typeof header === 'string') {
        if (header.startsWith('$:')) {
            throw new Error(`builtIns.tree: itemscope manager headers ("${header}") are not supported yet; use { tag, ish: '${header.slice(2)}' }`);
        }
        return [header, header, undefined, pattern, children, repeat];
    }
    if (typeof header === 'function') {
        throw new Error('builtIns.tree: class headers are not supported yet; use { tag, ish: Class }');
    }
    if (header && typeof header === 'object' && typeof header.tag === 'string') {
        return [header, header.tag, header.ish, pattern, children, repeat];
    }
    throw new Error('builtIns.tree: an element header must be a tag name or { tag, ish? }');
}

/** Whether a string RHS is a plain literal (not a reference, negation or protocol). */
export function isLiteralString(value: string): boolean {
    return !(value.startsWith('?.') || value.startsWith('$0') || isFromStackReference(value)
        || value.startsWith('!') || value.includes('://'));
}
