import { globalParserRegistry } from './parserRegistry.js';
// Module-level cache for parsed attribute values
// Structure: Map<configKey, Map<attrValue, parsedValue>>
const parseCache = new Map();
/**
 * Resolves a parser specification to an actual parser function
 * Supports:
 * - Inline functions (direct use)
 * - Named parsers from global registry
 * - Custom element static methods (element-name.methodName)
 *
 * @param parserSpec - Parser function or string reference
 * @returns The resolved parser function
 * @throws Error if parser cannot be resolved
 */
function resolveParser(parserSpec) {
    // Undefined - no parser specified
    if (parserSpec === undefined) {
        return undefined;
    }
    // Inline function - use directly
    if (typeof parserSpec === 'function') {
        return parserSpec;
    }
    // String reference - resolve it
    if (typeof parserSpec === 'string') {
        // Check if it's a custom element reference (contains dot)
        if (parserSpec.includes('.')) {
            const dotIndex = parserSpec.indexOf('.');
            const elementName = parserSpec.substring(0, dotIndex);
            const methodName = parserSpec.substring(dotIndex + 1);
            // Try custom element lookup
            if (typeof customElements !== 'undefined') {
                try {
                    const ctr = customElements.get(elementName);
                    if (ctr && typeof ctr[methodName] === 'function') {
                        return ctr[methodName];
                    }
                }
                catch (e) {
                    // customElements.get might throw, fall through to registry
                }
            }
            // Fall through to global registry (allows dot notation in registry too)
        }
        // Try global registry
        const parser = globalParserRegistry.get(parserSpec);
        if (parser) {
            return parser;
        }
        // Not found anywhere
        throw new Error(`Parser "${parserSpec}" not found. ` +
            `Check that it's registered in globalParserRegistry or exists as a static method on the custom element.`);
    }
    return undefined;
}
/**
 * Creates a cache key from an AttrConfig
 * Includes instanceOf and parser identifier to ensure correct cache hits
 */
function getCacheKey(config) {
    const instanceOfStr = typeof config.instanceOf === 'function'
        ? config.instanceOf.name
        : (config.instanceOf || 'default');
    // Include parser in cache key
    let parserStr;
    if (config.parser === undefined) {
        parserStr = 'builtin';
    }
    else if (typeof config.parser === 'string') {
        parserStr = `named:${config.parser}`;
    }
    else {
        parserStr = 'custom';
    }
    return `${instanceOfStr}|${parserStr}`;
}
/**
 * Gets a cached parsed value or parses and caches it
 * @param attrValue - The attribute value to parse (or null)
 * @param config - The attribute configuration
 * @param parser - The parser function to use
 * @returns The parsed value
 */
function parseWithCache(attrValue, config, parser) {
    // Skip caching for Boolean (presence check doesn't benefit from caching)
    if (config.instanceOf === 'Boolean') {
        return parser(attrValue);
    }
    // Get or create cache for this config
    const cacheKey = getCacheKey(config);
    if (!parseCache.has(cacheKey)) {
        parseCache.set(cacheKey, new Map());
    }
    const valueCache = parseCache.get(cacheKey);
    // Use special key for null values
    const valueCacheKey = attrValue === null ? '__NULL__' : attrValue;
    // Check if we have a cached value
    if (valueCache.has(valueCacheKey)) {
        const cachedValue = valueCache.get(valueCacheKey);
        // Return clone if requested
        if (config.parseCache === 'cloned') {
            // Use structuredClone for deep cloning
            return structuredClone(cachedValue);
        }
        // Return shared reference
        return cachedValue;
    }
    // Parse the value
    const parsedValue = parser(attrValue);
    // Store in cache
    valueCache.set(valueCacheKey, parsedValue);
    // Return clone if requested (even on first parse)
    if (config.parseCache === 'cloned') {
        return structuredClone(parsedValue);
    }
    return parsedValue;
}
/**
 * Checks if a string contains a dash or non-ASCII character
 */
function hasDashOrNonASCII(str) {
    if (str.includes('-'))
        return true;
    // Check for non-ASCII characters
    for (let i = 0; i < str.length; i++) {
        if (str.charCodeAt(i) > 127)
            return true;
    }
    return false;
}
/**
 * Gets attribute value with smart enh- prefix handling
 * @param element - The element to read from
 * @param attrName - The attribute name (without enh- prefix)
 * @param allowUnprefixed - Pattern (string or RegExp) that element tag name must match to allow unprefixed attributes
 * @returns The attribute value or null
 */
function getAttributeValue(element, attrName, allowUnprefixed) {
    const isCustomElement = element.tagName.includes('-');
    const isSVGElement = typeof SVGElement !== 'undefined' && element instanceof SVGElement;
    // For custom elements and SVG - strict enh- requirement
    if (isCustomElement || isSVGElement) {
        const enhValue = element.getAttribute(`enh-${attrName}`);
        if (enhValue !== null)
            return enhValue;
        // Only fallback if tag name matches the allowUnprefixed pattern
        if (allowUnprefixed) {
            const pattern = typeof allowUnprefixed === 'string' ? new RegExp(allowUnprefixed) : allowUnprefixed;
            const tagName = element.tagName.toLowerCase();
            if (pattern.test(tagName)) {
                return element.getAttribute(attrName);
            }
        }
        return null;
    }
    // For built-in elements - enh- is alias (try enh- first, fallback to unprefixed)
    const enhValue = element.getAttribute(`enh-${attrName}`);
    if (enhValue !== null)
        return enhValue;
    return element.getAttribute(attrName);
}
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
 * @param allowUnprefixed - Pattern (string or RegExp) that element tag name must match to allow unprefixed attributes
 * @returns Object with parsed attribute values ready for initVals
 */
export function parseWithAttrs(element, attrPatterns, allowUnprefixed) {
    // Validate base attribute if present
    if ('base' in attrPatterns) {
        const baseValue = attrPatterns.base;
        if (!hasDashOrNonASCII(baseValue)) {
            throw new Error(`Invalid base attribute "${baseValue}": must contain a dash (-) or non-ASCII character. ` +
                `Examples: "data-config", "my-attr", "🎨-theme"`);
        }
    }
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
        const attrValue = getAttributeValue(element, attrName, allowUnprefixed);
        // Handle missing attribute
        if (attrValue === null) {
            // Use valIfNull if defined
            if (config.valIfNull !== undefined) {
                const mapsTo = config.mapsTo ?? (key === 'base' ? '.' : key);
                if (mapsTo === '.') {
                    // Spread into root
                    if (typeof config.valIfNull === 'object' && config.valIfNull !== null) {
                        Object.assign(result, config.valIfNull);
                    }
                }
                else {
                    result[mapsTo] = config.valIfNull;
                }
            }
            // Skip if no valIfNull and not Boolean (Boolean uses presence check)
            else if (config.instanceOf !== 'Boolean') {
                continue;
            }
            // For Boolean without valIfNull, fall through to parser
            else {
                const parser = resolveParser(config.parser) || getDefaultParser(config.instanceOf);
                const parsedValue = parser(attrValue);
                const mapsTo = config.mapsTo ?? (key === 'base' ? '.' : key);
                result[mapsTo] = parsedValue;
            }
            continue;
        }
        // Attribute exists - parse normally
        const parser = resolveParser(config.parser) || getDefaultParser(config.instanceOf);
        // Use cache if parseCache is specified
        const parsedValue = config.parseCache
            ? parseWithCache(attrValue, config, parser)
            : parser(attrValue);
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
