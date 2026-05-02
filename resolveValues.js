/**
 * Resolve RHS path strings in a pattern object against a source object.
 *
 * Any value that is a string starting with `?.` is treated as a path
 * and resolved against the source object using optional chaining semantics.
 * Non-string values and strings not starting with `?.` pass through unchanged.
 *
 * @param pattern - Object whose RHS values may contain `?.` path strings
 * @param source - Object to resolve paths against
 * @returns New object with path strings replaced by resolved values
 *
 * @example
 * const pattern = {
 *   hello: '?.myPropContainer?.stringProp',
 *   foo: '?.myFooString',
 *   literal: 42
 * };
 * const source = {
 *   myPropContainer: { stringProp: 'Venus' },
 *   myFooString: 'bar'
 * };
 * const result = resolveValues(pattern, source);
 * // { hello: 'Venus', foo: 'bar', literal: 42 }
 */
export function resolveValues(pattern, source) {
    const result = {};
    for (const [key, value] of Object.entries(pattern)) {
        if (typeof value === 'string' && value.startsWith('?.')) {
            // Parse path: split on '?.' delimiter, filter empties
            // Use '?.' as the sole delimiter to preserve dots in values (e.g., CSS selectors)
            // Special case: '?.' alone (empty path) resolves to the source object itself
            const parts = value.split('?.').filter(p => p.length > 0);
            let current = source;
            for (const part of parts) {
                if (current == null)
                    break;
                current = current[part];
            }
            result[key] = current;
        }
        else {
            result[key] = value;
        }
    }
    return result;
}
