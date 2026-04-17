import { AttrPatterns, AttrConfig, ParserFunction, ParserContext, SpawnContext } from './types/assign-gingerly/types';
import { globalParserRegistry, getParserRegistry } from './parserRegistry.js';
import { resolveTemplate } from './resolveTemplate.js';

// Module-level cache for parsed attribute values
// Structure: Map<configKey, Map<attrValue, parsedValue>>
const parseCache = new Map<string, Map<string, any>>();

/**
 * Resolves a parser specification to an actual parser function
 * Supports:
 * - Inline functions (direct use)
 * - Named parsers from scoped registry (if synthesizerElement provided)
 * - Named parsers from global registry (fallback)
 * 
 * @param parserSpec - Parser function or string reference
 * @param synthesizerElement - Optional synthesizer element for scoped parser lookup
 * @returns The resolved parser function
 * @throws Error if parser cannot be resolved
 */
function resolveParser(
  parserSpec: ParserFunction | string | undefined,
  synthesizerElement?: Element
): ParserFunction | undefined {
  // Undefined - no parser specified
  if (parserSpec === undefined) {
    return undefined;
  }
  
  // Inline function - use directly
  if (typeof parserSpec === 'function') {
    return parserSpec;
  }
  
  // String reference - resolve from scoped or global registry
  if (typeof parserSpec === 'string') {
    // Check scoped registry first (if synthesizerElement provided)
    if (synthesizerElement) {
      const scopedRegistry = getParserRegistry(synthesizerElement);
      const scopedParser = scopedRegistry.get(parserSpec);
      if (scopedParser) {
        return scopedParser;
      }
    }
    
    // Fallback to global registry
    const globalParser = globalParserRegistry.get(parserSpec);
    if (globalParser) {
      return globalParser;
    }
    
    // Not found in either registry
    throw new Error(
      `Parser "${parserSpec}" not found. ` +
      `Checked ${synthesizerElement ? 'scoped registry and ' : ''}global registry.\n` +
      `Ensure the parser is registered via:\n` +
      `- <script type="emc-parser" src="..." parser-name="${parserSpec}">\n` +
      `- registerParser(synthesizerElement, "${parserSpec}", parserFn)\n` +
      `- globalParserRegistry.register("${parserSpec}", parserFn)`
    );
  }
  
  return undefined;
}

/**
 * Creates a cache key from an AttrConfig
 * Includes instanceOf and parser identifier to ensure correct cache hits
 */
