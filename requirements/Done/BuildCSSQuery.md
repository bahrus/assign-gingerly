# Build CSS Query

parseWithAttrs.ts has a parseWithAttrs that parses the attributes of the element based on attrPatterns and attrPatterns.

Please create a separate exported module that is passed an instance of EnhancementConfig (defined in types/assign-gingerly.ts), and a css match string, such as 'my-element,your-element', and returns another css query that does a kind of "cross product" between the allowed css matches passed in, and one of the expected attributes from with the withAttrs object.

For example:

```JavaScript
/** @type {EnhancementConfig<BeABeaconProps>} */
export const emc = {
    spawn: BeABeacon,
    withAttrs: {
        base: 'be-a-beacon',
        _base: {
            mapsTo: 'eventName'
        },
        theme: '${base}-theme'
    }
};

console.log(buildCSSQuery(emc, 'template, script'))
// 'template[be-a-beacon], script[be-a-beacon], template[enh-be-a-beacon], script[enh-be-a-beacon], template[be-a-beacon-theme], script[be-a-beacon-theme], template[enh-be-a-beacon-theme], script[enh-be-a-beacon-theme]'
```

---

## Analysis & Recommendations

### Issues & Considerations

#### 1. Template Variable Resolution
**Issue**: The requirement shows `theme: '${base}-theme'` which needs to be resolved to `be-a-beacon-theme` before building the CSS query.

**Solution**: Reuse the `resolveTemplate` logic from `parseWithAttrs.ts` (currently private, would need to be exported or duplicated).

#### 2. Underscore-Prefixed Keys
**Issue**: Keys starting with `_` (like `_base`) are config objects, not attribute names. They should be skipped when building the CSS query.

**Current behavior**: The example correctly excludes `_base` from the output.

#### 3. Base Attribute Handling
**Issue**: The `base` property itself is an attribute name and should be included in the query.

**Current behavior**: The example correctly includes `be-a-beacon` (the base value) in the output.

#### 4. Attribute Selector Syntax
**Issue**: CSS attribute selectors can be more specific:
- `[attr]` - attribute exists (any value)
- `[attr="value"]` - attribute equals specific value
- `[attr^="value"]` - attribute starts with value
- `[attr*="value"]` - attribute contains value

**Current approach**: Uses `[attr]` (presence check), which is appropriate for detecting elements that might have the attribute.

#### 5. `allowUnprefixed` Pattern
**Issue**: The `EnhancementConfig` can have an `allowUnprefixed` pattern that affects whether unprefixed attributes are valid for custom elements.

**Consideration**: Should the CSS query respect this? For example:
- If `allowUnprefixed: '^my-'` and selector is `'your-element'`, should unprefixed attributes be included?
- Probably **yes** - include both prefixed and unprefixed for maximum coverage, let the actual parsing logic handle the filtering.

#### 6. Comma-Separated Selector Parsing
**Issue**: The input `'template, script'` has spaces around commas. Need to handle:
- `'template,script'` (no spaces)
- `'template, script'` (spaces)
- `'template , script'` (extra spaces)

**Solution**: Trim each selector after splitting by comma.

#### 7. Duplicate Selectors
**Issue**: If the same selector appears multiple times in the input, should it be deduplicated?

**Recommendation**: Yes, deduplicate to avoid redundant queries.

#### 8. Invalid Selectors
**Issue**: What if the input contains invalid CSS selectors?

**Recommendation**: 
- Option A: Validate and throw error
- Option B: Pass through and let browser's `querySelector` handle it
- **Recommended**: Option B (simpler, browser will catch issues)

#### 9. Complex Selectors
**Issue**: What if input contains complex selectors like `'div.class'`, `'#id'`, `'parent > child'`?

**Example**: `buildCSSQuery(emc, 'div.highlight, span#special')`

**Recommendation**: Support them - just append the attribute selector to each:
- `'div.highlight[be-a-beacon]'`
- `'span#special[be-a-beacon]'`

#### 10. Performance with Many Attributes
**Issue**: If `withAttrs` has many attributes, the resulting CSS query could be very long.

**Example**: 10 attributes × 2 prefixes (enh-, unprefixed) × 3 selectors = 60 selectors

**Recommendation**: This is acceptable - CSS engines handle long selector lists efficiently.

#### 11. Return Format
**Issue**: Should the function return:
- A: Single string with comma-separated selectors (as shown)
- B: Array of selector strings
- C: Both (string with optional array return)

**Recommendation**: Return string (as shown) since that's what `querySelectorAll` expects. Users can split if needed.

#### 12. Attribute Value Matching
**Issue**: Should the CSS query check for specific attribute values or just presence?

**Current approach**: Presence check `[attr]` is correct because:
- Attribute values vary per element
- We're looking for elements that *might* be enhanced
- The actual parsing will validate values

### Proposed API

