/**
 * builtIns.join handler for assignFrom.
 * 
 * Joins a resolved array into a single string. Supports nested sub-arrays
 * with "all-or-nothing" semantics: if any element in a nested sub-array
 * resolves to null/undefined, the entire sub-array is dropped.
 * 
 * This handler is auto-loaded by processHandlerCommands when `do: 'builtIns.join'`
 * is encountered — no explicit import is needed.
 * 
 * @example
 * assignFrom(oElement, {
 *     '?.textContent =>': {
 *         do: 'builtIns.join',
 *         resolve: {
 *             value: ['?.lastName', ', ', '?.firstName']
 *         }
 *     }
 * }, { from: vm });
 * 
 * @example
 * // With optional segment (all-or-nothing):
 * assignFrom(oElement, {
 *     '?.textContent =>': {
 *         do: 'builtIns.join',
 *         resolve: {
 *             value: ['?.lastName', [', ', '?.middleName'], ', ', '?.firstName']
 *         }
 *     }
 * }, { from: vm });
 * // If middleName is undefined, the sub-array [', ', undefined] is dropped entirely.
 */

import type { AssignFromHandler } from '../assignFrom.js';

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
 * JoinHandler — built-in handler for composing strings from resolved arrays.
 * 
 * Returns the joined string via the return-value protocol, which causes
 * processHandlerCommands to assign it back to the LHS path.
 */
export class JoinHandler implements AssignFromHandler {
    config: any;

    constructor(config: any) {
        this.config = config;
    }

    async assign(lhsTarget: any, resolvedParams: Record<string, any>): Promise<string> {
        const { value } = resolvedParams;
        const separator = this.config.separator ?? '';

        const items = Array.isArray(value) ? processValue(value) : [value];
        return items.join(separator);
    }
}
