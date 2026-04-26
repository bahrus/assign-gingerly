# Method and Prop Aliasing

## Status: 📝 NEEDS CLARIFICATION

The following syntax can be reduced if we allow for aliasing, especially as the number of rules grows

**Before:**

```TypeScript
assignGingerly(shadowRoot, {
  '?.querySelector?.my-element?.classList?.add': 'highlighted',
  '?.querySelector?.your-element?.classList?.add': 'highlighted'
}, { withMethods: ['querySelector', 'add'] });
```

**After:**

```TypeScript

assignGingerly(shadowRoot, {
  '?.$?.my-element?.c?.+': 'highlighted',
  '?.$?.your-element?.c?.+': 'highlighted'
}, { 
  withMethods: ['querySelector', 'add'],
  aka: [
    ['$', 'querySelector'], 
    ['+', 'add'], 
    ['c', 'classList']
  ] 
});
```

## Questions & Clarifications Needed:

### 1. Alias Scope
**Q:** Should aliases apply to both property names AND method names, or just one or the other?

**Current assumption:** Aliases work for both properties and methods (e.g., `c` → `classList` for property access, `$` → `querySelector` for method calls)

**Concern:** This could be confusing if an alias matches both a property and a method name. Need to clarify precedence.

### 2. Alias Syntax
**Q:** Should aliases be single characters only, or allow multi-character aliases?

**Examples:**
- Single char: `$`, `+`, `.`, `c`
- Multi-char: `qs`, `qsa`, `cl`

**Recommendation:** Allow multi-character aliases for better readability, but document that single-char aliases are more concise.

### 3. Reserved Characters
**Q:** Are there any characters that should NOT be allowed as aliases?

**Concerns:**
- `.` is already used for path navigation (e.g., `?.classList?.add`)
- `?` is used for optional chaining
- `-` might conflict with the `-=` delete command
- `+` might conflict with the `+=` increment command
- `=` and `!` are used in commands

**Recommendation:** Disallow `.`, `?`, and any characters used in commands (`+`, `-`, `=`, `!`) as aliases to avoid parsing ambiguity.

### 4. Alias Application Order
**Q:** When should alias replacement happen?

**Options:**
1. Before parsing (string replacement in the path)
2. During path evaluation (lookup in aka map)

**Recommendation:** During path evaluation (option 2) for better performance and clearer semantics.

### 5. Alias Conflicts with Actual Property Names
**Q:** What happens if an alias conflicts with an actual property name on the object?

**Example:**
```TypeScript
const obj = {
  $: 'actual property',
  querySelector: function() { ... }
};

assignGingerly(obj, {
  '?.$': 'value'
}, { aka: [['$', 'querySelector']] });
```

**Should it:**
- A) Use the alias (call `querySelector`)
- B) Use the actual property (set `$`)
- C) Throw an error

**Recommendation:** Option B - actual property names take precedence over aliases. Aliases are only used when the property doesn't exist or as a convenience.

### 6. Integration with withMethods
**Q:** If an alias maps to a method name, does it automatically get added to `withMethods`, or must it be explicitly listed?

**Example:**
```TypeScript
{ 
  withMethods: ['add'],  // Do we need to include '$' here too?
  aka: [['$', 'querySelector']] 
}
```

**Recommendation:** Aliases should be automatically treated as methods if their target is in `withMethods`. So if `'querySelector'` is in `withMethods`, then `'$'` should also be treated as a method.

### 7. Alias Definition Format
**Q:** Should `aka` be an array of tuples, or an object/Map?

**Current:** `aka: [['$', 'querySelector'], ['+', 'add']]`

**Alternative:** `aka: { '$': 'querySelector', '+': 'add' }`

**Recommendation:** Object format is more readable and easier to work with. Array of tuples is more JSON-serializable but less ergonomic.

### 8. Use Case Validation
**Q:** Is the primary use case to reduce verbosity in repetitive patterns?

**Observation:** The example shows two very similar paths. This suggests the feature is most valuable when you have many similar assignments.

**Alternative approach:** Could we support a different syntax for bulk operations?
```TypeScript
assignGingerly(shadowRoot, {
  '?.querySelector?.{my-element,your-element}?.classList?.add': 'highlighted'
}, { withMethods: ['querySelector', 'add'] });
```

This might be more powerful than aliasing for this specific use case.

## Implementation Considerations:

1. **Parsing complexity:** Need to ensure alias replacement doesn't break existing path parsing logic
2. **Performance:** Alias lookup should be O(1) - use Map or object
3. **Type safety:** TypeScript types for `aka` option
4. **Documentation:** Clear examples showing when aliases are useful vs. when they add confusion
5. **Testing:** Need comprehensive tests for edge cases (conflicts, reserved chars, etc.)

## Recommendation:

Before implementing, please clarify:
1. Whether to allow multi-character aliases
2. Which characters should be reserved/disallowed
3. Precedence rules (actual properties vs. aliases)
4. Whether to consider alternative bulk operation syntax

Once these are clarified, implementation should be straightforward.

---

## Human Responds:

1.  Should multi-character aliases be allowed?  Yes, absolutely.  It's a tradeoff between readability and terseness, so definitely something we should leave up to the developer.
2.  I'm okay with adding some reserved characters.  I might tend to be on the bolder side, for example, I think spaces should not be allowed within the chained accessors, and aliases, which would allow for - and = symbols without ambiguities, because we only use -=, += after a space.  A future requirement may allow for string arguments of the methods with spaces, surrounded by some quote symbol, like `.  So maybe we should disallow ` and space.  I'm okay with erring on the side of caution, and loosening the restrictions as this library nears completion.
3. Mentally, what I envision happening conceptually -- replace the tokens with aliases first, then apply the methods, so that the methods don't need to be aware of the aliases. The matches should be a perfect match between ?.'s not substrings.  The aka/alias substitution should not care if the token is a method or property.
4. That alternative could prove useful, but I think that could be a separate requirement.  The inspiration for this requirement is to be more like JQuery, that substitutes $ for querySelectorAll, only here the shortcuts are totally customizable.

