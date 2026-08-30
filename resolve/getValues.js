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
export function normalizeAliasOptions(options) {
    const aliasMap = new Map();
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
            ? new Set()
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
function isAllowedMethod(methodName, withMethods, permissionProcessor) {
    return !!withMethods && withMethods.has(methodName) && !permissionProcessor?.checkRestrictedMethod(methodName);
}
/**
 * Apply alias substitutions to a path string.
 * Replaces complete tokens between `?.` delimiters with their aliased values.
 */
function applyAliases(path, aliasMap) {
    if (aliasMap.size === 0)
        return path;
    const parts = path.split('?.');
    const substituted = parts.map(part => aliasMap.get(part) ?? part);
    return substituted.join('?.');
}
/**
 * Apply value substitutions to a path string.
 * Replaces complete tokens between `?.` delimiters with their resolved values.
 * Substitutions are applied before aliases.
 */
function applySubstitutions(path, substitutionMap) {
    if (!substitutionMap || substitutionMap.size === 0)
        return path;
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
function resolveSubstitutions(substitutions, source, options) {
    const map = new Map();
    if (!substitutions)
        return map;
    for (const [name, path] of Object.entries(substitutions)) {
        // Resolve the substitution path against the source, but do not apply
        // substitutions to that path. Root references ($0) are also disabled
        // for substitution paths so values are sourced from `from` only.
        const resolved = getValue(path, source, options
            ? { ...options, substitutions: undefined, root: undefined }
            : undefined);
        if (resolved === null || typeof resolved === 'undefined')
            continue;
        if (typeof resolved !== 'string') {
            throw new Error(`Substitution '${name}' must resolve to a string, got ${typeof resolved}`);
        }
        if (resolved.includes('?.')) {
            throw new Error(`Substitution '${name}' resolved to a string containing '?.', which would alter the path structure: '${resolved}'`);
        }
        map.set(name, resolved);
    }
    return map;
}
/**
 * Resolve a special root-reference token at the start of a string.
 * '$0' refers to the first argument passed to assignFrom / resolveValues.
 */
function resolveRootReference(path, source, root) {
    if (path === '$0')
        return { source: root ?? source, path: '' };
    if (path.startsWith('$0?.'))
        return { source: root ?? source, path: path.substring(4) };
    return null;
}
/**
 * Path cache for parsed path strings.
 * Avoids re-splitting the same path on repeated calls.
 */
const pathCache = new Map();
/**
 * Parse a `?.`-delimited path string into segments, with caching.
 */
function parseCachedPath(path) {
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
function navigatePath(source, parts, withMethods, permissionProcessor) {
    let current = source;
    let i = 0;
    while (i < parts.length) {
        if (current == null)
            return current;
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
                }
                else {
                    current = method.call(current);
                    i++;
                }
            }
            else {
                current = current[part];
                i++;
            }
        }
        else {
            current = current[rawPart];
            i++;
        }
    }
    return current;
}
/**
 * Checks if a string value looks like a protocol reference.
 */
function hasProtocol(value) {
    return value.includes('://');
}
/**
 * Detect a leading run of `!` characters used as a boolean coercion / negation
 * marker (`!` = negate, `!!` = coerce to boolean, `!!!` = negate, …). Returns the
 * count and the remaining string, or null when the value does not start with `!`.
 *
 * The marker is only *honored* when the remainder is itself a resolvable
 * reference (see `looksLikeReference`); otherwise the original string is a plain
 * literal — e.g. a CSS `!important` passes through untouched.
 */
function parseNegationMarker(value) {
    let count = 0;
    while (count < value.length && value.charCodeAt(count) === 33 /* '!' */)
        count++;
    if (count === 0)
        return null;
    return { count, rest: value.slice(count) };
}
/**
 * Whether a string should be resolved as a value reference rather than kept as a
 * literal: a `?.` path, a `$0` root reference, or a recognized protocol.
 */
function looksLikeReference(value, protocols) {
    return value.startsWith('?.')
        || value.startsWith('$0')
        || (!!protocols && hasProtocol(value));
}
/**
 * Resolve a single reference string (`?.` path, `$0` root ref, or protocol) to
 * its value. Callers must confirm `looksLikeReference(value)` first.
 */
