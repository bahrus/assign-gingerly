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
export async function assignFrom(target, pattern, options) {
    const resolved = await resolveValues(pattern, options.from, {
        withMethods: options.withMethods,
        aka: options.aka,
        protocols: options.protocols
    });
    // Recursively handle "..." spread keys at all nesting levels
    handleSpreads(resolved);
    return assignGingerly(target, resolved, options);
}
/**
 * Recursively walk an object and handle "..." spread keys.
 * When a "..." key is found, its value (which should be an object after protocol resolution)
 * is spread into the parent, replacing the "..." entry.
 */
function handleSpreads(obj) {
    for (const [key, value] of Object.entries(obj)) {
        if (key !== '...' && typeof value === 'object' && value !== null && !Array.isArray(value)) {
            const proto = Object.getPrototypeOf(value);
            if (proto === Object.prototype || proto === null) {
                obj[key] = handleSpreads(value);
            }
        }
    }
    if ('...' in obj) {
        const spreadValue = obj['...'];
        delete obj['...'];
        if (spreadValue && typeof spreadValue === 'object') {
            Object.assign(obj, spreadValue);
        }
    }
    return obj;
}