function getCacheKey(config: AttrConfig<any>): string {
  const instanceOfStr = typeof config.instanceOf === 'function' 
    ? config.instanceOf.name 
    : (config.instanceOf || 'default');
  
  // Include parser in cache key
  let parserStr: string;
  if (config.parser === undefined) {
    parserStr = 'builtin';
  } else if (typeof config.parser === 'string') {
    parserStr = `named:${config.parser}`;
  } else {
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
function parseWithCache(
  attrValue: string | null,
  config: AttrConfig<any>,
  parser: ParserFunction,
  context: ParserContext
): any {
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
function callParser(
  parser: ParserFunction,
  attrValue: string | null,
  context: ParserContext
): any {
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
function hasDashOrNonASCII(str: string): boolean {
  if (str.includes('-')) return true;
  // Check for non-ASCII characters
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) > 127) return true;
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
function getAttributeValue(
  element: Element,
  attrName: string,
  allowUnprefixed?: string | RegExp
): string | null {
  const isCustomElement = element.tagName.includes('-');
  const isSVGElement = typeof SVGElement !== 'undefined' && element instanceof SVGElement;
  
  // For custom elements and SVG - strict enh- requirement
  if (isCustomElement || isSVGElement) {
    const enhValue = element.getAttribute(`enh-${attrName}`);
    if (enhValue !== null) return enhValue;
    
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
  if (enhValue !== null) return enhValue;
  return element.getAttribute(attrName);
}

/**
 * Gets the default parser for a given instanceOf type
 */
function getDefaultParser(instanceOf?: string | Function): ParserFunction {
    if (!instanceOf) {
        return (v: string | null) => v; // Default to identity
    }
    
    const typeStr = typeof instanceOf === 'string' ? instanceOf : instanceOf.name;
    
    switch (typeStr) {
        case 'Object':
            return (v: string | null) => {
                if (v === null || v === '') return null;
                try {
                    return JSON.parse(v);
                } catch (e) {
                    throw new Error(`Failed to parse JSON: "${v}". Error: ${e}`);
                }
            };
        case 'Array':
            return (v: string | null) => {
                if (v === null || v === '') return null;
                try {
                    return JSON.parse(v);
                } catch (e) {
                    throw new Error(`Failed to parse JSON array: "${v}". Error: ${e}`);
                }
            };
        case 'Number':
            return (v: string | null) => {
                if (v === null || v === '') return null;
                const num = Number(v);
                if (isNaN(num)) {
                    throw new Error(`Failed to parse number: "${v}"`);
                }
                return num;
            };
        case 'Boolean':
            return (v: string | null) => v !== null; // Presence check
        case 'String':
        default:
            return (v: string | null) => v; // Identity
    }
}

/**
 * Parses attributes from an element based on AttrPatterns configuration
 * @param element - The DOM element to read attributes from
 * @param attrPatterns - The attribute patterns configuration
 * @param allowUnprefixed - Pattern (string or RegExp) that element tag name must match to allow unprefixed attributes
 * @param spawnContext - Optional spawn context containing enhancement config and synthesizer element
 * @returns Object with parsed attribute values ready for initVals
 */
export function parseWithAttrs<T = any>(
    element: Element,
    attrPatterns: AttrPatterns<T>,
    allowUnprefixed?: string | RegExp,
    spawnContext?: SpawnContext<T>
): Partial<T> {
    // Extract synthesizerElement from spawnContext for backward compatibility
    const synthesizerElement = spawnContext?.synthesizerElement;
    
    // Validate base attribute if present
    if ('base' in attrPatterns) {
        const baseValue = attrPatterns.base as string;
        if (!hasDashOrNonASCII(baseValue)) {
            throw new Error(
                `Invalid base attribute "${baseValue}": must contain a dash (-) or non-ASCII character. ` +
                `Examples: "data-config", "my-attr", "🎨-theme"`
            );
        }
    }
    
    const result: any = {};
    const resolvedCache = new Map<string, string>();
    
    // First pass: resolve all template strings
    const resolvedAttrs: Map<string, { attrName: string; config: AttrConfig<T> }> = new Map();
    
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
            let config: AttrConfig<T>;
            
            if (configKey in attrPatterns) {
                config = attrPatterns[configKey] as AttrConfig<T>;
            } else {
                // Default config
                config = {
                    mapsTo: key as keyof T,
                    instanceOf: 'String'
                };
            }
            
            resolvedAttrs.set(key, { attrName: resolvedAttrName, config });
        }
    }
    
    // Handle base attribute specially
    if ('base' in attrPatterns) {
        const baseAttrName = attrPatterns.base as string;
        let baseConfig: AttrConfig<T>;
        
        if ('_base' in attrPatterns) {
            baseConfig = attrPatterns._base as AttrConfig<T>;
        } else {
            // Default base config
            baseConfig = {
                mapsTo: '.' as any,
                instanceOf: 'Object'
            };
        }
        
        resolvedAttrs.set('base', { attrName: baseAttrName, config: baseConfig });
    }
    
    // Second pass: read attributes and parse values
    for (const [key, { attrName, config }] of resolvedAttrs) {
        const attrValue = getAttributeValue(element, attrName, allowUnprefixed);
        
        // Create parser context
        const parserContext: ParserContext<T> = {
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
                } else {
                    result[mapsTo as string] = config.valIfNull;
                }
            }
            // Skip if no valIfNull and not Boolean (Boolean uses presence check)
            else if (config.instanceOf !== 'Boolean') {
                continue;
            }
            // For Boolean without valIfNull, fall through to parser
            else {
                const parser = resolveParser(config.parser, synthesizerElement) || getDefaultParser(config.instanceOf);
                const parsedValue = callParser(parser, attrValue, parserContext);
                const mapsTo = config.mapsTo ?? (key === 'base' ? '.' : key);
                result[mapsTo as string] = parsedValue;
            }
            continue;
        }
        
        // Attribute exists - parse normally
        const parser = resolveParser(config.parser, synthesizerElement) || getDefaultParser(config.instanceOf);
        
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
        } else {
            result[mapsTo as string] = parsedValue;
        }
    }
    
    return result;
}
