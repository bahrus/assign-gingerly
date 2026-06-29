/**
 * Resolve RHS path strings against a source object, then assign the
 * resolved values into a target using assignGingerly.
 *
 * Combines resolveValues + assignGingerly into a single call.
 * Inherits all assignGingerly options (withMethods, aka, signal, etc.).
 *
 * @param target - Object to merge resolved values into
 * @param pattern - Object whose RHS values may contain `?.` path strings
 * @param options - Options including `from` (source object) and any assignGingerly options
 * @returns The target object after merging
 *
 * @example
 * const source = { theme: { color: 'red' }, label: 'Hello' };
 * const target = { color: 'blue', text: '' };
 * assignFrom(target, {
 *   color: '?.theme?.color',
 *   text: '?.label'
 * }, { from: source });
 * // target is now { color: 'red', text: 'Hello' }
 */
import { resolveValues } from './resolveValues.js';
import assignGingerly from './assignGingerly.js';
/**
 * Registry of assignFrom handlers (keyed by the `do` field value).
 */
const handlerRegistry = new Map();
/**
 * Register a handler class for use with the ` =>` operator in assignFrom.
 *
 * @param name - The handler name (referenced via `do: 'name'` in the RHS config)
 * @param HandlerClass - A class with a constructor(config) and assign(target, data, options) method
 *
 * @example
 * import { defineHandler } from 'assign-gingerly/assignFrom.js';
 *
 * class MyListHandler {
 *     constructor(config) { this.config = config; }
 *     async assign(target, data, options) {
 *         // Custom assignment logic
 *     }
 * }
 *
 * defineHandler('my-list', MyListHandler);
 */
export function defineHandler(name, HandlerClass) {
    handlerRegistry.set(name, HandlerClass);
}
/**
 * Get a registered handler by name.
 */
export function getHandler(name) {
    return handlerRegistry.get(name);
}
/**
 * Check if a key ends with the handler operator ' =>'.
 */
function isHandlerCommand(key) {
    return key.endsWith(' =>');
}
export async function assignFrom(target, pattern, options) {
    // Separate handler commands ( =>) from normal keys
    const handlerKeys = [];
    const normalPattern = {};
    for (const key of Object.keys(pattern)) {
        if (isHandlerCommand(key)) {
            handlerKeys.push(key);
        }
        else {
            normalPattern[key] = pattern[key];
        }
    }
    // Process normal keys via resolveValues + assignGingerly
    if (Object.keys(normalPattern).length > 0) {
        const resolved = await resolveValues(normalPattern, options.from, {
            withMethods: options.withMethods,
            aka: options.aka,
            protocols: options.protocols
        });
        // Recursively handle "..." spread keys at all nesting levels
        handleSpreads(resolved);
        assignGingerly(target, resolved, options);
    }
    // Process handler commands ( =>) — dynamically imported only when needed
    if (handlerKeys.length > 0) {
        const { processHandlerCommands } = await import('./processHandlerCommands.js');
        await processHandlerCommands(target, handlerKeys, pattern, options, handlerRegistry);
    }
    return target;
}
/**
 * Recursively walk an object and handle "..." spread keys.
 * When a "..." key is found, its value (which should be an object after protocol resolution)
 * is spread into the parent, replacing the "..." entry.
 */
function handleSpreads(obj) {
    for (const [key, value] of Object.entries(obj)) {
        if (key !== '...' && typeof value === 'object' && value !== null && !Array.isArray(value)) {
            const proto = Object.getPrototypeOf(value);
            if (proto === Object.prototype || proto === null) {
                obj[key] = handleSpreads(value);
            }
        }
    }
    if ('...' in obj) {
        const spreadValue = obj['...'];
        delete obj['...'];
        if (spreadValue && typeof spreadValue === 'object') {
            Object.assign(obj, spreadValue);
        }
    }
    return obj;
}
