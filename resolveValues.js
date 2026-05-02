/**
 * Apply alias substitutions to a path string.
 * Replaces complete tokens between `?.` delimiters with their aliased values.
 */
function applyAliases(path, aliasMap) {
    if (aliasMap.size === 0)
        return path;
    const parts = path.split('?.');
    const substituted = parts.map(part => aliasMap.get(part) ?? part);
    return substituted.join('?.');
}
/**
 * Navigate a path against a source object, optionally calling methods.
 * Returns the resolved value at the end of the path.
 */
function navigatePath(source, parts, withMethods) {
    let current = source;
    let i = 0;
    while (i < parts.length) {
        if (current == null)
            return current;
        const part = parts[i];
        if (withMethods && withMethods.has(part)) {
            const method = current[part];
            if (typeof method === 'function') {
                const nextPart = parts[i + 1];
                if (nextPart !== undefined && !(withMethods.has(nextPart))) {
                    // Call method with next segment as argument, consume it
                    current = method.call(current, nextPart);
                    i += 2;
                }
                else {
                    // Consecutive methods or last segment — call with no args
                    current = method.call(current);
                    i++;
                }
            }
            else {
                current = current[part];
                i++;
            }
        }
        else {
            current = current[part];
            i++;
        }
    }
    return current;
}
/**
 * Resolve RHS path strings in a pattern object against a source object.
 *
 * Any value that is a string starting with `?.` is treated as a path
 * and resolved against the source object using optional chaining semantics.
 * Non-string values and strings not starting with `?.` pass through unchanged.
 *
 * Supports `withMethods` for calling methods during resolution and `aka` for
 * alias substitution, consistent with assignGingerly's LHS path handling.
 *
 * Special case: `'?.'` (empty path) resolves to the source object itself.
 *
 * @param pattern - Object whose RHS values may contain `?.` path strings
 * @param source - Object to resolve paths against
 * @param options - Optional withMethods and aka for method calls and aliases
 * @returns New object with path strings replaced by resolved values
 *
 * @example
 * const result = resolveValues({
 *   hello: '?.myPropContainer?.stringProp',
 *   foo: '?.myFooString',
 *   literal: 42
 * }, source);
 *
 * @example
 * // With methods and aliases
 * const result = resolveValues({
 *   text: '?.q?..username?.textContent'
 * }, source, {
 *   withMethods: ['querySelector'],
 *   aka: { 'q': 'querySelector' }
 * });
 */
export function resolveValues(pattern, source, options) {
    // Build alias map
    const aliasMap = new Map();
    if (options?.aka) {
        for (const [alias, target] of Object.entries(options.aka)) {
            aliasMap.set(alias, target);
        }
    }
    // Build methods set
    const withMethods = options?.withMethods
        ? options.withMethods instanceof Set
            ? options.withMethods
            : new Set(options.withMethods)
        : undefined;
    const result = {};
    for (const [key, value] of Object.entries(pattern)) {
        if (typeof value === 'string' && value.startsWith('?.')) {
            // Apply aliases to the RHS path
            const aliased = applyAliases(value, aliasMap);
            // Parse path: split on '?.' delimiter, filter empties
            const parts = aliased.split('?.').filter(p => p.length > 0);
            // Navigate with method support
            result[key] = parts.length === 0 ? source : navigatePath(source, parts, withMethods);
        }
        else {
            result[key] = value;
        }
    }
    return result;
}
