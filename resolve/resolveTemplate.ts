/**
 * Resolves template variables in a string recursively
 * Supports ${varName} syntax for variable substitution
 * 
 * @param template - Template string with ${var} placeholders
 * @param patterns - The patterns object containing variable values
 * @param resolvedCache - Cache of already resolved values
 * @param visitedKeys - Set of keys being resolved (for cycle detection)
 * @returns Resolved string
 * 
 * @throws Error if circular reference is detected
 * @throws Error if template variable is undefined
 * 
 * @example
 * const patterns = {
 *   base: 'my-component',
 *   theme: '${base}-theme'
 * };
 * const cache = new Map();
 * 
 * resolveTemplate('${theme}', patterns, cache);
 * // Returns: 'my-component-theme'
 */
export function resolveTemplate(
    template: string,
    patterns: Record<string, any>,
    resolvedCache: Map<string, string>,
    visitedKeys: Set<string> = new Set()
): string {
    return template.replace(/\$\{(\w+)\}/g, (_match, varName) => {
        // Check if already resolved
        if (resolvedCache.has(varName)) {
            return resolvedCache.get(varName)!;
        }
        
        // Check for circular reference
        if (visitedKeys.has(varName)) {
            throw new Error(`Circular reference detected in template variable: ${varName}`);
        }
        
        const value = patterns[varName];
        
        if (value === undefined) {
            throw new Error(`Undefined template variable: ${varName}`);
        }
        
        if (typeof value === 'string') {
            // Recursively resolve
            visitedKeys.add(varName);
            const resolved = resolveTemplate(value, patterns, resolvedCache, visitedKeys);
            visitedKeys.delete(varName);
            resolvedCache.set(varName, resolved);
            return resolved;
        }
        
        // Non-string value, return as-is
        return String(value);
    });
}
