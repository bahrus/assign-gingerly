/**
 * join — synchronous compute op for the ` =&` operator.
 *
 * Joins a resolved array into a single string. Supports nested sub-arrays
 * with "all-or-nothing" semantics: if any element in a nested sub-array
 * resolves to null/undefined, the entire sub-array is dropped.
 *
 * This is the sync-op successor to the old `builtIns.join` handler (which lived
 * behind the async ` =>` pipeline). Unlike a handler, an op is a plain function —
 * no class, no dynamic import, no await anywhere in its path.
 *
 * @example
 * assignFrom(oElement, {
 *     '?.textContent =&': {
 *         join: ['?.lastName', ', ', '?.firstName']
 *     }
 * }, { from: vm });
 *
 * @example
 * // With optional segment (all-or-nothing) and a separator:
 * assignFrom(oElement, {
 *     '?.textContent =&': {
 *         join: ['?.lastName', ['?.middleName'], '?.firstName'],
 *         separator: ', '
 *     }
 * }, { from: vm });
 * // If middleName is undefined, the sub-array ['?.middleName'] is dropped entirely.
 */

/**
 * Process nested arrays with all-or-nothing null semantics.
 * - Top-level null/undefined values are filtered out.
 * - If a nested sub-array contains any null/undefined element, the entire sub-array is dropped.
 * - Nested sub-arrays that pass are flattened into the result.
 */
function processValue(value: any[]): any[] {
    const result: any[] = [];
    for (const item of value) {
        if (Array.isArray(item)) {
            // All-or-nothing: if any element is null/undefined, drop the entire sub-array
            if (item.some(el => el == null)) {
                continue;
            }
            // Sub-array passes — flatten its elements (recursively process nested arrays)
            result.push(...processValue(item));
        } else if (item != null) {
            result.push(item);
        }
        // Top-level null/undefined are silently filtered out
    }
    return result;
}

/**
 * `join` sync op — args is the resolved `join:` array, extra carries sibling
 * config keys (currently just `separator`, default `''`).
 */
export function join(args: any, extra: Record<string, any> = {}): string {
    const { separator = '' } = extra;
    const items = Array.isArray(args) ? processValue(args) : [args];
    return items.join(separator);
}
