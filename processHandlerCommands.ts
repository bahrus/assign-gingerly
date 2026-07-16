/**
 * processHandlerCommands - Handles ` =>` operator keys in assignFrom.
 * 
 * Dynamically imported only when ` =>` keys are detected in the pattern.
 */

import { resolveValues } from './resolveValues.js';
import { evaluatePathWithMethods } from './assignGingerly.js';
import { isAllowedImportPath } from './isAllowedImportPath.js';
import type { AssignPermissions } from './isAllowedImportPath.js';
import type { AssignFromOptions, AssignFromHandlerConstructor } from './assignFrom.js';

/**
 * Map of built-in handler names to their module paths.
 * These are auto-loaded on demand — no explicit import required.
 */
const BUILT_IN_MAP: Record<string, string> = {
    'builtIns.lazyLoad': './handlers/lazyLoad.js',
    'builtIns.lazyLoadSwitch': './handlers/lazyLoadSwitch.js',
    'builtIns.join': './handlers/join.js',
    'builtIns.microDataJoin': './handlers/microDataJoin.js',
    'builtIns.manageTemplateList': './handlers/manageTemplateList.js',
};

/**
 * Find a handler class in a dynamically imported module.
 * Checks default export first, then searches for the first class with `assign` on prototype.
 */
function findHandlerInModule(module: any): AssignFromHandlerConstructor | undefined {
    // Check default export first
    if (module.default && typeof module.default === 'function'
        && module.default.prototype && 'assign' in module.default.prototype) {
        return module.default;
    }
    // Search other exports
    for (const key of Object.keys(module)) {
        const exported = module[key];
        if (typeof exported === 'function' && exported.prototype && 'assign' in exported.prototype) {
            return exported as AssignFromHandlerConstructor;
        }
    }
    return undefined;
}

/**
 * Cache for loaded built-in handler classes — avoids await on subsequent calls.
 */
const handlerCache = new Map<string, AssignFromHandlerConstructor>();

/**
 * Dynamically load a built-in handler by name.
 * Returns the handler constructor, or undefined if the name isn't a recognized built-in.
 * Cached after first load — subsequent calls are synchronous.
 */
async function loadBuiltIn(name: string): Promise<AssignFromHandlerConstructor | undefined> {
    const cached = handlerCache.get(name);
    if (cached) return cached;
    const path = BUILT_IN_MAP[name];
    if (!path) return undefined;
    const module = await import(path);
    const cls = findHandlerInModule(module);
    if (cls) handlerCache.set(name, cls);
    return cls;
}

/**
 * Resolve a handler from options.handlers (class constructor or import path).
 */
async function resolveFromHandlers(
    name: string,
    handlers: Record<string, AssignFromHandlerConstructor | string> | undefined,
    permissions?: AssignPermissions
): Promise<AssignFromHandlerConstructor | undefined> {
    if (!handlers || !(name in handlers)) return undefined;

    const entry = handlers[name];

    // Class constructor — use directly
    if (typeof entry === 'function') {
        return entry as AssignFromHandlerConstructor;
    }

    // Import path string — validate and dynamically import
    if (typeof entry === 'string') {
        if (!permissions?.crossDomainImports && !isAllowedImportPath(entry)) {
            throw new Error(
                `assignFrom: handler "${name}" has an invalid import path "${entry}". ` +
                `Only relative, absolute, or bare specifier paths are allowed (no cross-domain URLs). ` +
                `Pass { crossDomainImports: true } in permissions to override.`
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
 * @param handlerRegistry - The registry of handler classes
 */
export async function processHandlerCommands(
    target: any,
    handlerKeys: string[],
    pattern: Record<string, any>,
    options: AssignFromOptions,
    permissions?: AssignPermissions
): Promise<void> {
    
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
        if (configs.length === 0) continue;

        // Resolve the LHS path, preserving parent + key for return-value assignment.
        // lhsParent[lhsKey] === lhsTarget (the current value at the path)
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
        // Execute handlers sequentially, sharing the same lhsTarget
        for (const config of configs) {
            //return; //1.3ms
            // 1. Check options.handlers (local, per-call)
            let HandlerClass = await resolveFromHandlers(config.do, options.handlers, permissions);
            //return; // 1.4
            // 2. Fallback to built-in auto-load
            if (!HandlerClass && config.do.startsWith('builtIns.')) {
                HandlerClass = await loadBuiltIn(config.do);
            }
            //return; //1.4

            if (!HandlerClass) {
                throw new Error(`assignFrom: unknown handler "${config.do}". Provide it in options.handlers.`);
            }

            // Resolve 'resolve' map if present — uses full resolveValues (paths, protocols, literals)
            let resolvedParams: Record<string, any> = {};
            //return; //1.8 ms
            if (config.resolve) {
                resolvedParams = await resolveValues(config.resolve, options.from, {
                    withMethods: options.withMethods,
                    aka: options.aka,
                    protocols: options.protocols
                });
            }

            // Instantiate and invoke the handler
            const handler = new HandlerClass(config);
            //return; //1.5ms
            const result = await handler.assign(lhsTarget, resolvedParams, options);
            //return; //1.5ms
            // Return-value protocol: if handler returns a non-undefined value,
            // assign it back to the LHS path
            if (result !== undefined && lhsParent != null && lhsKey != null) {
                lhsParent[lhsKey] = result;
            }
        }
    }
}
