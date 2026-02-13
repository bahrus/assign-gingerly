/**
 * Resolves template variables in a string recursively
 * @param template - Template string with ${var} placeholders
 * @param patterns - The patterns object containing variable values
 * @param resolvedCache - Cache of already resolved values
 * @param visitedKeys - Set of keys being resolved (for cycle detection)
 * @returns Resolved string
 */
function resolveTemplate(template, patterns, resolvedCache, visitedKeys = new Set()) {
    return template.replace(/\$\{(\w+)\}/g, (match, varName) => {
        // Check if already resolved
        if (resolvedCache.has(varName)) {
            return resolvedCache.get(varName);
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
/**
 * Gets the default parser for a given instanceOf type
 */
function getDefaultParser(instanceOf) {
    if (!instanceOf) {
        return (v) => v; // Default to identity
    }
    const typeStr = typeof instanceOf === 'string' ? instanceOf : instanceOf.name;
    switch (typeStr) {
        case 'Object':
            return (v) => {
                if (v === null || v === '')
                    return null;
                try {
                    return JSON.parse(v);
                }
                catch (e) {
                    throw new Error(`Failed to parse JSON: "${v}". Error: ${e}`);
                }
            };
        case 'Array':
            return (v) => {
                if (v === null || v === '')
                    return null;
                try {
                    return JSON.parse(v);
                }
                catch (e) {
                    throw new Error(`Failed to parse JSON array: "${v}". Error: ${e}`);
                }
            };
        case 'Number':
            return (v) => {
                if (v === null || v === '')
                    return null;
                const num = Number(v);
                if (isNaN(num)) {
                    throw new Error(`Failed to parse number: "${v}"`);
                }
                return num;
            };
        case 'Boolean':
            return (v) => v !== null; // Presence check
        case 'String':
        default:
            return (v) => v; // Identity
    }
}
/**
 * Parses attributes from an element based on AttrPatterns configuration
 * @param element - The DOM element to read attributes from
 * @param attrPatterns - The attribute patterns configuration
 * @returns Object with parsed attribute values ready for initVals
 */
export function parseWithAttrs(element, attrPatterns) {
    const result = {};
    const resolvedCache = new Map();
    // First pass: resolve all template strings
    const resolvedAttrs = new Map();
    for (const key in attrPatterns) {
        // Skip base and underscore-prefixed keys
        if (key === 'base' || key.startsWith('_')) {
            continue;
        }
        const value = attrPatterns[key];
        if (typeof value === 'string') {
            // This is a template string
            const resolvedAttrName = resolveTemplate(value, attrPatterns, resolvedCache);
            // Get or create config
            const configKey = `_${key}`;
            let config;
            if (configKey in attrPatterns) {
                config = attrPatterns[configKey];
            }
            else {
                // Default config
                config = {
                    mapsTo: key,
                    instanceOf: 'String'
                };
            }
            resolvedAttrs.set(key, { attrName: resolvedAttrName, config });
        }
    }
    // Handle base attribute specially
    if ('base' in attrPatterns) {
        const baseAttrName = attrPatterns.base;
        let baseConfig;
        if ('_base' in attrPatterns) {
            baseConfig = attrPatterns._base;
        }
        else {
            // Default base config
            baseConfig = {
                mapsTo: '.',
                instanceOf: 'Object'
            };
        }
        resolvedAttrs.set('base', { attrName: baseAttrName, config: baseConfig });
    }
    // Second pass: read attributes and parse values
    for (const [key, { attrName, config }] of resolvedAttrs) {
        const attrValue = element.getAttribute(attrName);
        // Skip if attribute doesn't exist
        if (attrValue === null && config.instanceOf !== 'Boolean') {
            continue;
        }
        // Get parser
        const parser = config.parser || getDefaultParser(config.instanceOf);
        // Parse value
        const parsedValue = parser(attrValue);
        // Determine target property
        const mapsTo = config.mapsTo ?? (key === 'base' ? '.' : key);
        // Add to result
        if (mapsTo === '.') {
            // Spread into root
            if (typeof parsedValue === 'object' && parsedValue !== null) {
                Object.assign(result, parsedValue);
            }
        }
        else {
            result[mapsTo] = parsedValue;
        }
    }
    return result;
}
