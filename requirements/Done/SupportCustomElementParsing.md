# Custom Element Parsing

---

## Human Ask

I'm finding the parseWithAttrs.js function useful for managing and parsing custom element attributes actually.  What I had to do to avoid errors meant to prevent invalid attributes for enhancements is avoid use of base attribute:

```JavaScript
withAttrs: {
    //base: '',
    count: 'initial-count',
    _count: {
        instanceOf: 'Number',
        defaultIfNull: 10,
    },
    username: 'username'
} 
```

and then call parseAttr with a hack for the last parameter

```JavaScript
const attrVals = parseWithAttrs(this, withAttrs, /.*/);
```

The other thing I would like to do in this scenario is avoid parsing and returning parsed attributes for which the mapsTo (like "count", "username") already has a value other than undefined.

I was thinking that the third parameter could allow for a boolean flag, to represent:  treat this as a (custom) element, so treat the first parameter as the element, and don't worry about having a base attribute, but still support compositional attributes using the template syntax.

---

## Agent Analysis

### Understanding the Problem

You're using `parseWithAttrs` for a custom element's own attributes (not enhancement attributes), and hitting two friction points:

1. **Base attribute validation**: The `hasDashOrNonASCII` check on `base` is designed for enhancement attribute prefixes (like `be-counted-`). For a custom element parsing its own attributes, there's no base prefix — attributes like `initial-count` and `username` stand on their own.

2. **The `allowUnprefixed` hack**: You're passing `/.*/` to bypass the `enh-` prefix requirement in `getAttributeValue`. For custom elements, `getAttributeValue` first looks for `enh-${attrName}`, then only falls back to the unprefixed name if `allowUnprefixed` matches the tag name. Passing `/.*/` forces the fallback for all elements.

3. **Skip already-set properties**: You want to avoid parsing attributes when the target property already has a value (not `undefined`). This is a "don't overwrite what's already been set programmatically" pattern.

### Proposed Solution

I agree that overloading the third parameter with a boolean is the cleanest approach. When `true`, it means "custom element mode":

```typescript
export function parseWithAttrs<T = any>(
    element: Element,
    attrPatterns: AttrPatterns<T>,
    allowUnprefixed?: string | RegExp | true,  // true = custom element mode
    spawnContext?: SpawnContext<T>
): Partial<T>
```

**When `allowUnprefixed === true`:**

1. **Skip base validation** — no `hasDashOrNonASCII` check needed
2. **Read attributes directly** — no `enh-` prefix, just `element.getAttribute(attrName)`
3. **Support template syntax** — compositional attribute names still work (e.g., `{base}-count`)
4. **Skip already-set properties** — if the target property on `element` already has a non-`undefined` value, skip it

### Implementation Details

The changes are minimal:

**A. In `getAttributeValue`**, when `allowUnprefixed === true`:
```typescript
if (allowUnprefixed === true) {
  // Custom element mode - read attribute directly, no enh- prefix
  return element.getAttribute(attrName);
}
```

**B. In `parseWithAttrs`**, when `allowUnprefixed === true`:
- Skip the `hasDashOrNonASCII` validation on base
- Before adding to result, check if the property already exists on the element with a non-`undefined` value

**C. The "skip already-set" check:**
```typescript
const mapsTo = config.mapsTo ?? (key === 'base' ? '.' : key);
if (mapsTo !== '.' && allowUnprefixed === true) {
  // In custom element mode, skip if property already has a value
  if ((element as any)[mapsTo as string] !== undefined) {
    continue;
  }
}
```

### Questions

1. **The "skip already-set" check** — should this check the element itself (`element[prop]`), or should it accept an optional object to check against? Your example suggests checking `this` (the custom element), which is the same as `element` in this context. But if someone passes a different target, they might want to check that instead.

2. **Base attribute in custom element mode** — should `base` still be supported (for compositional templates like `{base}-count` where base could be empty string `''`)? Or should it be completely ignored? I'm thinking it should still work if provided, just without the dash validation. That way `base: ''` works and `count: '{base}initial-count'` resolves to `'initial-count'`.

3. **`defaultIfNull` vs `valIfNull`** — your example uses `defaultIfNull` but the current type uses `valIfNull`. Is this a typo, or do you want a rename?

### Estimate

- ~15 lines changed in `parseWithAttrs.ts`
- ~5 lines in type definitions
- Tests in a new test file
- Minimal weight impact

Let me know your answers and I'll implement.

## Human Response I

Answers to questions

1. **The "skip already-set" check** — should this check the element itself (`element[prop]`)...

Yes, check element[prop];

2.  Yes, please support the base attribute, could be quite usesful in some scenarios.

3.  My mistake, valIfNull, that was based on a faulty memory.


