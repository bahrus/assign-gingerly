/**
 * resolveValues.ts — Async value resolution for path strings.
 *
 * Thin async wrapper around getValues that adds support for async protocol handlers.
 * For synchronous-only use cases, import getValues/getValue directly for better performance.
 *
 * Re-exports ResolveValuesOptions for backward compatibility.
 */
import { getValue, getValues } from '../getValues.js';
// Re-export getValue as resolveValue for backward compatibility
export { getValue as resolveValue };
/**
 * Checks if a string value looks like a protocol reference.
 */
function hasProtocol(value) {
    return value.includes('://');
}
/**
 * Resolves a protocol-prefixed value asynchronously.
 */
async function resolveProtocolValue(value, protocols, options) {
    const protoEnd = value.indexOf('://');
    const protocol = value.substring(0, protoEnd);
    const handler = protocols[protocol];
    if (!handler)
        return value;
    const rest = value.substring(protoEnd + 3);
    const pathStart = rest.indexOf('?.');
    const key = pathStart === -1 ? rest : rest.substring(0, pathStart);
    const path = pathStart === -1 ? null : rest.substring(pathStart);
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
            const proto = Object.getPrototypeOf(item);
            if (proto === Object.prototype || proto === null) {
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
            const proto = Object.getPrototypeOf(value);
            if (proto === Object.prototype || proto === null) {
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
