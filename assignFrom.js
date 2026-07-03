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
/**
 * Supported substitution variables and their option keys.
 */
const SUBSTITUTION_VARS = [
    { placeholder: '${x}', optionKey: 'where_x_in' },
    { placeholder: '${y}', optionKey: 'where_y_in' },
    { placeholder: '${z}', optionKey: 'where_z_in' },
];
/**
 * Recursively substitute a placeholder in all string values of an object.
 * Returns a new object (shallow clone at each level) with substitutions applied.
 */
function substituteInValue(value, placeholder, replacement) {
    if (typeof value === 'string') {
        return value.includes(placeholder) ? value.replaceAll(placeholder, replacement) : value;
    }
    if (Array.isArray(value)) {
        return value.map(item => substituteInValue(item, placeholder, replacement));
    }
    if (value && typeof value === 'object') {
        const proto = Object.getPrototypeOf(value);
        if (proto === Object.prototype || proto === null) {
            const result = {};
            for (const [k, v] of Object.entries(value)) {
                result[k] = substituteInValue(v, placeholder, replacement);
            }
            return result;
        }
    }
    return value;
}
/**
 * Check if a pattern entry (key + value) contains a given placeholder.
 */
function entryContainsPlaceholder(key, value, placeholder) {
    if (key.includes(placeholder))
        return true;
    return valueContainsPlaceholder(value, placeholder);
}
/**
 * Check if a value (string, object, or array) contains a placeholder.
 */
function valueContainsPlaceholder(value, placeholder) {
    if (typeof value === 'string')
        return value.includes(placeholder);
    if (Array.isArray(value))
        return value.some(item => valueContainsPlaceholder(item, placeholder));
    if (value && typeof value === 'object') {
        const proto = Object.getPrototypeOf(value);
        if (proto === Object.prototype || proto === null) {
            return Object.values(value).some(v => valueContainsPlaceholder(v, placeholder));
        }
    }
    return false;
}
/**
 * Expand looped substitution variables in a pattern.
 * Applies cartesian expansion: x values are expanded first, then y, then z.
 * Each variable multiplies the entries — result count = x.length × y.length × z.length.
 *
 * Returns the expanded pattern (or the original if no substitutions apply).
 */
function expandSubstitutions(pattern, options) {
    let entries = Object.entries(pattern);
    for (const { placeholder, optionKey } of SUBSTITUTION_VARS) {
        const values = options[optionKey];
        if (!values || values.length === 0)
            continue;
        const expanded = [];
        for (const [key, value] of entries) {
            if (entryContainsPlaceholder(key, value, placeholder)) {
                // Expand this entry for each value in the variable array
                for (const replacement of values) {
                    const newKey = key.includes(placeholder)
                        ? key.replaceAll(placeholder, replacement)
                        : key;
                    const newValue = substituteInValue(value, placeholder, replacement);
                    expanded.push([newKey, newValue]);
                }
            }
            else {
                // No placeholder in this entry — pass through
                expanded.push([key, value]);
            }
        }
        entries = expanded;
    }
    return mergeHandlerDuplicates(entries);
}
/**
 * Convert entries to an object, merging duplicate handler (` =>`) keys into arrays.
 * For normal (non-handler) keys, later entries overwrite earlier ones (standard object behavior).
 * For handler keys, duplicate entries are combined into an array (Multiple Handlers pattern).
 */
function mergeHandlerDuplicates(entries) {
    const result = {};
    for (const [key, value] of entries) {
        if (key.endsWith(' =>') && key in result) {
            // Duplicate handler key — merge into array
            const existing = result[key];
            if (Array.isArray(existing)) {
                existing.push(value);
            }
            else {
                result[key] = [existing, value];
            }
        }
        else {
            result[key] = value;
        }
    }
    return result;
}
export async function assignFrom(target, pattern, options) {
    // First: expand looped substitution variables (${x}, ${y}, ${z})
    const expandedPattern = expandSubstitutions(pattern, options);
    // Separate handler commands ( =>) from normal keys
    const handlerKeys = [];
    const normalPattern = {};
    for (const key of Object.keys(expandedPattern)) {
        if (isHandlerCommand(key)) {
            handlerKeys.push(key);
        }
        else {
            normalPattern[key] = expandedPattern[key];
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
        await processHandlerCommands(target, handlerKeys, expandedPattern, options, handlerRegistry);
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
