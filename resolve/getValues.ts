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

import type { GetValuesOptions, PermissionProcessor } from '../types/assign-gingerly/types.js';

export function normalizeAliasOptions(options?: {
    aka?: Record<string, string>;
    akaMethods?: Record<string, string>;
    withMethods?: string[] | Set<string>;
}): { aliasMap: Map<string, string>; withMethods: Set<string> | undefined } {
    const aliasMap = new Map<string, string>();

    if (options?.aka) {
        for (const [alias, target] of Object.entries(options.aka)) {
            if (alias.includes(' ') || alias.includes('`')) {
                throw new Error(`Invalid alias '${alias}': aliases cannot contain space or backtick characters`);
            }
            aliasMap.set(alias, target);
        }
    }

    if (options?.akaMethods) {
        for (const [alias, target] of Object.entries(options.akaMethods)) {
            if (alias.includes(' ') || alias.includes('`')) {
                throw new Error(`Invalid alias '${alias}': aliases cannot contain space or backtick characters`);
            }
            aliasMap.set(alias, target);
        }
    }

    const withMethods = options?.withMethods
        ? options.withMethods instanceof Set
            ? new Set(options.withMethods)
            : new Set(options.withMethods)
        : options?.akaMethods
            ? new Set<string>()
            : undefined;

    if (options?.akaMethods) {
        for (const target of Object.values(options.akaMethods)) {
            withMethods?.add(target);
        }
    }

    return { aliasMap, withMethods };
}

/**
 * Check whether a method name is listed in withMethods and is not restricted
 * by the permission processor. Restricted methods are treated as non-method
 * property names so they fall through to normal access.
 */
function isAllowedMethod(
    methodName: string,
    withMethods: Set<string> | undefined,
    permissionProcessor?: PermissionProcessor
): boolean {
    return !!withMethods && withMethods.has(methodName) && !permissionProcessor?.checkRestrictedMethod(methodName);
}

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
 * Apply value substitutions to a path string.
 * Replaces complete tokens between `?.` delimiters with their resolved values.
 * Substitutions are applied before aliases.
 */
function applySubstitutions(path: string, substitutionMap?: Map<string, string>): string {
    if (!substitutionMap || substitutionMap.size === 0) return path;
    const parts = path.split('?.');
    const substituted = parts.map(part => substitutionMap.get(part) ?? part);
    return substituted.join('?.');
}

/**
 * Resolve substitution values declared in options.substitutions.
 * Each substitution path is resolved against the source object without
 * applying substitutions itself, to avoid infinite recursion.
 * Resolved values must be strings and must not contain `?.`.
 */
