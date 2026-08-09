/**
 * processHandlerCommands - Handles ` =>` operator keys in assignFrom.
 *
 * Dynamically imported only when ` =>` keys are detected in the pattern.
 */
import { resolveValues } from './resolveValues.js';
import { getValues } from './getValues.js';
import { evaluatePathWithMethods } from './assignGingerly.js';
import { findClassPrototypeInPath } from './utils/findClassPrototypeInPath.js';
/**
 * Map of built-in handler names to their module paths.
 * These are auto-loaded on demand — no explicit import required.
 */
const BUILT_IN_MAP = {
    'builtIns.lazyLoad': './handlers/lazyLoad.js',
    'builtIns.lazyLoadSwitch': './handlers/lazyLoadSwitch.js',
    'builtIns.join': './handlers/join.js',
    'builtIns.microDataJoin': './handlers/microDataJoin.js',
    'builtIns.manageTemplateList': './handlers/manageTemplateList.js',
    'builtIns.rangeSelector': './handlers/rangeSelector.js',
};
/**
 * Criteria for locating an assignFrom handler class: must expose an `assign` method
 * on its prototype.
 */
function handlerCriteria(proto) {
    return 'assign' in proto.prototype;
}
/**
 * Cache for loaded built-in handler classes — avoids await on subsequent calls.
 */
const handlerCache = new Map();
/**
 * Dynamically load a built-in handler by name.
 * Returns the handler constructor, or undefined if the name isn't a recognized built-in.
 * Cached after first load — subsequent calls are synchronous.
 */
async function loadBuiltIn(name) {
    const cached = handlerCache.get(name);
    if (cached)
        return cached;
    const path = BUILT_IN_MAP[name];
    if (!path)
        return undefined;
    const cls = await findClassPrototypeInPath(path, handlerCriteria);
    handlerCache.set(name, cls);
    return cls;
}
/**
 * Resolve a handler from options.handlers (class constructor or import path).
 */
async function resolveFromHandlers(name, handlers) {
    if (!handlers || !(name in handlers))
        return undefined;
    const entry = handlers[name];
    // Class constructor — use directly
    if (typeof entry === 'function') {
        return entry;
    }
    // String value — could be a built-in alias or an import path
    if (typeof entry === 'string') {
        // Built-in alias: redirect to built-in loader
        if (entry.startsWith('builtIns.')) {
            return loadBuiltIn(entry);
        }
        // Import path string — validate and extract handler class via shared utility
        const HandlerClass = await findClassPrototypeInPath(entry, handlerCriteria);
        return HandlerClass;
    }
    return undefined;
}
/**
 * Process all handler command keys (ending with ' =>') in a pattern.
 *
 * @param target - The target object being assigned to
 * @param handlerKeys - Array of keys ending with ' =>'
 * @param pattern - The original pattern object
 * @param options - The assignFrom options
 * @param handlerRegistry - The registry of handler classes
 */
export async function processHandlerCommands(target, handlerKeys, pattern, options, permissionProcessor) {
    for (const key of handlerKeys) {
        const lhsPath = key.substring(0, key.length - 3); // Remove ' =>'
        const rhs = pattern[key];
        // Normalize RHS to an array of handler configs
        const configs = Array.isArray(rhs) ? rhs : [rhs];
        // Validate — no nested arrays
        for (const config of configs) {
            if (Array.isArray(config)) {
                throw new Error(`assignFrom: handler command "${key}" does not support nested arrays`);
            }
            if (!config || typeof config !== 'object' || !config.do) {
                throw new Error(`assignFrom: handler command "${key}" requires a config object with a "do" field`);
            }
        }
        // Empty array — skip silently
        if (configs.length === 0)
            continue;
        // Resolve the LHS path, preserving parent + key for return-value assignment.
        // lhsParent[lhsKey] === lhsTarget (the current value at the path)
        let lhsTarget;
        let lhsParent = undefined;
        let lhsKey = undefined;
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
        // Execute handlers sequentially, sharing the same lhsTarget
        for (const config of configs) {
            //return; //1.3ms
            // 1. Check options.handlers (local, per-call)
            let HandlerClass = await resolveFromHandlers(config.do, options.handlers);
            //return; // 1.4
            // 2. Fallback to built-in auto-load
            if (!HandlerClass && config.do.startsWith('builtIns.')) {
                HandlerClass = await loadBuiltIn(config.do);
            }
            //return; //1.4
            if (!HandlerClass) {
                throw new Error(`assignFrom: unknown handler "${config.do}". Provide it in options.handlers.`);
            }
            // Resolve 'get' map synchronously (no thread yield)
            let resolvedParams = {};
            if (config.get) {
                resolvedParams = getValues(config.get, options.from, {
                    withMethods: options.withMethods,
                    aka: options.aka,
                    protocols: options.protocols,
                    root: target
                });
            }
            // Resolve 'resolve' map asynchronously (yields to microtask queue)
            if (config.resolve) {
                const asyncResolved = await resolveValues(config.resolve, options.from, {
                    withMethods: options.withMethods,
                    aka: options.aka,
                    protocols: options.protocols,
                    root: target
                });
                Object.assign(resolvedParams, asyncResolved);
            }
            // Instantiate and invoke the handler
            const handler = new HandlerClass(config);
            //return; //1.5ms
            const result = await handler.assign(lhsTarget, resolvedParams, options, permissionProcessor);
            //return; //1.5ms
            // Return-value protocol: if handler returns a non-undefined value,
            // assign it back to the LHS path
            if (result !== undefined && lhsParent != null && lhsKey != null
                && !permissionProcessor?.redirectRestrictedProp(lhsParent, lhsKey, result)) {
                lhsParent[lhsKey] = result;
            }
        }
    }
}
