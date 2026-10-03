/**
 * builtIns.rangeSelector handler for assignFrom.
 *
 * Evaluates a value against a series of range conditions and merges
 * the matched case's properties into the target. Useful for converting
 * imperative if/else-if chains into declarative JSON configs.
 *
 * @example
 * assignFrom(element, {
 *     '?. =>': {
 *         do: 'builtIns.rangeSelector',
 *         get: {
 *             value: '?.count',
 *             when: [
 *                 { '<=': 10, merge: { status: 'low' } },
 *                 { '<': 20, merge: { status: 'medium' } },
 *                 { merge: { status: 'high' } }
 *             ]
 *         }
 *     }
 * }, { from: vm });
 */
import assignGingerly from '../assignGingerly.js';
/**
 * Operator keys recognized in case objects.
 */
const OPERATORS = new Set(['<=', '<', '>=', '>', '===', '!==']);
/**
 * Check if a single operator condition is satisfied.
 */
function checkCondition(value, op, threshold) {
    switch (op) {
        case '<=': return value <= threshold;
        case '<': return value < threshold;
        case '>=': return value >= threshold;
        case '>': return value > threshold;
        case '===': return value === threshold;
        case '!==': return value !== threshold;
        default: return false;
    }
}
/**
 * Check if all operator conditions in a case object are satisfied (AND logic).
 * Returns true if no operator keys present (catch-all/default case).
 */
function caseMatches(value, caseObj) {
    let hasCondition = false;
    for (const key of Object.keys(caseObj)) {
        if (OPERATORS.has(key)) {
            hasCondition = true;
            if (!checkCondition(value, key, caseObj[key])) {
                return false;
            }
        }
    }
    // No operator keys = default/catch-all
    return true;
}
/**
 * RangeSelectorHandler — declarative range-based conditional merge.
 */
export class RangeSelectorHandler {
    config;
    constructor(config) {
        this.config = config;
    }
    async assign(lhsTarget, resolvedParams, _options, permissionProcessor) {
        const { value, when } = resolvedParams;
        if (!Array.isArray(when))
            return;
        // Find first matching case (short-circuit)
        for (const caseObj of when) {
            if (caseMatches(value, caseObj)) {
                if (caseObj.merge && typeof caseObj.merge === 'object') {
                    assignGingerly(lhsTarget, caseObj.merge, undefined, permissionProcessor);
                }
                return; // First match wins
            }
        }
    }
}