function resolveReferenceString(value, source, aliasMap, withMethods, protocols, options, substitutionMap) {
    const permissionProcessor = options?.permissionProcessor;
    if (value.startsWith('?.')) {
        const substituted = applySubstitutions(value, substitutionMap);
        const aliased = applyAliases(substituted, aliasMap);
        const parts = parseCachedPath(aliased);
        return parts.length === 0 ? source : navigatePath(source, parts, withMethods, permissionProcessor);
    }
    if (value.startsWith('$0')) {
        const rootRef = resolveRootReference(value, source, options?.root);
        if (rootRef === null)
            return source;
        const substitutedPath = applySubstitutions(rootRef.path, substitutionMap);
        const aliased = applyAliases(substitutedPath, aliasMap);
        const normalizedPath = aliased.startsWith('?.') ? aliased : (aliased ? `?.${aliased}` : '?.');
        const parts = parseCachedPath(normalizedPath);
        return parts.length === 0 ? rootRef.source : navigatePath(rootRef.source, parts, withMethods, permissionProcessor);
    }
    // protocol — looksLikeReference already ensured protocols is defined
    return getProtocolValue(value, protocols, options);
}
/**
 * Resolve a string RHS value: a reference (`?.` / `$0` / protocol), a
 * `!`-prefixed coercion/negation of a reference, or a plain literal.
 */
function resolveStringValue(value, source, aliasMap, withMethods, protocols, options, substitutionMap) {
    // A leading `!` run can only be a coercion/negation marker or a literal —
    // no `?.` path, `$0` ref, or protocol name starts with `!`. Check it first so
    // `hasProtocol` inside `looksLikeReference` can't misread `!!proto://x`.
    if (value.charCodeAt(0) === 33 /* '!' */) {
        const neg = parseNegationMarker(value);
        if (neg !== null && looksLikeReference(neg.rest, protocols)) {
            let resolved = resolveReferenceString(neg.rest, source, aliasMap, withMethods, protocols, options, substitutionMap);
            for (let i = 0; i < neg.count; i++)
                resolved = !resolved;
            return resolved;
        }
        return value;
    }
    if (looksLikeReference(value, protocols)) {
        return resolveReferenceString(value, source, aliasMap, withMethods, protocols, options, substitutionMap);
    }
    return value;
}
/**
 * Resolve a protocol-prefixed value synchronously.
 */
function getProtocolValue(value, protocols, options) {
    const protoEnd = value.indexOf('://');
    const protocol = value.substring(0, protoEnd);
    const handler = protocols[protocol];
    if (!handler)
        return value; // not a recognized protocol
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
function getArray(arr, source, aliasMap, withMethods, protocols, options, substitutionMap) {
    const result = [];
    for (const item of arr) {
        if (typeof item === 'string') {
            result.push(resolveStringValue(item, source, aliasMap, withMethods, protocols, options, substitutionMap));
        }
        else if (Array.isArray(item)) {
            result.push(getArray(item, source, aliasMap, withMethods, protocols, options, substitutionMap));
        }
        else if (item && typeof item === 'object') {
            const proto = Object.getPrototypeOf(item);
            if (proto === Object.prototype || proto === null) {
                result.push(getValues(item, source, options));
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
export function getValues(pattern, source, options) {
    const { aliasMap, withMethods } = normalizeAliasOptions(options);
    const substitutionMap = resolveSubstitutions(options?.substitutions, source, options);
    const protocols = options?.protocols;
    const result = {};
    for (const [key, value] of Object.entries(pattern)) {
        if (typeof value === 'string') {
            result[key] = resolveStringValue(value, source, aliasMap, withMethods, protocols, options, substitutionMap);
        }
        else if (Array.isArray(value)) {
            result[key] = getArray(value, source, aliasMap, withMethods, protocols, options, substitutionMap);
        }
        else if (typeof value === 'object' && value !== null) {
            const proto = Object.getPrototypeOf(value);
            if (proto === Object.prototype || proto === null) {
                result[key] = getValues(value, source, options);
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
/**
 * Synchronously resolve a single `?.`-delimited path string against a source object.
 *
 * @param path - A `?.`-delimited path string (e.g., '?.user?.name')
 * @param source - Object to resolve the path against
 * @param options - Optional withMethods and aka
 * @returns The resolved value, or undefined if any segment is nullish
 */
export function getValue(path, source, options) {
    // Leading `!` run: coerce/negate the resolved reference (`!` negate, `!!` boolean, …).
    // Only honored in front of a `?.` path or `$0` root reference — otherwise literal.
    const neg = parseNegationMarker(path);
    if (neg !== null && (neg.rest.startsWith('?.') || neg.rest.startsWith('$0'))) {
        let resolved = getValue(neg.rest, source, options);
        for (let i = 0; i < neg.count; i++)
            resolved = !resolved;
        return resolved;
    }
    const rootRef = resolveRootReference(path, source, options?.root);
    if (rootRef) {
        path = rootRef.path;
        source = rootRef.source;
    }
    else if (!path.startsWith('?.')) {
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
    if (parts.length === 0)
        return source;
    const { withMethods } = normalizeAliasOptions(options);
    const permissionProcessor = options?.permissionProcessor;
    return navigatePath(source, parts, withMethods, permissionProcessor);
}
