/**
 * getValues.ts — Synchronous value resolution for path strings.
 * 
 * The synchronous counterpart to resolveValues. Resolves `?.`-prefixed path
 * strings against a source object, with support for withMethods, aka aliases,
 * synchronous protocols, arrays, and nested plain objects.
 * 
 * For async protocol handlers, use resolveValues instead.
 * 
 * @example
 * import { getValues, getValue } from 'assign-gingerly/getValues.js';
 * 
 * const result = getValues({
 *     name: '?.user?.name',
 *     greeting: '?.messages?.hello',
 *     count: 42
 * }, source, { withMethods: ['querySelector'], aka: { q: 'querySelector' } });
 */

import type { GetValuesOptions } from './types/assign-gingerly/types.js';

/**
 * Apply alias substitutions to a path string.
 * Replaces complete tokens between `?.` delimiters with their aliased values.
 */
function applyAliases(path: string, aliasMap: Map<string, string>): string {
    if (aliasMap.size === 0) return path;
    const parts = path.split('?.');
    const substituted = parts.map(part => aliasMap.get(part) ?? part);
    return substituted.join('?.');
}

/**
 * Resolve a special root-reference token at the start of a string.
 * '$0' refers to the first argument passed to assignFrom / resolveValues.
 */
function resolveRootReference(path: string, source: any, root: any): { source: any; path: string } | null {
    if (path === '$0') return { source: root ?? source, path: '' };
    if (path.startsWith('$0?.')) return { source: root ?? source, path: path.substring(4) };
    return null;
}

/**
 * Path cache for parsed path strings.
 * Avoids re-splitting the same path on repeated calls.
 */
const pathCache = new Map<string, string[]>();

/**
 * Parse a `?.`-delimited path string into segments, with caching.
 */
function parseCachedPath(path: string): string[] {
    let parts = pathCache.get(path);
    if (!parts) {
        parts = path.split('?.').filter(p => p.length > 0);
        pathCache.set(path, parts);
    }
    return parts;
}

/**
 * Navigate a path against a source object, optionally calling methods.
 * Returns the resolved value at the end of the path.
 */
function navigatePath(
    source: any,
    parts: string[],
    withMethods: Set<string> | undefined
): any {
    let current = source;
    let i = 0;

    while (i < parts.length) {
        if (current == null) return current;

        const part = parts[i];

        if (withMethods && withMethods.has(part)) {
            const method = current[part];
            if (typeof method === 'function') {
                const nextPart = parts[i + 1];
                if (nextPart !== undefined && !(withMethods.has(nextPart))) {
                    current = method.call(current, nextPart);
                    i += 2;
                } else {
                    current = method.call(current);
                    i++;
                }
            } else {
                current = current[part];
                i++;
            }
        } else {
            current = current[part];
            i++;
        }
    }

    return current;
}

/**
 * Checks if a string value looks like a protocol reference.
 */
function hasProtocol(value: string): boolean {
    return value.includes('://');
}

/**
 * Resolve a protocol-prefixed value synchronously.
 */
function getProtocolValue(
    value: string,
    protocols: Record<string, (key: string) => any>,
    options?: GetValuesOptions
): any {
    const protoEnd = value.indexOf('://');
    const protocol = value.substring(0, protoEnd);

    const handler = protocols[protocol];
    if (!handler) return value; // not a recognized protocol

    const rest = value.substring(protoEnd + 3);

    const pathStart = rest.indexOf('?.');
    const key = pathStart === -1 ? rest : rest.substring(0, pathStart);
    const path = pathStart === -1 ? null : rest.substring(pathStart);

    const resolved = handler(key);

    if (path) {
        return getValue(path, resolved, options);
    }
    return resolved;
}

/**
 * Resolve path strings and protocols within an array (synchronous).
 * Recurses into nested arrays and plain objects.
 */
