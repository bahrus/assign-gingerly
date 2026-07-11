# Looped Substitution

---
## Human ask

For the case of assignFrom, we need the ability to plug in a loop of a "variable" so that one line of instructions becomes multiple instructions in a typed way

Use case:

Add

```html
<form id=myForm>
    <input name=firstName>
    <input name=lastName>
</form>
```

```JavaScript
const vm = {
    firstName: 'Monkey',
    lastName: 'Luffy'
}
assignFrom(myForm, {
    '?.[name="${x}"]': '?.${x}'
}, {
    withMethods: ['querySelector'],
    where_x_in: ['firstName', 'lastName']
})
```

So maybe we could support a small number of variables? (x, y, z for starters)?

If we try support any substitution words / letters, I'm not sure we could Typescript typing to be very helpful.

---

## Feedback / Questions

### The Core Idea

This is essentially a template expansion / cartesian product over pattern entries. One pattern entry + a variable binding → N concrete entries that feed into the normal `resolveValues` + `assignGingerly` pipeline. Clean and expressive for DOM-heavy use cases.

### Clarifications Needed

1. **Substitution in LHS only, RHS only, or both?**  
   The example shows `${x}` in both the LHS (`'?.[name="${x}"]'`) and the RHS (`'?.${x}'`). Confirm: substitution always applies to both sides of each entry that contains `${x}`?

2. **Multiple variables — independent or cartesian?**  
   If both `where_x_in` and `where_y_in` are provided, is it:
   - **Zip** — iterate `x[0],y[0]` then `x[1],y[1]` (arrays must be same length), or
   - **Cartesian** — every combination of x × y?
   
   Zip feels more natural for most use cases (matching parallel arrays), but cartesian has utility too. Suggest defaulting to zip and offering a separate `cartesian: true` flag if needed later.

3. **Non-string RHS values?**  
   The RHS in `resolveValues` can be a literal (number, object, etc.) or a `?.` path string. Substitution only makes sense inside strings. If the RHS is not a string, should entries with that key simply skip substitution for the RHS and use the literal value for all iterations? That seems right.

4. **What about the handler ( =>) keys?**  
   Can substitution apply to handler command keys too? e.g.:
   ```js
   {
       '?.querySelector?.[name="${x}"] =>': { do: 'myHandler', resolve: { value: '?.${x}' } },
       where_x_in: ['firstName', 'lastName']
   }
   ```
   If yes, the expansion should happen before the handler/normal key separation in `assignFrom`.

5. **Variable inside `resolve` maps (handler configs)?**  
   For handler commands, should `${x}` also be substituted inside the `resolve` object's values? That would be powerful but adds another layer.

### Naming & API Shape

The `where_x_in` naming is clever (reads like SQL), but there are a few concerns:

- **Collision risk**: `where_x_in` is a valid plain property name. What if a target legitimately has a property called `where_x_in`? Since this lives in `options` (not in the pattern), the risk is lower — but still worth considering.
- **Fixed variable names (x, y, z)**: Limiting to three is pragmatic and makes typing feasible. Agree with this constraint.
- **Template literal syntax (`${x}`)**: Mirrors JS template literals, which is intuitive. However, it could be confused with actual template literal evaluation. Since these are plain strings (single quotes), there's no ambiguity at runtime — the `${}` is just a marker we find-and-replace. Good choice.

**Alternative shape considered (and why yours is probably better):**
```js
// Alternative: explicit loop wrapper
assignFrom(myForm, {
    loop: { over: ['firstName', 'lastName'], as: 'x', pattern: {
        '?.[name="${x}"]': '?.${x}'
    }}
}, options)
```
This is more explicit but much more verbose and harder to type. The `where_x_in` approach keeps the pattern flat and readable. I'd stick with yours.

### Typing Considerations

For TypeScript, you could type `AssignFromOptions` like:

```ts
interface AssignFromOptions extends IAssignGingerlyOptions, ResolveValuesOptions {
  from: any;
  where_x_in?: string[];
  where_y_in?: string[];
  where_z_in?: string[];
}
```

For the pattern type, you could use template literal types to hint that `${x}`, `${y}`, `${z}` are valid placeholders:

```ts
type SubstitutionVar = '${x}' | '${y}' | '${z}';
// But pattern keys are just `string`, so this would only help in documentation.
```

Realistically, the typing win is on the options side (autocomplete for `where_x_in` etc.). The pattern keys themselves are already `string` — users won't get red squiggles for typos in `${x}` regardless.

### Implementation Sketch

The expansion can happen as a preprocessing step at the top of `assignFrom`, before the handler/normal key split:

1. Detect `where_x_in` / `where_y_in` / `where_z_in` in options
2. For each pattern entry whose key or value contains `${x}` (or y, z):
   - Remove it from the pattern
   - For each value in the corresponding array, create a concrete copy with substitution applied
   - Add the expanded entries to the pattern
3. Proceed with the existing logic (handler split, resolveValues, assignGingerly)

This keeps the substitution layer cleanly separated from resolution and assignment.

### Edge Cases

- **Empty `where_x_in: []`** — no iterations, the template entry produces nothing (silent no-op).
- **`${x}` in key but `where_x_in` not provided** — leave the literal `${x}` in the string? Or throw? Suggest: leave it (it'll just be a weird property name / CSS selector, which will fail to match naturally).
- **Duplicate expanded keys** — if expansion produces the same LHS key twice (e.g., array has duplicates), later values overwrite earlier. That's standard object behavior — probably fine, but worth documenting.
- **Interaction with `aka` aliases** — aliases are applied to `?.`-delimited tokens. The `${x}` substitution should happen *before* alias resolution, since the substituted value might be a token that should be aliased.

---

## Human Response I

> Substitution in LHS only, RHS only, or both?

Definitely both.  Each value would be substituted across the board for each "line".

> Multiple variables — independent or cartesian?

I'm pretty sure we want cartesian.  For subsbitute in the x values, then the y values.  The number of allowed x values can differ from y, so the resulting number of lines becauses x.length times y.length

> Non-string RHS values?

Defniitely only applicable where rhs is a string expression or is a handler, and then apply to all rhs's of string expressions in the resolve. 

> What about the handler ( =>) keys?

I wouldn't call the place where you show ${x} a "key".  I would call it a rhs of resolve, and that's where substitutions should take place.

I like much better how you (rephrased the same concept?) put it in 5.  That makes total sense.

I'm not really seeing the collision risk, as the where_x_in is only a magic string if it appears in options, and the options object is a fully managed type with no other wild card properties, correct?

### Edge Cases

> - **Empty `where_x_in: []`** — no iterations, the template entry produces nothing (silent no-op).

Agreed.

> - **`${x}` in key but `where_x_in` not provided** — leave the literal `${x}` in the string? Or throw? Suggest: leave it (it'll just be a weird property name / CSS selector, which will fail to match naturally).

Ignore it in that case, I guess leave it.

> - **Duplicate expanded keys** — if expansion produces the same LHS key twice (e.g., array has duplicates), later values overwrite earlier. That's standard object behavior — probably fine, but worth documenting.

Noted

> - **Interaction with `aka` aliases** — aliases are applied to `?.`-delimited tokens. The `${x}` substitution should happen *before* alias resolution, since the substituted value might be a token that should be aliased.

Definitely substitution should happen before.  I think it should be the first thing that gets processed.