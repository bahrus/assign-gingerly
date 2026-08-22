import { globalParserRegistry, getParserRegistry } from './parserRegistry.js';
import { resolveTemplate } from './resolve/resolveTemplate.js';
// Module-level cache for parsed attribute values
// Structure: Map<configKey, Map<attrValue, parsedValue>>
const parseCache = new Map();
/**
 * Detects whether a value is a class-based parser constructor.
 * Class parsers must have a `parse` method on their prototype.
 */
function isAttrParserConstructor(value) {
    return typeof value === 'function' && !!value.prototype && 'parse' in value.prototype;
}
/**
 * Instantiates a class parser and returns a wrapper function that calls its parse method.
 * A new instance is created for each attribute parse (no cross-call caching).
 */
function instantiateClassParser(ParserCtor, options) {
    const instance = new ParserCtor(options);
    return (attrValue, context) => instance.parse(attrValue, context);
}
/**
 * Looks up a named parser in the scoped (if available) then global registry.
 */
function lookupNamedParser(name, synthesizerElement) {
    // Check scoped registry first (if synthesizerElement provided)
    if (synthesizerElement) {
        const scopedRegistry = getParserRegistry(synthesizerElement);
        const scopedParser = scopedRegistry.get(name);
        if (scopedParser) {
            return scopedParser;
        }
    }
    // Fallback to global registry
    const globalParser = globalParserRegistry.get(name);
    if (globalParser) {
        return globalParser;
    }
    // Not found in either registry
    throw new Error(`Parser "${name}" not found. ` +
        `Checked ${synthesizerElement ? 'scoped registry and ' : ''}global registry.\n` +
        `Ensure the parser is registered via:\n` +
        `- <script type="emc-parser" src="..." parser-name="${name}">\n` +
        `- registerParser(synthesizerElement, "${name}", parserFn)\n` +
        `- globalParserRegistry.register("${name}", parserFn)`);
}
/**
 * Resolves a parser specification to an actual parser function
 * Supports:
 * - Inline functions (direct use)
 * - Named parser functions or class constructors from scoped/global registry (string form)
 * - Named class parsers with options from the object form { name, options }
 * - Custom element static methods via tuple form [elementName, methodName]
 *
 * @param parserSpec - Parser function, string reference, tuple, or object reference
 * @param synthesizerElement - Optional synthesizer element for scoped parser lookup
 * @param parserOptions - Optional constructor options when a string resolves to a class parser
 * @returns The resolved parser function
 * @throws Error if parser cannot be resolved
 */
function resolveParser(parserSpec, synthesizerElement, parserOptions) {
    // Undefined - no parser specified
    if (parserSpec === undefined) {
        return undefined;
    }
    // Inline function - use directly
    if (typeof parserSpec === 'function') {
        return parserSpec;
    }
    // Object form: { name, options }
    if (parserSpec !== null &&
        typeof parserSpec === 'object' &&
        !Array.isArray(parserSpec) &&
        'name' in parserSpec) {
        const { name, options } = parserSpec;
        const registered = lookupNamedParser(name, synthesizerElement);
        if (isAttrParserConstructor(registered)) {
            return instantiateClassParser(registered, options);
        }
        return registered;
    }
    // String reference - resolve from scoped or global registry
    if (typeof parserSpec === 'string') {
        const registered = lookupNamedParser(parserSpec, synthesizerElement);
        if (isAttrParserConstructor(registered)) {
            return instantiateClassParser(registered, parserOptions);
        }
        return registered;
    }
    // Tuple reference: [elementName, methodName]
    if (Array.isArray(parserSpec) && parserSpec.length === 2) {
        const [elementName, methodName] = parserSpec;
        const Ctr = customElements.get(elementName);
        if (!Ctr) {
            throw new Error(`Cannot resolve parser [${elementName}, ${methodName}]: custom element "${elementName}" not found`);
        }
        const method = Ctr[methodName];
        if (typeof method !== 'function') {
            throw new Error(`Cannot resolve parser [${elementName}, ${methodName}]: static method "${methodName}" not found on custom element "${elementName}"`);
        }
        return method.bind(Ctr);
    }
    return undefined;
}
/**
 * Serializes parser options for use in cache keys.
 * RegExp values are normalized to their string representation.
 */
