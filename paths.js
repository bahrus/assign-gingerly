/**
 * paths.js — Typed path proxy and template tag for assignFrom authoring.
 *
 * Provides compile-time autocomplete and type safety for `?.`-prefixed path strings.
 *
 * @example
 * import { paths, sp } from 'assign-gingerly/paths.js';
 *
 * const $ = paths();
 *
 * // Use sp (split into parts) to create arrays for builtIns.join:
 * const value = sp`${$.lastName}, ${$.firstName}`;
 * // ['?.lastName', ', ', '?.firstName']
 *
 * // Use .path for raw string contexts (object keys, plain arrays):
 * const key = $.textContent.path;  // '?.textContent'
 */

/**
 * Symbol used internally to detect path proxy objects.
 * The sp tag function uses this to auto-extract path strings from proxies.
 */
const PATH_SYMBOL = Symbol('assign-gingerly-path');

/**
 * Create a recursive proxy that records property access paths.
 * Each property access returns a new proxy with the accumulated path.
 * `.path` (or the internal PATH_SYMBOL) returns the `?.`-prefixed path string.
 */
function createPathProxy(prefix) {
    return new Proxy({}, {
        get(_, prop) {
            if (prop === 'path' || prop === PATH_SYMBOL) {
                return prefix.length > 0 ? `?.${prefix}` : '?.';
            }
            // Ignore symbol access (Symbol.iterator, Symbol.toPrimitive, etc.)
            if (typeof prop === 'symbol') return undefined;
            const newPath = prefix ? `${prefix}?.${prop}` : String(prop);
            return createPathProxy(newPath);
        }
    });
}

/**
 * Create a typed path proxy for a given interface/type.
 * Property accesses on the returned proxy produce `?.`-prefixed path strings.
 *
 * @example
 * const $ = paths();
 * $.lastName.path          // '?.lastName'
 * $.address.city.path      // '?.address?.city'
 *
 * // Inside sp template literals, .path is not needed:
 * sp`${$.lastName}, ${$.firstName}`  // ['?.lastName', ', ', '?.firstName']
 */
export function paths() {
    return createPathProxy('');
}

/**
 * Tagged template literal that splits a template into an array of parts.
 * Interleaves static string segments with interpolated values.
 *
 * Path proxy objects are auto-detected and converted to their `?.`-prefixed
 * string representation — no `.path` call needed inside sp template literals.
 *
 * Arrays passed as interpolations are preserved as nested arrays (for
 * all-or-nothing optional segments in builtIns.join).
 *
 * @example
 * const $ = paths();
 *
 * // Basic usage:
 * sp`${$.lastName}, ${$.firstName}`
 * // ['?.lastName', ', ', '?.firstName']
 *
 * // With optional segment (nested array, all-or-nothing in join):
 * sp`${$.lastName}${[', ', $.middleName]}, ${$.firstName}`
 * // ['?.lastName', [', ', '?.middleName'], ', ', '?.firstName']
 */
export function sp(strings, ...values) {
    const result = [];
    for (let i = 0; i < strings.length; i++) {
        if (strings[i]) result.push(strings[i]);
        if (i < values.length) {
            const v = values[i];
            if (v && typeof v === 'object' && PATH_SYMBOL in v) {
                // Auto-extract path from proxy object
                result.push(v[PATH_SYMBOL]);
            }
            else if (Array.isArray(v)) {
                // Nested array — recursively extract paths from proxy elements
                result.push(v.map(el =>
                    el && typeof el === 'object' && PATH_SYMBOL in el ? el[PATH_SYMBOL] : el
                ));
            }
            else {
                result.push(v);
            }
        }
    }
    return result;
}
