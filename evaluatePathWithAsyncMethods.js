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
export async function evaluatePathWithAsyncMethods(target, pathParts, value, withMethods, withAsyncMethods) {
    let current = target;
    let i = 0;
    // Process all segments except the last one
    while (i < pathParts.length - 1) {
        const part = pathParts[i];
        const nextPart = pathParts[i + 1];
        if (withAsyncMethods.has(part)) {
            // Async method — call and await
            const method = current[part];
            if (typeof method === 'function') {
                if (withAsyncMethods.has(nextPart) || withMethods.has(nextPart)) {
                    // Next is also a method — call current with no args
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
                if (current[part] === undefined || current[part] === null) {
                    current[part] = {};
                }
                current = current[part];
            }
        }
        else if (withMethods.has(part)) {
            // Sync method — same logic as evaluatePathWithMethods
            const method = current[part];
            if (typeof method === 'function') {
                if (withMethods.has(nextPart) || withAsyncMethods.has(nextPart)) {
                    // Next is also a method — call current with no args
                    current = method.call(current);
                }
                else {
                    // Call with next part as string arg
                    current = method.call(current, nextPart);
                    i++; // Skip next part since we consumed it as argument
                }
            }
            else {
                if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
                    current[part] = {};
                }
                current = current[part];
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
    const lastKey = pathParts[pathParts.length - 1];
    return {
        target: current,
        lastKey,
        isMethod: withMethods.has(lastKey),
        isAsyncMethod: withAsyncMethods.has(lastKey)
    };
}