function getArray(
    arr: any[],
    source: any,
    aliasMap: Map<string, string>,
    withMethods: Set<string> | undefined,
    protocols: Record<string, (key: string) => any> | undefined,
    options?: GetValuesOptions
): any[] {
    const result: any[] = [];
    for (const item of arr) {
        if (typeof item === 'string' && item.startsWith('?.')) {
            const aliased = applyAliases(item, aliasMap);
            const parts = parseCachedPath(aliased);
            result.push(parts.length === 0 ? source : navigatePath(source, parts, withMethods));
        } else if (typeof item === 'string' && item.startsWith('$0')) {
            const rootRef = resolveRootReference(item, source, options?.root);
            if (rootRef === null) {
                result.push(source);
            } else {
                const aliased = applyAliases(rootRef.path, aliasMap);
                const normalizedPath = aliased.startsWith('?.') ? aliased : (aliased ? `?.${aliased}` : '?.');
                const parts = parseCachedPath(normalizedPath);
                result.push(parts.length === 0 ? rootRef.source : navigatePath(rootRef.source, parts, withMethods));
            }
        } else if (typeof item === 'string' && protocols && hasProtocol(item)) {
            result.push(getProtocolValue(item, protocols, options));
        } else if (Array.isArray(item)) {
            result.push(getArray(item, source, aliasMap, withMethods, protocols, options));
        } else if (item && typeof item === 'object') {
            const proto = Object.getPrototypeOf(item);
            if (proto === Object.prototype || proto === null) {
                result.push(getValues(item, source, options));
            } else {
                result.push(item);
            }
        } else {
            result.push(item);
        }
    }
    return result;
}

/**
 * Synchronously resolve RHS path strings in a pattern object against a source object.
 * 
 * Any value that is a string starting with `?.` is treated as a path
 * and resolved against the source object. Non-string values and strings
 * not starting with `?.` pass through unchanged.
 * 
 * @param pattern - Object whose RHS values may contain `?.` path strings
 * @param source - Object to resolve paths against
 * @param options - Optional withMethods, aka, and synchronous protocols
 * @returns New object with path strings replaced by resolved values
 */
export function getValues(
    pattern: Record<string, any>,
    source: any,
    options?: GetValuesOptions
): Record<string, any> {
    // Build alias map
    const aliasMap = new Map<string, string>();
    if (options?.aka) {
        for (const [alias, target] of Object.entries(options.aka)) {
            aliasMap.set(alias, target);
        }
    }

    // Build methods set
    const withMethods = options?.withMethods
        ? options.withMethods instanceof Set
            ? options.withMethods
            : new Set(options.withMethods)
        : undefined;

    const protocols = options?.protocols;

    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(pattern)) {
        if (typeof value === 'string' && value.startsWith('?.')) {
            const aliased = applyAliases(value, aliasMap);
            const parts = parseCachedPath(aliased);
            result[key] = parts.length === 0 ? source : navigatePath(source, parts, withMethods);
        } else if (typeof value === 'string' && value.startsWith('$0')) {
            const rootRef = resolveRootReference(value, source, options?.root);
            if (rootRef === null) {
                result[key] = source;
            } else {
                const aliased = applyAliases(rootRef.path, aliasMap);
                const normalizedPath = aliased.startsWith('?.') ? aliased : (aliased ? `?.${aliased}` : '?.');
                const parts = parseCachedPath(normalizedPath);
                result[key] = parts.length === 0 ? rootRef.source : navigatePath(rootRef.source, parts, withMethods);
            }
        } else if (typeof value === 'string' && protocols && hasProtocol(value)) {
            result[key] = getProtocolValue(value, protocols, options);
        } else if (Array.isArray(value)) {
            result[key] = getArray(value, source, aliasMap, withMethods, protocols, options);
        } else if (typeof value === 'object' && value !== null) {
            const proto = Object.getPrototypeOf(value);
            if (proto === Object.prototype || proto === null) {
                result[key] = getValues(value, source, options);
            } else {
                result[key] = value;
            }
        } else {
            result[key] = value;
        }
    }
    return result;
}

/**
 * Synchronously resolve a single `?.`-delimited path string against a source object.
 * 
 * @param path - A `?.`-delimited path string (e.g., '?.user?.name')
 * @param source - Object to resolve the path against
 * @param options - Optional withMethods and aka
 * @returns The resolved value, or undefined if any segment is nullish
 */
export function getValue(
    path: string,
    source: any,
    options?: GetValuesOptions
): any {
    const rootRef = resolveRootReference(path, source, options?.root);
    if (rootRef) {
        path = rootRef.path;
        source = rootRef.source;
    } else if (!path.startsWith('?.')) {
        return path;
    }

    let aliased = path;
    if (options?.aka) {
        const aliasMap = new Map<string, string>();
        for (const [alias, target] of Object.entries(options.aka)) {
            aliasMap.set(alias, target);
        }
        aliased = applyAliases(path, aliasMap);
    }

    const normalizedPath = aliased.startsWith('?.') ? aliased : (aliased ? `?.${aliased}` : '?.');
    const parts = parseCachedPath(normalizedPath);
    if (parts.length === 0) return source;

    const withMethods = options?.withMethods
        ? options.withMethods instanceof Set
            ? options.withMethods
            : new Set(options.withMethods)
        : undefined;

    return navigatePath(source, parts, withMethods);
}
