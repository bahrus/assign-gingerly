/**
 * builtIns.lazyLoadSwitch handler for assignFrom.
 * 
 * Extends LazyLoadHandler with a comparison-based condition instead of a
 * pre-computed boolean. Evaluates `lhs op rhs` to determine whether to
 * show or hide the template content.
 * 
 * This handler is auto-loaded by processHandlerCommands when
 * `do: 'builtIns.lazyLoadSwitch'` is encountered — no explicit import is needed.
 * 
 * Useful for routing and multi-way conditional rendering where multiple
 * handlers in an array represent different "cases."
 * 
 * @example
 * assignFrom(el, {
 *     '?.querySelector?..routerOutlet =>': [
 *         { do: 'builtIns.lazyLoadSwitch', resolve: { lhs: '?.route', rhs: 'home', instantiate: 'globalThis://homeView' } },
 *         { do: 'builtIns.lazyLoadSwitch', resolve: { lhs: '?.route', rhs: 'settings', instantiate: 'globalThis://settingsView' } },
 *     ]
 * }, { withMethods: ['querySelector'], from: vm, protocols: { globalThis: k => globalThis[k] } });
 */

import { LazyLoadHandler } from './lazyLoad.js';
import type { PermissionProcessor } from '../types/assign-gingerly/types.js';
import type { AssignFromHandler } from '../assignFromAsync.js';
import type { LazyLoadSwitchResolvedParams } from '../types/assign-gingerly/types.js';

/**
 * Evaluate a comparison operation.
 * 
 * @param lhs - Left-hand side value
 * @param op - Operator string (default: '===')
 * @param rhs - Right-hand side value
 * @returns Boolean result of the comparison
 */
function evaluateOp(lhs: any, op: string, rhs: any): boolean {
    switch (op) {
        case '===': return lhs === rhs;
        case '!==': return lhs !== rhs;
        case '==':  return lhs == rhs;
        case '!=':  return lhs != rhs;
        case '<':   return lhs < rhs;
        case '>':   return lhs > rhs;
        case '<=':  return lhs <= rhs;
        case '>=':  return lhs >= rhs;
        default:
            throw new Error(`builtIns.lazyLoadSwitch: unsupported operator "${op}"`);
    }
}

/**
 * LazyLoadSwitchHandler — comparison-based conditional template instantiation.
 * 
 * Extends LazyLoadHandler by evaluating `lhs op rhs` to compute the condition,
 * then delegating all DOM logic to the parent class.
 */
export class LazyLoadSwitchHandler extends LazyLoadHandler implements AssignFromHandler {

    async assign(lhsTarget: any, resolvedParams: LazyLoadSwitchResolvedParams, options?: any, permissionProcessor?: PermissionProcessor): Promise<void> {
        const { lhs, op = '===', rhs, ...rest } = resolvedParams;
        const condition = evaluateOp(lhs, op, rhs);
        // Delegate to parent with computed condition
        return super.assign(lhsTarget, { ...rest, if: condition }, options, permissionProcessor);
    }
}
