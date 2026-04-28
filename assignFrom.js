/**
 * Resolve RHS path strings against a source object, then assign the
 * resolved values into a target using assignGingerly.
 *
 * Combines resolveValues + assignGingerly into a single call.
 * Inherits all assignGingerly options (withMethods, aka, signal, etc.).
 *
 * @param target - Object to merge resolved values into
 * @param pattern - Object whose RHS values may contain `?.` path strings
 * @param options - Options including `from` (source object) and any assignGingerly options
 * @returns The target object after merging
 *
 * @example
 * const source = { theme: { color: 'red' }, label: 'Hello' };
 * const target = { color: 'blue', text: '' };
 * assignFrom(target, {
 *   color: '?.theme?.color',
 *   text: '?.label'
 * }, { from: source });
 * // target is now { color: 'red', text: 'Hello' }
 */
import { resolveValues } from './resolveValues.js';
import assignGingerly from './assignGingerly.js';
export function assignFrom(target, pattern, options) {
    const resolved = resolveValues(pattern, options.from);
    return assignGingerly(target, resolved, options);
}
