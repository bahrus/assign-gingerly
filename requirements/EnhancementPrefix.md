# Namespacing attribute namespacing

One quirk related to supporting attributes using withAttrs has to do with preventing clashes with a custom element's attributes or the platform.

This proposal / polyfill is part of a suite that is designed to formally recognize what the industry is already doing -- defining custom attributes with dashes (not starting with data-) that add behaviors/enhancements on top of the underlying element in a cross-cutting way where the ownership is clear.  There is an informal understanding that built-in elements won't add built-in attributes with dashes in the name, except once in a blue moon (aria-* for example).  Using data- doesn't seem very semantic or useful to enhancing the behavior such element.  Where that pattern appears to run awry is with custom elements (and a little bit with svg elements, where there's more of a pattern of using one-off attributes with dashes in the name).

So the aforementioned suite is advocating:

1.  Allowing any attribute name that either contains a dash, or one or more non ascii characters like an emoji for built-in non SVG elements.
2.  Requiring enh- prefix for elements that are instances of SVGElement, or custom elements (based on the presence of a dash in the name, which will also include Angular elements that don't use the custom element API).
3.  For simplicity, even built-in elements should treat enh- prefix as the same attribute as the one without the enh-prefix

I would like to support all this without overly complicating the configuration of withAttrs.  Ideally, the withAttrs wouldn't have to mention anything about enh-, the parseWithAttrs.js would factor in all these quirks quietly, but maybe that's not possible, maybe a little bit of acknowledgement is needed when configuring the withAttrs settings. 

---

## Analysis & Recommendations

### Current State
The `parseWithAttrs` function currently does a simple `element.getAttribute(attrName)` lookup with no special handling for prefixes or element types.

### Proposed Solutions

#### Option 1: Automatic Fallback (RECOMMENDED)
**Approach**: `parseWithAttrs` automatically tries both `enh-` prefixed and non-prefixed versions, with smart fallback based on element type.

**Logic**:
```typescript
function getAttributeValue(element: Element, attrName: string): string | null {
  const isCustomElement = element.tagName.includes('-');
  const isSVGElement = element instanceof SVGElement;
  
  // For custom elements and SVG, prefer enh- prefix
  if (isCustomElement || isSVGElement) {
    const enhValue = element.getAttribute(`enh-${attrName}`);
    if (enhValue !== null) return enhValue;
    // Fallback to non-prefixed (for backwards compatibility)
    return element.getAttribute(attrName);
  }
  
  // For built-in elements, try both (enh- is alias)
  const enhValue = element.getAttribute(`enh-${attrName}`);
  if (enhValue !== null) return enhValue;
  return element.getAttribute(attrName);
}
```

**Pros**:
- Zero configuration changes needed in `withAttrs`
- Transparent to developers
- Follows the "enh- as alias" principle for built-in elements
- Enforces best practices for custom elements/SVG
- Backwards compatible

**Cons**:
- Slight performance overhead (two getAttribute calls in some cases)
- Implicit behavior might surprise developers initially

**Configuration Example** (no changes needed):
```typescript
withAttrs: {
  base: 'data',
  count: '${base}-count',
  _count: { instanceOf: 'Number' }
}
```

Works with both:
- `<div data-count="5">` (built-in element)
- `<div enh-data-count="5">` (built-in element with enh- alias)
- `<my-element enh-data-count="5">` (custom element - enh- preferred)

---

#### Option 2: Explicit Prefix Configuration
**Approach**: Add optional `enhPrefix` configuration to `AttrPatterns`.

**Configuration**:
```typescript
interface AttrPatterns<T> {
  base: string;
  enhPrefix?: boolean | 'auto';  // true = always use enh-, 'auto' = smart detection
  // ... rest
}
```

**Usage**:
```typescript
withAttrs: {
  base: 'data',
  enhPrefix: 'auto',  // or true, or false
  count: '${base}-count'
}
```

**Pros**:
- Explicit control for developers
- Can force enh- prefix when needed
- Clear in configuration what's happening

**Cons**:
- Requires configuration changes
- More complex API
- Developers need to understand the rules

---

#### Option 3: Prefix in Attribute Names
**Approach**: Let developers specify `enh-` in the attribute name templates.

**Usage**:
```typescript
withAttrs: {
  base: 'enh-data',  // Explicitly include enh-
  count: '${base}-count'
}
```

**Pros**:
- Maximum control
- No magic behavior
- Clear what attributes are being read

**Cons**:
- Verbose and repetitive
- Doesn't handle the "alias" behavior for built-in elements
- Doesn't enforce best practices
- Developers must know the rules

---

### Recommendation: **Option 1 (Automatic Fallback)**

**Rationale**:
1. **Zero Breaking Changes**: Existing code continues to work
2. **Follows Principle**: Implements "enh- as alias for built-in elements" automatically
3. **Enforces Best Practices**: Prefers enh- for custom elements/SVG without requiring configuration
4. **Developer Friendly**: No need to think about prefixes in most cases
5. **Performance**: Minimal overhead (one extra getAttribute call in fallback scenarios)

**Implementation Strategy**:
1. Create helper function `getAttributeValue(element, attrName)` with smart fallback logic
2. Replace all `element.getAttribute(attrName)` calls in `parseWithAttrs` with the helper
3. Add optional `enhPrefixMode` to `AttrPatterns` for edge cases:
   - `'auto'` (default): Smart detection based on element type
   - `'always'`: Always use enh- prefix
   - `'never'`: Never use enh- prefix
   - `'fallback'`: Try enh- first, then fallback (for all elements)

**Edge Case Handling**:
```typescript
// For developers who need explicit control
withAttrs: {
  base: 'data',
  enhPrefixMode: 'always',  // Force enh- prefix
  count: '${base}-count'
}
```

**Testing Considerations**:
- Test with built-in elements (div, span, button)
- Test with custom elements (my-element)
- Test with SVG elements
- Test with both prefixed and non-prefixed attributes
- Test fallback behavior
- Test performance impact

Would you like me to implement Option 1? 