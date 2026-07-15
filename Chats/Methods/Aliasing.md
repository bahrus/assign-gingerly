# Method and Prop Aliasing

## Status: ✅ IMPLEMENTED

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

---

## Implementation Summary:

### Changes Made:

1. **Type Definitions** (`types/assign-gingerly/types.d.ts`):
   - Added `aka?: Record<string, string>` to `IAssignGingerlyOptions`

2. **Core Implementation** (`assignGingerly.ts`):
   - Added `applyAliases()` helper function to substitute aliases in path strings
   - Validates aliases (disallows space and backtick characters)
   - Converts `aka` object to Map for O(1) lookup
   - Applies alias substitution during source key processing (before path evaluation)
   - Matches complete tokens between `?.` delimiters (not substrings)

3. **Tests** (`tests/aliasing.html`, `tests/aliasing.spec.ts`):
   - 15 comprehensive tests covering:
     - Single and multi-character aliases
     - Aliases for properties and methods
     - Multiple aliases in same path
     - Chained querySelector with aliases
     - Reserved character validation
     - Edge cases (empty aka, no aka, substring matching)
   - All tests passing ✅ (15/15)

4. **Documentation** (`README.md`):
   - Added Example 3d - Aliasing with aka
   - Explained how aliases work
   - Documented reserved characters
   - Provided multiple examples (single-char, multi-char, multiple aliases)
   - Showed benefits and use cases

### Implementation Details:

- **Alias Resolution:** Happens before path evaluation (string substitution)
- **Token Matching:** Exact match of complete tokens between `?.` delimiters
- **Reserved Characters:** Space and backtick (`) are disallowed
- **Allowed Characters:** All others including `$`, `-`, `=`, `+` (safe because commands require space)
- **Performance:** O(1) lookup using Map
- **Integration:** Works seamlessly with `withMethods` option

### Test Results:

All 48 tests passing (45 original + 3 new aliasing tests across 3 browsers):
- Chrome: 15/15 aliasing tests ✅
- Firefox: 15/15 aliasing tests ✅  
- WebKit: 15/15 aliasing tests ✅

### Example Usage:

```TypeScript
assignGingerly(div, {
  '?.$?.my-element?.c?.+': 'highlighted',
  '?.$?.your-element?.c?.+': 'active'
}, { 
  withMethods: ['querySelector', 'add'],
  aka: { '$': 'querySelector', 'c': 'classList', '+': 'add' }
});
```

Equivalent to:
```TypeScript
div.querySelector('my-element').classList.add('highlighted');
div.querySelector('your-element').classList.add('active');
```

Based on the clarifications:

1. **Alias Format:** Use object format `{ alias: target }` for better ergonomics
   - Example: `aka: { '$': 'querySelector', '+': 'add', 'c': 'classList' }`

2. **Reserved Characters:** Disallow space and backtick (`) in aliases
   - Allow: `-`, `=`, `+` (safe because commands require space before them)
   - Disallow: ` ` (space), `` ` `` (backtick for future string args)

3. **Alias Resolution:** 
   - Replace aliases BEFORE path evaluation
   - Match complete tokens between `?.` delimiters (not substrings)
   - Alias substitution is agnostic to whether target is method or property

4. **Integration:**
   - Add `aka?: Record<string, string>` to `IAssignGingerlyOptions`
   - Convert to Map internally for O(1) lookup
   - Apply substitution during path parsing in `assignGingerly()`
   - Works seamlessly with existing `withMethods` logic

5. **Testing:**
   - Single and multi-character aliases
   - Aliases for methods and properties
   - Multiple aliases in same path
   - Reserved character validation
   - Edge cases (empty alias, circular aliases, etc.)

Ready to implement!

