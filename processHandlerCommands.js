/**
 * processHandlerCommands - Handles ` =>` operator keys in assignFrom.
 *
 * Dynamically imported only when ` =>` keys are detected in the pattern.
 *
 * Synchronous as far as possible: once a handler's class is at hand (loaded before, or
 * given as a class in options.handlers), a handler with no `resolve`, no promise from
 * `prepare` and a non-promise `assign` result runs to completion before this returns.
 * That's what makes a nested builtIns.tree (a ` =>` inside a tree's pattern) synchronous.
 */
import { resolveValues } from './resolve/resolveValues.js';
import { getValues } from './resolve/getValues.js';
import { resolveLhsPath } from './utils/resolveLhsPath.js';
import { findClassPrototypeInPath } from './utils/findClassPrototypeInPath.js';
/**
 * Map of built-in handler names to their module paths.
 * These are auto-loaded on demand — no explicit import required.
 *
 * `join` moved to a synchronous ` =&` op (see syncOps/join.ts) — it never had
 * side effects or anything to await, so it didn't belong behind this async pipeline.
 */
const BUILT_IN_MAP = {
    'builtIns.lazyLoad': './handlers/lazyLoad.js',
    'builtIns.lazyLoadSwitch': './handlers/lazyLoadSwitch.js',
    'builtIns.manageTemplateList': './handlers/manageTemplateList.js',
    'builtIns.rangeSelector': './handlers/rangeSelector.js',
    'builtIns.scope': './handlers/scope.js',
    'builtIns.tree': './handlers/tree.js',
};
/**
 * Criteria for locating an assignFrom handler class: must expose an `assign` method
 * on its prototype.
 */
function handlerCriteria(proto) {
    return 'assign' in proto.prototype;
}
/**
 * Cache for loaded built-in handler classes — no promise on subsequent calls.
 */
const handlerCache = new Map();
/**
 * Cache for handler classes loaded from import-path strings in options.handlers.
 */
const pathCache = new Map();
/** Whether a value is a promise (or any thenable). */
function isThenable(value) {
    return value != null && typeof value.then === 'function';
}
/**
 * Load a built-in handler by name.
 * Returns the handler constructor (synchronously once cached), a promise of it on first
 * load, or undefined if the name isn't a recognized built-in.
 */
function loadBuiltIn(name) {
    const cached = handlerCache.get(name);
    if (cached)
        return cached;
    const path = BUILT_IN_MAP[name];
    if (!path)
        return undefined;
    // Resolve relative to this module — findClassPrototypeInPath's import() would
    // otherwise resolve it relative to utils/.
    return findClassPrototypeInPath(new URL(path, import.meta.url).pathname, handlerCriteria).then(cls => {
        handlerCache.set(name, cls);
        return cls;
    });
}
/**
 * Resolve a handler name: options.handlers (class constructor, built-in alias or import
 * path) first, then the built-in map. Synchronous whenever the class is at hand or cached.
 */
function resolveHandler(name, handlers) {
    if (handlers && name in handlers) {
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
            const cached = pathCache.get(entry);
            if (cached)
                return cached;
            return findClassPrototypeInPath(entry, handlerCriteria).then(cls => {
                pathCache.set(entry, cls);
                return cls;
            });
        }
    }
    // Fallback to built-in auto-load
    if (name.startsWith('builtIns.')) {
        return loadBuiltIn(name);
    }
    return undefined;
}
/**
 * Process all handler command keys (ending with ' =>') in a pattern.
 *
 * Runs synchronously until the first step that really has to wait (loading a module,
 * `resolve`, an async `prepare` or `assign`); the rest then continues in the returned
 * promise. Order is the same either way: keys, and the configs within a key, run
 * strictly one after another.
 *
 * @param target - The target object being assigned to
 * @param handlerKeys - Array of keys ending with ' =>'
 * @param pattern - The original pattern object
 * @param options - The assignFrom options
 * @param permissionProcessor - Optional permission processor
 * @returns undefined when everything ran synchronously, otherwise a promise of the rest
 */
