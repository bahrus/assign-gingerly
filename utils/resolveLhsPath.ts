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

export interface ResolvedLhsPath {
    lhsTarget: any;
    lhsParent: any;
    lhsKey: string | undefined;
}

export interface ResolveLhsPathOptions {
    withMethods?: Set<string> | string[];
}

export function resolveLhsPath(
    target: any,
    lhsPath: string,
    options: ResolveLhsPathOptions
): ResolvedLhsPath {
    let lhsTarget: any;
    let lhsParent: any = undefined;
    let lhsKey: string | undefined = undefined;

    if (lhsPath.startsWith('?.')) {
        const pathParts = lhsPath.split('?.').filter(p => p.length > 0);
        const withMethodsSet = options.withMethods
            ? options.withMethods instanceof Set
                ? options.withMethods
                : new Set(options.withMethods)
            : undefined;

        if (withMethodsSet && pathParts.length > 0) {
            const result = evaluatePathWithMethods(target, pathParts, undefined, withMethodsSet);
            lhsParent = result.target;
            lhsKey = result.lastKey;
            lhsTarget = result.target[result.lastKey];
            // If last key is a method, call it to get the target
            if (result.isMethod && typeof result.target[result.lastKey] === 'function') {
                lhsTarget = result.target[result.lastKey].call(result.target);
                lhsParent = undefined; // Can't assign back to a method call result
                lhsKey = undefined;
            }
        } else {
            // Simple path navigation — walk to parent, keep last key
            if (pathParts.length === 0) {
                lhsTarget = target;
            } else if (pathParts.length === 1) {
                lhsParent = target;
                lhsKey = pathParts[0];
                lhsTarget = target[pathParts[0]];
            } else {
                let current = target;
                for (let i = 0; i < pathParts.length - 1; i++) {
                    if (current == null) break;
                    current = current[pathParts[i]];
                }
                lhsParent = current;
                lhsKey = pathParts[pathParts.length - 1];
                lhsTarget = current != null ? current[lhsKey] : undefined;
            }
        }
    } else if (lhsPath) {
        lhsParent = target;
        lhsKey = lhsPath;
        lhsTarget = target[lhsPath];
    } else {
        lhsTarget = target;
    }

    return { lhsTarget, lhsParent, lhsKey };
}
