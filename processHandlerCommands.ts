/**
 * processHandlerCommands - Handles ` =>` operator keys in assignFrom.
 * 
 * Dynamically imported only when ` =>` keys are detected in the pattern.
 */

import { resolveValue } from './resolveValues.js';
import { evaluatePathWithMethods } from './assignGingerly.js';
import type { AssignFromOptions, AssignFromHandlerConstructor } from './assignFrom.js';

/**
 * Process all handler command keys (ending with ' =>') in a pattern.
 * 
 * @param target - The target object being assigned to
 * @param handlerKeys - Array of keys ending with ' =>'
 * @param pattern - The original pattern object
 * @param options - The assignFrom options
 * @param handlerRegistry - The registry of handler classes
 */
export async function processHandlerCommands(
    target: any,
    handlerKeys: string[],
    pattern: Record<string, any>,
    options: AssignFromOptions,
    handlerRegistry: Map<string, AssignFromHandlerConstructor>
): Promise<void> {
    for (const key of handlerKeys) {
        const lhsPath = key.substring(0, key.length - 3); // Remove ' =>'
        const config = pattern[key];

        if (!config || typeof config !== 'object' || !config.do) {
            throw new Error(`assignFrom: handler command "${key}" requires a config object with a "do" field`);
        }

        const HandlerClass = handlerRegistry.get(config.do);
        if (!HandlerClass) {
            throw new Error(`assignFrom: unknown handler "${config.do}". Register with defineHandler().`);
        }

        // Resolve the LHS target via path evaluation
        let lhsTarget: any;
        if (lhsPath.startsWith('?.')) {
            const pathParts = lhsPath.split('?.').filter(p => p.length > 0);
            const withMethodsSet = options.withMethods
                ? options.withMethods instanceof Set
                    ? options.withMethods
                    : new Set(options.withMethods)
                : undefined;

            if (withMethodsSet && pathParts.length > 0) {
                const result = evaluatePathWithMethods(target, pathParts, undefined, withMethodsSet);
                lhsTarget = result.target[result.lastKey];
                // If last key is a method, call it to get the target
                if (result.isMethod && typeof result.target[result.lastKey] === 'function') {
                    lhsTarget = result.target[result.lastKey].call(result.target);
                }
            } else {
                // Simple path navigation
                lhsTarget = target;
                for (const part of pathParts) {
                    if (lhsTarget == null) break;
                    lhsTarget = lhsTarget[part];
                }
            }
        } else if (lhsPath) {
            lhsTarget = target[lhsPath];
        } else {
            lhsTarget = target;
        }

        // Resolve 'from' field if present
        let resolvedFrom: any = undefined;
        if (config.from) {
            if (typeof config.from === 'string' && config.from.startsWith('?.')) {
                resolvedFrom = resolveValue(config.from, options.from);
            } else {
                resolvedFrom = config.from;
            }
        }

        // Instantiate and invoke the handler
        const handler = new HandlerClass(config);
        await handler.assign(lhsTarget, resolvedFrom, options);
    }
}
