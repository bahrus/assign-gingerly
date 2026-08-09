/**
 * evaluatePathWithAsyncMethods - Async variant of evaluatePathWithMethods.
 *
 * Walks a path of property accesses and method calls, awaiting any methods
 * that are in the withAsyncMethods set before continuing the chain.
 *
 * This module is loaded dynamically (only when withAsyncMethods is used)
 * to avoid adding async overhead to the synchronous path.
 *
 * NOTE: Interaction with @each and @eachTime is not yet implemented.
 * Deferred until a compelling use case presents itself.
 */
import { isAllowedMethod } from './assignGingerly.js';
function isAllowedAsyncMethod(methodName, withAsyncMethods, permissionProcessor) {
    return withAsyncMethods.has(methodName) && !permissionProcessor?.checkRestrictedMethod(methodName);
}
/**
 * Evaluates a path with support for both sync and async method calls.
 * Awaits the return value of any method in the withAsyncMethods set.
 *
 * @param target - The root object to start path evaluation from
 * @param pathParts - Array of path segments (split from '?.' notation)
 * @param value - The value to assign or pass as argument at the end
 * @param withMethods - Set of method names that are called synchronously
 * @param withAsyncMethods - Set of method names that are awaited
 * @returns Promise resolving to the evaluation result
 */
export async function evaluatePathWithAsyncMethods(target, pathParts, value, withMethods, withAsyncMethods, permissionProcessor) {
    let current = target;
    let i = 0;
    // Process all segments except the last one
    while (i < pathParts.length - 1) {
        const part = pathParts[i];
        const nextPart = pathParts[i + 1];
        // A trailing | marks a zero-argument method call: 'deref|' calls deref()
        // without consuming the next segment. Only applies to listed method names.
        const isZeroArgSync = part.endsWith('|') && isAllowedMethod(part.slice(0, -1), withMethods, permissionProcessor);
        const isZeroArgAsync = part.endsWith('|') && isAllowedAsyncMethod(part.slice(0, -1), withAsyncMethods, permissionProcessor);
        const baseName = (isZeroArgSync || isZeroArgAsync) ? part.slice(0, -1) : part;
        const nextIsMethod = withAsyncMethods.has(nextPart) || withMethods.has(nextPart)
            || (nextPart.endsWith('|') && (withAsyncMethods.has(nextPart.slice(0, -1)) || withMethods.has(nextPart.slice(0, -1))));
        if (isAllowedAsyncMethod(part, withAsyncMethods, permissionProcessor) || isZeroArgAsync) {
            // Async method — call and await
            const method = current[baseName];
            if (typeof method === 'function') {
                if (isZeroArgAsync || nextIsMethod) {
                    // Zero-arg call — next is either a method or explicitly not an argument
                    current = await method.call(current);
                }
                else {
                    // Call with next part as string arg, then await
                    current = await method.call(current, nextPart);
                    i++; // Skip next part since we consumed it as argument
                }
            }
            else {
                // Not a function — just access property
                if (current[baseName] === undefined || current[baseName] === null) {
                    current[baseName] = {};
                }
                current = current[baseName];
            }
        }
        else if (isAllowedMethod(part, withMethods, permissionProcessor) || isZeroArgSync) {
            // Sync method — same logic as evaluatePathWithMethods
            const method = current[baseName];
            if (typeof method === 'function') {
                if (isZeroArgSync || nextIsMethod) {
                    // Zero-arg call — next is either a method or explicitly not an argument
                    current = method.call(current);
                }
                else {
                    // Call with next part as string arg
                    current = method.call(current, nextPart);
                    i++; // Skip next part since we consumed it as argument
                }
            }
            else {
                if (!(baseName in current) || typeof current[baseName] !== 'object' || current[baseName] === null) {
                    current[baseName] = {};
                }
                current = current[baseName];
            }
        }
        else {
            // Not a method — normal property access
            if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
                current[part] = {};
            }
            current = current[part];
        }
        i++;
    }
    // Strip a trailing | from the last segment only when it names a listed method;
    // otherwise it is a literal property name (e.g. an exotic key ending in |).
    const rawLastKey = pathParts[pathParts.length - 1];
    const isZeroArg = rawLastKey.endsWith('|')
        && (isAllowedMethod(rawLastKey.slice(0, -1), withMethods, permissionProcessor) || isAllowedAsyncMethod(rawLastKey.slice(0, -1), withAsyncMethods, permissionProcessor));
    const lastKey = isZeroArg ? rawLastKey.slice(0, -1) : rawLastKey;
    return {
        target: current,
        lastKey,
        isMethod: isAllowedMethod(lastKey, withMethods, permissionProcessor),
        isAsyncMethod: isAllowedAsyncMethod(lastKey, withAsyncMethods, permissionProcessor),
        isZeroArg
    };
}