function serializeParserOptions(options) {
    if (options === undefined || options === null) {
        return '';
    }
    try {
        return JSON.stringify(options, (_key, value) => {
            if (value instanceof RegExp) {
                return value.toString();
            }
            return value;
        });
    }
    catch (_e) {
        return String(options);
    }
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
        const optionsStr = serializeParserOptions(config.parserOptions);
        parserStr = `named:${config.parser}|options:${optionsStr}`;
    }
    else if (config.parser !== null &&
        typeof config.parser === 'object' &&
        !Array.isArray(config.parser) &&
        'name' in config.parser) {
        const ref = config.parser;
        const optionsStr = serializeParserOptions(ref.options);
        parserStr = `named:${ref.name}|options:${optionsStr}`;
    }
    else if (Array.isArray(config.parser)) {
        parserStr = `tuple:${config.parser[0]},${config.parser[1]}`;
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
 * @param context - The parser context to pass to the parser
 * @returns The parsed value
 */
function parseWithCache(attrValue, config, parser, context) {
    // Skip caching for Boolean (presence check doesn't benefit from caching)
    if (config.instanceOf === 'Boolean') {
        return callParser(parser, attrValue, context);
    }
    // Get or create cache for this config
    const cacheKey = getCacheKey(config);
    const valueCache = parseCache.getOrInsertComputed(cacheKey, () => new Map());
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
    const parsedValue = callParser(parser, attrValue, context);
    // Store in cache
    valueCache.set(valueCacheKey, parsedValue);
    // Return clone if requested (even on first parse)
    if (config.parseCache === 'cloned') {
        return structuredClone(parsedValue);
    }
    return parsedValue;
}
/**
 * Calls a parser function with the appropriate signature
 * Handles both simple (value-only) and advanced (value + context) parser signatures
 * @param parser - The parser function
 * @param attrValue - The attribute value
 * @param context - The parser context
 * @returns The parsed value
 */
function callParser(parser, attrValue, context) {
    // Check parser arity (number of parameters)
    // If parser accepts 2+ parameters, pass context
    if (parser.length >= 2) {
        return parser(attrValue, context);
    }
    // Otherwise, call with just the value (simple form)
    return parser(attrValue);
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
 * @param allowUnprefixed - Pattern (string or RegExp) that element tag name must match to allow unprefixed attributes,
 *                          or `true` for custom element mode (read attributes directly, no enh- prefix)
 * @returns The attribute value or null
 */
function getAttributeValue(element, attrName, allowUnprefixed) {
    // Custom element mode - read attribute directly, no enh- prefix
    if (allowUnprefixed === true) {
        return element.getAttribute(attrName);
    }
    const { localName } = element;
    const isCustomElement = localName.includes('-');
    const isSVGElement = typeof SVGElement !== 'undefined' && element instanceof SVGElement;
    // For custom elements and SVG - strict enh- requirement
    if (isCustomElement || isSVGElement) {
        const enhValue = element.getAttribute(`enh-${attrName}`);
        if (enhValue !== null)
            return enhValue;
        // Only fallback if tag name matches the allowUnprefixed pattern
        if (allowUnprefixed) {
            const pattern = typeof allowUnprefixed === 'string' ? new RegExp(allowUnprefixed) : allowUnprefixed;
            if (pattern.test(localName)) {
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
 * @param allowUnprefixed - Pattern (string or RegExp) that element tag name must match to allow unprefixed attributes,
 *                          or `true` for custom element mode: reads attributes directly (no enh- prefix),
 *                          skips base attribute dash validation, and skips properties already set on the element
 * @param spawnContext - Optional spawn context containing enhancement config and synthesizer element
 * @returns Object with parsed attribute values ready for initVals
 */
export function parseWithAttrs(element, attrPatterns, allowUnprefixed, spawnContext) {
    // Extract synthesizerElement from spawnContext for backward compatibility
    const synthesizerElement = spawnContext?.synthesizerElement;
    const isCustomElementMode = allowUnprefixed === true;
    // Validate base attribute if present (skip in custom element mode)
    if ('base' in attrPatterns && !isCustomElementMode) {
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
        // In custom element mode, skip properties already set on the element
        if (isCustomElementMode) {
            const mapsTo = config.mapsTo ?? (key === 'base' ? '.' : key);
            if (mapsTo !== '.' && element[mapsTo] !== undefined) {
                continue;
            }
        }
        const attrValue = getAttributeValue(element, attrName, allowUnprefixed);
        // Create parser context
        const parserContext = {
            attrConfig: config,
            spawnContext,
            element,
            attrName
        };
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
                const parser = resolveParser(config.parser, synthesizerElement, config.parserOptions) || getDefaultParser(config.instanceOf);
                const parsedValue = callParser(parser, attrValue, parserContext);
                const mapsTo = config.mapsTo ?? (key === 'base' ? '.' : key);
                result[mapsTo] = parsedValue;
            }
            continue;
        }
        // Attribute exists - parse normally
        const parser = resolveParser(config.parser, synthesizerElement, config.parserOptions) || getDefaultParser(config.instanceOf);
        // Use cache if parseCache is specified
        const parsedValue = config.parseCache
            ? parseWithCache(attrValue, config, parser, parserContext)
            : callParser(parser, attrValue, parserContext);
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