```TypeScript
/**
 * Builds a CSS query selector that matches elements with attributes from withAttrs
 * @param config - Enhancement configuration with withAttrs
 * @param selectors - Comma-separated CSS selectors to match
 * @returns CSS query string with cross-product of selectors and attributes
 */
export function buildCSSQuery(
  config: EnhancementConfig,
  selectors: string
): string;
```

### Implementation Approach

1. **Parse selectors**: Split by comma and trim
2. **Extract attribute names** from `withAttrs`:
   - Skip underscore-prefixed keys
   - Resolve template variables
   - Include `base` attribute if present
3. **Generate attribute selectors**:
   - For each attribute: `[attr]` and `[enh-attr]`
4. **Create cross-product**: Each selector × each attribute variant
5. **Deduplicate and join**: Return comma-separated string

### Edge Cases to Handle

1. **Empty withAttrs**: Return empty string or original selectors?
   - **Recommendation**: Return empty string (no attributes to match)

2. **Empty selectors**: Return empty string
   - **Recommendation**: Return empty string

3. **No base attribute**: Still process other attributes
   - **Recommendation**: Yes, base is optional

4. **Only underscore keys**: Return empty string
   - **Recommendation**: Yes, no actual attributes to match

5. **Circular template references**: Should throw error (already handled by parseWithAttrs logic)

### Alternative Approaches

#### Option A: Include Attribute Values (More Specific)
```javascript
// Instead of: template[be-a-beacon]
// Generate: template[be-a-beacon=""], template[be-a-beacon="*"]
```
**Pros**: More specific matching
**Cons**: More complex, values are unknown at query-building time
**Recommendation**: Not needed - presence check is sufficient

#### Option B: Separate Prefixed/Unprefixed Queries
```javascript
buildCSSQuery(emc, 'template', { includeUnprefixed: true, includePrefixed: true })
```
**Pros**: More control over what's included
**Cons**: More complex API
**Recommendation**: Not needed - always include both for maximum coverage

#### Option C: Return Structured Data
```javascript
// Returns: { selectors: [...], attributes: [...], query: '...' }
```
**Pros**: More information for debugging
**Cons**: More complex return type
**Recommendation**: Not needed - simple string is sufficient

### Recommended Implementation

```TypeScript
// buildCSSQuery.ts
import { EnhancementConfig } from './types';

export function buildCSSQuery(
  config: EnhancementConfig,
  selectors: string
): string {
  // 1. Validate inputs
  if (!config.withAttrs || !selectors) {
    return '';
  }
  
  // 2. Parse and normalize selectors
  const selectorList = selectors
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0);
  
  if (selectorList.length === 0) {
    return '';
  }
  
  // 3. Extract and resolve attribute names
  const attrNames = extractAttributeNames(config.withAttrs);
  
  if (attrNames.length === 0) {
    return '';
  }
  
  // 4. Build cross-product
  const queries: string[] = [];
  
  for (const selector of selectorList) {
    for (const attrName of attrNames) {
      // Unprefixed version
      queries.push(`${selector}[${attrName}]`);
      // enh- prefixed version
      queries.push(`${selector}[enh-${attrName}]`);
    }
  }
  
  // 5. Deduplicate and join
  const uniqueQueries = [...new Set(queries)];
  return uniqueQueries.join(', ');
}

function extractAttributeNames(withAttrs: any): string[] {
  const names: string[] = [];
  const resolvedCache = new Map<string, string>();
  
  // Add base if present
  if ('base' in withAttrs && typeof withAttrs.base === 'string') {
    names.push(withAttrs.base);
  }
  
  // Add other attributes (skip underscore-prefixed)
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

// Reuse or duplicate from parseWithAttrs.ts
function resolveTemplate(
  template: string,
  patterns: Record<string, any>,
  resolvedCache: Map<string, string>,
  visitedKeys: Set<string> = new Set()
): string {
  // ... same implementation as parseWithAttrs.ts
}
```

### Testing Considerations

Test cases should cover:
1. ✅ Basic cross-product (as shown in example)
2. ✅ Multiple selectors with spaces
3. ✅ Template variable resolution
4. ✅ Underscore-prefixed keys excluded
5. ✅ Base attribute included
6. ✅ Empty inputs (empty withAttrs, empty selectors)
7. ✅ Complex selectors (classes, IDs, combinators)
8. ✅ Deduplication
9. ✅ No base attribute
10. ✅ Only underscore keys

### Final Recommendation

The requirement is solid and implementable. Main considerations:
1. **Reuse template resolution logic** from parseWithAttrs.ts
2. **Always include both prefixed and unprefixed** variants
3. **Keep API simple** - just return the query string
4. **Handle edge cases** gracefully (empty inputs, etc.)
5. **Deduplicate** the final selector list

The implementation is straightforward and the use case is clear - this will be useful for mount-observer and similar libraries that need to find elements with specific attributes.
