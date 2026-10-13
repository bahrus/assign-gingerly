/**
 * resolveLhsPath.ts — Shared LHS path resolution for operator commands.
 *
 * Resolves the `?.`-prefixed path in front of an operator suffix (` =>`, ` =&`, ...)
 * against a target, preserving the parent object and final key so the caller can
 * assign a computed/returned value back to that path.
 *
 * Shared by processHandlerCommands.ts (` =>`) and the sync-op dispatcher in
 * assignFrom.ts (` =&`) — the two operators that hand a value back to the LHS
 * rather than assigning it directly.
 */
import { evaluatePathWithMethods } from '../assignGingerly.js';
import { applyAliases, normalizeAliasOptions } from '../resolve/getValues.js';
export function resolveLhsPath(target, lhsPath, options) {
    let lhsTarget;
    let lhsParent = undefined;
    let lhsKey = undefined;
    // aka / akaMethods apply to the LHS path, as they do for plain keys in assignGingerly
    // (akaMethods' targets are also added to withMethods)
    const { aliasMap, withMethods: withMethodsSet } = normalizeAliasOptions(options);
    if (aliasMap.size > 0) {
        lhsPath = lhsPath.startsWith('?.') ? applyAliases(lhsPath, aliasMap) : aliasMap.get(lhsPath) ?? lhsPath;
    }
    if (lhsPath.startsWith('?.')) {
        const pathParts = lhsPath.split('?.').filter(p => p.length > 0);
        if (withMethodsSet && pathParts.length > 0) {
            const result = evaluatePathWithMethods(target, pathParts, undefined, withMethodsSet);
            lhsParent = result.target;
            lhsKey = result.lastKey;
            lhsTarget = result.target[result.lastKey];
            if (result.lastSegmentConsumed) {
                // The last segment was a method's argument ('?.querySelector?.tbody'):
                // the call's result is the target, and there's nothing to assign back to
                lhsTarget = result.target;
                lhsParent = undefined;
                lhsKey = undefined;
            }
            else if (result.isMethod && typeof result.target[result.lastKey] === 'function') {
                // If last key is a method, call it to get the target
                lhsTarget = result.target[result.lastKey].call(result.target);
                lhsParent = undefined; // Can't assign back to a method call result
                lhsKey = undefined;
            }
        }
        else {
            // Simple path navigation — walk to parent, keep last key
            if (pathParts.length === 0) {
                lhsTarget = target;
            }
            else if (pathParts.length === 1) {
                lhsParent = target;
                lhsKey = pathParts[0];
                lhsTarget = target[pathParts[0]];
            }
            else {
                let current = target;
                for (let i = 0; i < pathParts.length - 1; i++) {
                    if (current == null)
                        break;
                    current = current[pathParts[i]];
                }
                lhsParent = current;
                lhsKey = pathParts[pathParts.length - 1];
                lhsTarget = current != null ? current[lhsKey] : undefined;
            }
        }
    }
    else if (lhsPath) {
        lhsParent = target;
        lhsKey = lhsPath;
        lhsTarget = target[lhsPath];
    }
    else {
        lhsTarget = target;
    }
    return { lhsTarget, lhsParent, lhsKey };
}
