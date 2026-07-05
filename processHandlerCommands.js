/**
 * processHandlerCommands - Handles ` =>` operator keys in assignFrom.
 *
 * Dynamically imported only when ` =>` keys are detected in the pattern.
 */
import { resolveValues } from './resolveValues.js';
import { evaluatePathWithMethods } from './assignGingerly.js';
/**
 * Map of built-in handler names to their module paths.
 * These are auto-loaded on demand — no explicit import required.
 */
const BUILT_IN_MAP = {
    'builtIns.lazyLoad': './handlers/lazyLoad.js',
    'builtIns.lazyLoadSwitch': './handlers/lazyLoadSwitch.js',
    'builtIns.join': './handlers/join.js',
    'builtIns.microDataJoin': './handlers/microDataJoin.js',
};
/**
 * Check if an import path is allowed (non-cross-domain).
 */
function isAllowedImportPath(path) {
    return path.startsWith('./') || path.startsWith('../') || path.startsWith('/')
        || (!path.includes('://') && !path.startsWith('//'));
}
/**
 * Find a handler class in a dynamically imported module.
 * Checks default export first, then searches for the first class with `assign` on prototype.
 */
function findHandlerInModule(module) {
    if (module.default && typeof module.default === 'function'
        && module.default.prototype && 'assign' in module.default.prototype) {
        return module.default;
    }
    for (const key of Object.keys(module)) {
        const exported = module[key];
        if (typeof exported === 'function' && exported.prototype && 'assign' in exported.prototype) {
            return exported;
        }
    }
    return undefined;
}
/**
 * Dynamically load a built-in handler by name.
 */
async function loadBuiltIn(name) {
    const path = BUILT_IN_MAP[name];
    if (!path)
        return undefined;
    const module = await import(path);
    return findHandlerInModule(module);
}
/**
 * Resolve a handler from options.handlers (class constructor or import path).
 */
async function resolveFromHandlers(name, handlers) {
    if (!handlers || !(name in handlers))
        return undefined;
    const entry = handlers[name];
    if (typeof entry === 'function') {
        return entry;
    }
    if (typeof entry === 'string') {
        if (!isAllowedImportPath(entry)) {
            throw new Error(
                `assignFrom: handler "${name}" has an invalid import path "${entry}". ` +
                `Only relative, absolute, or bare specifier paths are allowed (no cross-domain URLs).`
            );
        }
        const module = await import(entry);
        const HandlerClass = findHandlerInModule(module);
        if (!HandlerClass) {
            throw new Error(
                `assignFrom: handler "${name}" — module "${entry}" does not export a valid handler class.`
            );
        }
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
 */
export async function processHandlerCommands(target, handlerKeys, pattern, options) {
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
                if (result.isMethod && typeof result.target[result.lastKey] === 'function') {
                    lhsTarget = result.target[result.lastKey].call(result.target);
                    lhsParent = undefined;
                    lhsKey = undefined;
                }
            }
            else {
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
            // 1. Check options.handlers (local, per-call)
            let HandlerClass = await resolveFromHandlers(config.do, options.handlers);
            // 2. Fallback to built-in auto-load
            if (!HandlerClass && config.do.startsWith('builtIns.')) {
                HandlerClass = await loadBuiltIn(config.do);
            }
            if (!HandlerClass) {
                throw new Error(`assignFrom: unknown handler "${config.do}". Provide it in options.handlers.`);
            }
            // Resolve 'resolve' map if present — uses full resolveValues (paths, protocols, literals)
            let resolvedParams = {};
            if (config.resolve) {
                resolvedParams = await resolveValues(config.resolve, options.from, {
                    withMethods: options.withMethods,
                    aka: options.aka,
                    protocols: options.protocols
                });
            }
            // Instantiate and invoke the handler
            const handler = new HandlerClass(config);
            const result = await handler.assign(lhsTarget, resolvedParams, options);
            // Return-value protocol: if handler returns a non-undefined value,
            // assign it back to the LHS path
            if (result !== undefined && lhsParent != null && lhsKey != null) {
                lhsParent[lhsKey] = result;
            }
        }
    }
}