export function processHandlerCommands(target, handlerKeys, pattern, options, permissionProcessor) {
    return runKeys(target, handlerKeys, 0, pattern, options, permissionProcessor);
}
/** Run handler keys from `start` on, continuing asynchronously from the first one that waits. */
function runKeys(target, handlerKeys, start, pattern, options, permissionProcessor) {
    for (let i = start; i < handlerKeys.length; i++) {
        const key = handlerKeys[i];
        const lhsPath = key.substring(0, key.length - 3); // Remove ' =>'
        const configs = normalizeConfigs(key, pattern[key]);
        // Empty array — skip silently
        if (configs.length === 0)
            continue;
        // Resolve the LHS path, preserving parent + key for return-value assignment.
        const lhs = resolveLhsPath(target, lhsPath, options);
        // Execute handlers sequentially, sharing the same lhsTarget
        const pending = runConfigs(configs, 0, lhs, target, options, permissionProcessor);
        if (pending)
            return pending.then(() => runKeys(target, handlerKeys, i + 1, pattern, options, permissionProcessor));
    }
}
/** Normalize a key's RHS to an array of handler configs, and validate them. */
function normalizeConfigs(key, rhs) {
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
    return configs;
}
/** Run a key's configs from `start` on, continuing asynchronously from the first one that waits. */
function runConfigs(configs, start, lhs, target, options, permissionProcessor) {
    for (let i = start; i < configs.length; i++) {
        const pending = runConfig(configs[i], lhs, target, options, permissionProcessor);
        if (pending)
            return pending.then(() => runConfigs(configs, i + 1, lhs, target, options, permissionProcessor));
    }
}
/** Run one handler config: resolve the handler class (from options.handlers, else built-ins), then invoke it. */
function runConfig(config, lhs, target, options, permissionProcessor) {
    const handlerClass = resolveHandler(config.do, options.handlers);
    if (isThenable(handlerClass)) {
        return handlerClass.then(cls => invokeHandler(cls, config, lhs, target, options, permissionProcessor));
    }
    return invokeHandler(handlerClass, config, lhs, target, options, permissionProcessor);
}
/** Resolve a config's params (`get` sync, `resolve` async), then prepare and run the handler. */
function invokeHandler(HandlerClass, config, lhs, target, options, permissionProcessor) {
    if (!HandlerClass) {
        throw new Error(`assignFrom: unknown handler "${config.do}". Provide it in options.handlers.`);
    }
    const { get, resolve } = config;
    if (!get && !resolve)
        return prepareAndAssign(HandlerClass, config, {}, lhs, options, permissionProcessor);
    const { from, withMethods, aka, substitutions, protocols, fromStack, pipes } = options;
    const resolveOptions = { withMethods, aka, substitutions, protocols, root: target, fromStack, pipes };
    // Resolve 'get' map synchronously (no thread yield)
    const resolvedParams = get ? getValues(get, from, resolveOptions) : {};
    // Resolve 'resolve' map asynchronously (yields to microtask queue)
    if (resolve) {
        return resolveValues(resolve, from, resolveOptions).then(asyncResolved => {
            Object.assign(resolvedParams, asyncResolved);
            return prepareAndAssign(HandlerClass, config, resolvedParams, lhs, options, permissionProcessor);
        });
    }
    return prepareAndAssign(HandlerClass, config, resolvedParams, lhs, options, permissionProcessor);
}
/** Let the handler load what this config needs (waited on only when it returns a promise), then assign. */
function prepareAndAssign(HandlerClass, config, resolvedParams, lhs, options, permissionProcessor) {
    const preparing = HandlerClass.prepare?.(config);
    if (preparing)
        return preparing.then(() => assignWith(HandlerClass, config, resolvedParams, lhs, options, permissionProcessor));
    return assignWith(HandlerClass, config, resolvedParams, lhs, options, permissionProcessor);
}
/** Instantiate and invoke the handler, then apply its return value (waited on only when it's a promise). */
function assignWith(HandlerClass, config, resolvedParams, lhs, options, permissionProcessor) {
    const handler = new HandlerClass(config);
    const result = handler.assign(lhs.lhsTarget, resolvedParams, options, permissionProcessor);
    if (isThenable(result))
        return Promise.resolve(result).then(value => applyResult(lhs, value, permissionProcessor));
    applyResult(lhs, result, permissionProcessor);
}
/**
 * Return-value protocol: if a handler returns a non-undefined value,
 * assign it back to the LHS path.
 */
function applyResult({ lhsParent, lhsKey }, result, permissionProcessor) {
    if (result !== undefined && lhsParent != null && lhsKey != null
        && !permissionProcessor?.redirectRestrictedProp(lhsParent, lhsKey, result)) {
        lhsParent[lhsKey] = result;
    }
}
