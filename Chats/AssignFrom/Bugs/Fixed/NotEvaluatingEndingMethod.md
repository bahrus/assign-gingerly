# Not Evaluating Ending Method

## Bruce's Ask

I'm finding that if a RHS of an assignFrom ends with method, it isn't evaluated, with or without a |:

```JS
//works
'?.countData?.textContent': '?.count?.toLocaleString?.en',
//doesn't work
'?.countData?.textContent': '?.count?.toLocaleString|',
'?.countData?.textContent': '?.count?.toLocaleString',
```

I think all three should work (the bottom two should not pass anything).

If no clarifications needed, please implement and add your implementation notes below.  If clarifications needed, please list them below.

## Implementation Notes

### Root cause

RHS path strings in `assignFrom` (and `assignFromAsync` / `resolveValues` / `getValue` / `getValues`)
are resolved by `navigatePath` in [resolve/getValues.ts](../../../../resolve/getValues.ts).

Unlike the LHS evaluators (`evaluatePathWithMethods` in `assignGingerly.ts` and
`evaluatePathWithAsyncMethods.ts`), `navigatePath` had **no handling for the trailing `|`
zero-arg marker** at all — neither on the final segment nor on an intermediate one.
So `'?.count?.toLocaleString|'` looked up a literal property named `"toLocaleString|"`,
which does not exist, and the RHS resolved to `undefined`.

### What actually happened for each of Bruce's three cases (before the fix)

| RHS | Result before | Note |
|-----|---------------|------|
| `'?.count?.toLocaleString?.en'` | ✅ `"1,234,567"` | worked already — `en` passed as the string arg |
| `'?.count?.toLocaleString\|'` | ❌ `undefined` | the actual bug — `\|` treated as a literal key char |
| `'?.count?.toLocaleString'` | ✅ `"1,234,567"` | **already worked** — a method as the last segment is called with zero args, as long as `toLocaleString` is listed in `withMethods` / `akaMethods`. If the method name is *not* registered it silently resolves to `undefined` by design (methods must be allow-listed); that is the most likely explanation for it appearing "not to work". |

### Fix

`navigatePath` now mirrors the `|` semantics of the other two evaluators:

- A segment ending in `|` whose base name is an allowed method → call it with **zero args**,
  without consuming the next segment; then keep walking the chain.
- Added a `nextIsMethod` check (which also recognizes a `|`-marked next segment) so that
  `method?.otherMethod` / `method?.otherMethod|` do a zero-arg call rather than passing
  `"otherMethod"` / `"otherMethod|"` as a string argument — matching `evaluatePathWithMethods`.
- If the base name is not in `withMethods`, `|` stays part of the literal property name
  (e.g. an exotic key `weird|`), consistent with test 19 in `tests/with-methods.html`.

Changed files:
- `resolve/getValues.ts` + `resolve/getValues.js` — the `navigatePath` fix.
- `tests/resolve-values.html` — added tests 28–32 (RHS ending in a method with/without `|`,
  intermediate `|`, and `|` on a non-method segment). Full suite: 102 passed.
- `docs/assignFrom.md` — documented method invocation and the `|` marker in the RHS Path Reference.

### Note on aliases + `|`

`applyAliases` / `applySubstitutions` split on `?.` and match whole segments, so an aliased
method written with a trailing `|` (e.g. `akaMethods: { LS: 'toLocaleString' }` used as
`'?.count?.LS|'`) is **not** alias-substituted — `LS|` ≠ `LS`. This same limitation already
exists on the LHS (`assignGingerly` applies aliases before `evaluatePathWithMethods`), so it
was left as-is here. Use the real method name with `|`, or the alias without `|` (a trailing
method alias is already invoked with zero args).