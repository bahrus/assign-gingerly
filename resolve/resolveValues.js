/**
 * resolveValues.ts — Async value resolution for path strings.
 *
 * Thin async wrapper around getValues that adds support for async protocol handlers.
 * For synchronous-only use cases, import getValues/getValue directly for better performance.
 *
 * The outer-grammar primitives (`hasProtocol`, `parseProtocolRef`, `isPlainObject`)
 * live in getValues.js and are re-exported here for convenience.
 *
 * Re-exports ResolveValuesOptions for backward compatibility.
 */
import { getValue, getValues, hasProtocol, isPlainObject, parseProtocolRef } from './getValues.js';
// Re-export getValue as resolveValue for backward compatibility
export { getValue as resolveValue };
// Re-export the shared outer-grammar primitives (defined in getValues.js)
export { hasProtocol, parseProtocolRef, isPlainObject };
/**
 * Resolves a protocol-prefixed value asynchronously.
 */
async function resolveProtocolValue(value, protocols, options) {
    const { protocol, key, path } = parseProtocolRef(value);
    const handler = protocols[protocol];
    if (!handler)
        return value;
    const resolved = await handler(key);
    if (path) {
        return getValue(path, resolved, options);
    }
    return resolved;
}
/**
 * Resolve path strings and protocol references within an array (async).
 */
async function resolveArray(arr, source, protocols, options) {
    const result = [];
    for (const item of arr) {
        if (typeof item === 'string') {
            if (protocols && hasProtocol(item)) {
                result.push(await resolveProtocolValue(item, protocols, options));
            }
            else {
                result.push(getValue(item, source, options));
            }
        }
        else if (Array.isArray(item)) {
            result.push(await resolveArray(item, source, protocols, options));
        }
        else if (item && typeof item === 'object') {
            if (isPlainObject(item)) {
                result.push(options?.protocols ? await resolveValues(item, source, options) : getValues(item, source, options));
            }
            else {
                result.push(item);
            }
        }
        else {
            result.push(item);
        }
    }
    return result;
}
/**
 * Async resolve RHS path strings in a pattern object against a source object.
 *
 * Supports async protocol handlers (e.g., fetch, IndexedDB).
 * For synchronous-only patterns, use `getValues` from 'assign-gingerly/getValues.js' instead.
 *
 * @param pattern - Object whose RHS values may contain `?.` path strings
 * @param source - Object to resolve paths against
 * @param options - Optional withMethods, aka, and protocol handlers
 * @returns New object with path strings replaced by resolved values
 */
export async function resolveValues(pattern, source, options) {
    const protocols = options?.protocols;
    const result = {};
    for (const [key, value] of Object.entries(pattern)) {
        if (typeof value === 'string') {
            if (protocols && hasProtocol(value)) {
                result[key] = await resolveProtocolValue(value, protocols, options);
            }
            else {
                result[key] = getValue(value, source, options);
            }
        }
        else if (Array.isArray(value)) {
            result[key] = await resolveArray(value, source, protocols, options);
        }
        else if (typeof value === 'object' && value !== null) {
            if (isPlainObject(value)) {
                result[key] = options?.protocols ? await resolveValues(value, source, options) : getValues(value, source, options);
            }
            else {
                result[key] = value;
            }
        }
        else {
            result[key] = value;
        }
    }
    return result;
}
