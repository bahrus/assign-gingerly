import { EnhancementConfig, AttrPatterns } from './types/assign-gingerly/types';
import { resolveTemplate } from './resolveTemplate.js';

/**
 * Extracts attribute names from withAttrs configuration
 * Resolves template variables and excludes underscore-prefixed config keys
 * @param withAttrs - The attribute patterns configuration
 * @returns Array of resolved attribute names
 */
export function extractAttributeNames(withAttrs: AttrPatterns<any>): string[] {
    const names: string[] = [];
    const resolvedCache = new Map<string, string>();
    
    // Add base if present
    if ('base' in withAttrs && typeof withAttrs.base === 'string') {
        names.push(withAttrs.base);
    }
    
    // Add other attributes (skip underscore-prefixed config keys)
    for (const key in withAttrs) {
        if (key === 'base' || key.startsWith('_')) {
            continue;
        }
        
        const value = withAttrs[key];
        if (typeof value === 'string') {
            // Resolve template variables
            const resolved = resolveTemplate(value, withAttrs, resolvedCache);
            names.push(resolved);
        }
    }
    
    return names;
}

/**
 * Builds a CSS query selector that matches elements with attributes from withAttrs
 * Creates a cross-product of selectors and attribute names (both prefixed and unprefixed)
 * 
 * @param config - Enhancement configuration with withAttrs
 * @param selectors - Optional comma-separated CSS selectors to match (e.g., 'template, script')
 *                    If omitted or empty, returns just the attribute selectors without element prefix
 * @returns CSS query string with cross-product of selectors and attributes
 * 
 * @example
 * const config = {
 *   spawn: MyClass,
 *   withAttrs: {
 *     base: 'my-attr',
 *     theme: '${base}-theme'
 *   }
 * };
 * 
 * // With selectors
 * buildCSSQuery(config, 'div, span');
 * // Returns: 'div[my-attr], span[my-attr], div[enh-my-attr], span[enh-my-attr], 
 * //           div[my-attr-theme], span[my-attr-theme], div[enh-my-attr-theme], span[enh-my-attr-theme]'
 * 
 * // Without selectors (matches any element)
 * buildCSSQuery(config);
 * // or
 * buildCSSQuery(config, '');
 * // Returns: '[my-attr], [enh-my-attr], [my-attr-theme], [enh-my-attr-theme]'
 */
export function buildCSSQuery(
    config: EnhancementConfig,
    selectors?: string
): string {
    // Validate inputs
    if (!config.withAttrs) {
        return '';
    }
    
    // Extract and resolve attribute names first
    const attrNames = extractAttributeNames(config.withAttrs);
    
    if (attrNames.length === 0) {
        return '';
    }
    
    // Parse and normalize selectors
    const selectorList = selectors
        ? selectors.split(',').map(s => s.trim()).filter(s => s.length > 0)
        : [];
    
    // Build queries
    const queries: string[] = [];
    
    if (selectorList.length === 0) {
        // No selectors provided - return just attribute selectors
        for (const attrName of attrNames) {
            queries.push(`[${attrName}]`);
            queries.push(`[enh-${attrName}]`);
        }
    } else {
        // Build cross-product of selectors × attributes × prefixes
        for (const selector of selectorList) {
            for (const attrName of attrNames) {
                // Unprefixed version
                queries.push(`${selector}[${attrName}]`);
                // enh- prefixed version
                queries.push(`${selector}[enh-${attrName}]`);
            }
        }
    }
    
    // Deduplicate and join
    const uniqueQueries = [...new Set(queries)];
    return uniqueQueries.join(', ');
}
