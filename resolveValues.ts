/**
 * Options for resolveValues
 */
export interface ResolveValuesOptions {
  /**
   * Method names that should be called instead of accessed as properties.
   * When a path segment matches, it's called as a method with the next segment as argument.
   */
  withMethods?: string[] | Set<string>;
  
  /**
   * Alias mappings for path segments.
   * Substituted before path resolution, matching complete tokens between `?.` delimiters.
   */
  aka?: Record<string, string>;

  /**
   * Protocol handlers for resolving protocol-prefixed values (e.g., 'globalThis://key').
   * Each handler receives the key portion and returns the resolved value (sync or async).
   * 
   * If a value contains '://' but the protocol isn't in this map, the value passes through unchanged.
   * If a '?.' appears after the protocol key, the remaining path is resolved against the handler's result.
   * 
   * @example
   * protocols: {
   *     globalThis: (key) => globalThis[key],
   *     localStorage: (key) => JSON.parse(localStorage.getItem(key) || 'null')
   * }
   */
  protocols?: Record<string, (key: string) => any | Promise<any>>;
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
 * Resolves a protocol-prefixed value (e.g., 'globalThis://key?.path').
 * 
 * 1. Extracts the protocol name (before '://')
 * 2. If the protocol isn't in the protocols map, returns the value unchanged (false positive)
 * 3. Extracts the key (between '://' and first '?.' or end of string)
 * 4. Calls the protocol handler with the key
 * 5. If there's a remaining '?.' path, resolves it against the handler's result
 */
async function resolveProtocolValue(
    value: string,
    protocols: Record<string, (key: string) => any | Promise<any>>,
    options?: ResolveValuesOptions
): Promise<any> {
    // Extract protocol name (before ://)
    const protoEnd = value.indexOf('://');
    const protocol = value.substring(0, protoEnd);

    // Resolve via protocol handler
    const handler = protocols[protocol];
    if (!handler) return value; // false flag — coincidentally looks like a protocol

    const rest = value.substring(protoEnd + 3);

    // Split at first ?. to separate key from path
    const pathStart = rest.indexOf('?.');
    const key = pathStart === -1 ? rest : rest.substring(0, pathStart);
    const path = pathStart === -1 ? null : rest.substring(pathStart);

    const resolved = await handler(key);

    // If there's a remaining path, resolve it against the result
    if (path) {
        return resolveValue(path, resolved, options);
    }
    return resolved;
}

/**
 * Checks if a string value looks like a protocol reference.
 */
function hasProtocol(value: string): boolean {
    return value.includes('://');
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
          // Call method with next segment as argument, consume it
          current = method.call(current, nextPart);
          i += 2;
        } else {
          // Consecutive methods or last segment — call with no args
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
 * Resolve RHS path strings in a pattern object against a source object.
 * 
 * Any value that is a string starting with `?.` is treated as a path
 * and resolved against the source object using optional chaining semantics.
 * Non-string values and strings not starting with `?.` pass through unchanged.
 * 
 * Supports `withMethods` for calling methods during resolution and `aka` for
 * alias substitution, consistent with assignGingerly's LHS path handling.
 * 
 * Special case: `'?.'` (empty path) resolves to the source object itself.
 * 
 * @param pattern - Object whose RHS values may contain `?.` path strings
 * @param source - Object to resolve paths against
 * @param options - Optional withMethods and aka for method calls and aliases
 * @returns New object with path strings replaced by resolved values
 * 
 * @example
 * const result = resolveValues({
 *   hello: '?.myPropContainer?.stringProp',
 *   foo: '?.myFooString',
 *   literal: 42
 * }, source);
 * 
 * @example
 * // With methods and aliases
 * const result = resolveValues({
 *   text: '?.q?..username?.textContent'
 * }, source, { 
 *   withMethods: ['querySelector'],
 *   aka: { 'q': 'querySelector' }
 * });
 */
export async function resolveValues(
  pattern: Record<string, any>,
  source: any,
  options?: ResolveValuesOptions
): Promise<Record<string, any>> {
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
      // Apply aliases to the RHS path
      const aliased = applyAliases(value, aliasMap);
      
      // Parse path with caching
      const parts = parseCachedPath(aliased);
      
      // Navigate with method support
      result[key] = parts.length === 0 ? source : navigatePath(source, parts, withMethods);
    } else if (typeof value === 'string' && protocols && hasProtocol(value)) {
      // Protocol-prefixed value — resolve asynchronously
      result[key] = await resolveProtocolValue(value, protocols, options);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Resolve a single `?.`-delimited path string against a source object.
 * 
 * This is a lighter-weight alternative to `resolveValues` when you only need
 * to resolve one path and don't want the overhead of creating wrapper objects.
 * 
 * @param path - A `?.`-delimited path string (e.g., '?.behaviors?.command')
 * @param source - Object to resolve the path against
 * @param options - Optional withMethods and aka for method calls and aliases
 * @returns The resolved value, or undefined if any segment is nullish
 * 
 * @example
 * const value = resolveValue('?.behaviors?.commandBehavior?.command', el);
 * 
 * @example
 * const value = resolveValue('?.q?.myEl?.textContent', el, {
 *   withMethods: ['querySelector'],
 *   aka: { 'q': 'querySelector' }
 * });
 */
export function resolveValue(
  path: string,
  source: any,
  options?: ResolveValuesOptions
): any {
  if (!path.startsWith('?.')) return path;

  // Build alias map
  let aliased = path;
  if (options?.aka) {
    const aliasMap = new Map<string, string>();
    for (const [alias, target] of Object.entries(options.aka)) {
      aliasMap.set(alias, target);
    }
    aliased = applyAliases(path, aliasMap);
  }

  // Parse path with caching
  const parts = parseCachedPath(aliased);
  if (parts.length === 0) return source;

  // Build methods set
  const withMethods = options?.withMethods
    ? options.withMethods instanceof Set
      ? options.withMethods
      : new Set(options.withMethods)
    : undefined;

  return navigatePath(source, parts, withMethods);
}