function resolveSubstitutions(
    substitutions: Record<string, string> | undefined,
    source: any,
    options: GetValuesOptions | undefined
): Map<string, string> {
    const map = new Map<string, string>();
    if (!substitutions) return map;

    for (const [name, path] of Object.entries(substitutions)) {
        // Resolve the substitution path against the source, but do not apply
        // substitutions to that path. Root references ($0) are also disabled
        // for substitution paths so values are sourced from `from` only.
        const resolved = getValue(
            path,
            source,
            options
                ? { ...options, substitutions: undefined, root: undefined }
                : undefined
        );
        if(resolved === null || typeof resolved === 'undefined') continue;
        if (typeof resolved !== 'string') {
            throw new Error(
                `Substitution '${name}' must resolve to a string, got ${typeof resolved}`
            );
        }
        if (resolved.includes('?.')) {
            throw new Error(
                `Substitution '${name}' resolved to a string containing '?.', which would alter the path structure: '${resolved}'`
            );
        }
        map.set(name, resolved);
    }
    return map;
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
    withMethods: Set<string> | undefined,
    permissionProcessor?: PermissionProcessor
): any {
    let current = source;
    let i = 0;

    while (i < parts.length) {
        if (current == null) return current;

        const rawPart = parts[i];

        // A trailing | forces a zero-argument method call: 'toLocaleString|' calls
        // toLocaleString() without consuming the next segment. Only applies to
        // names listed in withMethods; otherwise | is part of a literal key.
        const isZeroArg = rawPart.endsWith('|')
            && isAllowedMethod(rawPart.slice(0, -1), withMethods, permissionProcessor);
        const part = isZeroArg ? rawPart.slice(0, -1) : rawPart;

        if (isZeroArg || isAllowedMethod(part, withMethods, permissionProcessor)) {
            const method = current[part];
            if (typeof method === 'function') {
                const nextPart = parts[i + 1];
                // Consecutive methods (including a |-marked next segment) mean a
                // zero-arg call; otherwise the next segment is the string argument.
                const nextIsMethod = nextPart !== undefined
                    && (isAllowedMethod(nextPart, withMethods, permissionProcessor)
                        || (nextPart.endsWith('|') && isAllowedMethod(nextPart.slice(0, -1), withMethods, permissionProcessor)));
                if (!isZeroArg && nextPart !== undefined && !nextIsMethod) {
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
            current = current[rawPart];
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
    options?: GetValuesOptions,
    substitutionMap?: Map<string, string>
): any[] {
    const permissionProcessor = options?.permissionProcessor;
    const result: any[] = [];
    for (const item of arr) {
        if (typeof item === 'string' && item.startsWith('?.')) {
            const substituted = applySubstitutions(item, substitutionMap);
            const aliased = applyAliases(substituted, aliasMap);
            const parts = parseCachedPath(aliased);
            result.push(parts.length === 0 ? source : navigatePath(source, parts, withMethods, permissionProcessor));
        } else if (typeof item === 'string' && item.startsWith('$0')) {
            const rootRef = resolveRootReference(item, source, options?.root);
            if (rootRef === null) {
                result.push(source);
            } else {
                const substitutedPath = applySubstitutions(rootRef.path, substitutionMap);
                const aliased = applyAliases(substitutedPath, aliasMap);
                const normalizedPath = aliased.startsWith('?.') ? aliased : (aliased ? `?.${aliased}` : '?.');
                const parts = parseCachedPath(normalizedPath);
                result.push(parts.length === 0 ? rootRef.source : navigatePath(rootRef.source, parts, withMethods, permissionProcessor));
            }
        } else if (typeof item === 'string' && protocols && hasProtocol(item)) {
            result.push(getProtocolValue(item, protocols, options));
        } else if (Array.isArray(item)) {
            result.push(getArray(item, source, aliasMap, withMethods, protocols, options, substitutionMap));
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
    const { aliasMap, withMethods } = normalizeAliasOptions(options);
    const substitutionMap = resolveSubstitutions(options?.substitutions, source, options);

    const protocols = options?.protocols;
    const permissionProcessor = options?.permissionProcessor;

    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(pattern)) {
        if (typeof value === 'string' && value.startsWith('?.')) {
            const substituted = applySubstitutions(value, substitutionMap);
            const aliased = applyAliases(substituted, aliasMap);
            const parts = parseCachedPath(aliased);
            result[key] = parts.length === 0 ? source : navigatePath(source, parts, withMethods, permissionProcessor);
        } else if (typeof value === 'string' && value.startsWith('$0')) {
            const rootRef = resolveRootReference(value, source, options?.root);
            if (rootRef === null) {
                result[key] = source;
            } else {
                const substitutedPath = applySubstitutions(rootRef.path, substitutionMap);
                const aliased = applyAliases(substitutedPath, aliasMap);
                const normalizedPath = aliased.startsWith('?.') ? aliased : (aliased ? `?.${aliased}` : '?.');
                const parts = parseCachedPath(normalizedPath);
                result[key] = parts.length === 0 ? rootRef.source : navigatePath(rootRef.source, parts, withMethods, permissionProcessor);
            }
        } else if (typeof value === 'string' && protocols && hasProtocol(value)) {
            result[key] = getProtocolValue(value, protocols, options);
        } else if (Array.isArray(value)) {
            result[key] = getArray(value, source, aliasMap, withMethods, protocols, options, substitutionMap);
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

    const substitutionMap = resolveSubstitutions(options?.substitutions, source, options);

    const substituted = applySubstitutions(path, substitutionMap);
    let aliased = substituted;
    const { aliasMap } = normalizeAliasOptions(options);
    if (aliasMap.size > 0) {
        aliased = applyAliases(substituted, aliasMap);
    }

    const normalizedPath = aliased.startsWith('?.') ? aliased : (aliased ? `?.${aliased}` : '?.');
    const parts = parseCachedPath(normalizedPath);
    if (parts.length === 0) return source;

    const { withMethods } = normalizeAliasOptions(options);
    const permissionProcessor = options?.permissionProcessor;

    return navigatePath(source, parts, withMethods, permissionProcessor);
}
