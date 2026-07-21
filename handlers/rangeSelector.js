/**
 * builtIns.rangeSelector handler for assignFrom.
 * 
 * Evaluates a value against a series of range conditions and merges
 * the matched case's properties into the target.
 */

import assignGingerly from '../assignGingerly.js';

const OPERATORS = new Set(['<=', '<', '>=', '>', '===', '!==']);

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

function caseMatches(value, caseObj) {
    for (const key of Object.keys(caseObj)) {
        if (OPERATORS.has(key)) {
            if (!checkCondition(value, key, caseObj[key])) {
                return false;
            }
        }
    }
    return true;
}

export class RangeSelectorHandler {
    config;
    constructor(config) {
        this.config = config;
    }
    async assign(lhsTarget, resolvedParams) {
        const { value, when } = resolvedParams;
        if (!Array.isArray(when)) return;
        for (const caseObj of when) {
            if (caseMatches(value, caseObj)) {
                if (caseObj.merge && typeof caseObj.merge === 'object') {
                    assignGingerly(lhsTarget, caseObj.merge);
                }
                return;
            }
        }
    }
}
