# Nested Ternaries

---

## Human Ask

> - **Nested ternaries** can recurse through the *value positions* using nested arrays:

```JS
// cond1 ? then1 : cond2 ? then2 : else
[cond1, then1, [cond2, then2, else]]
```

> Position-0 nested arrays already mean "comparison mode", and that's unambiguous because it's *the first element*. Nested arrays in positions ≥ 1 currently pass through `resolveTernaryValue` untouched (non-strings pass through as literals), so adding "if an element in a result position is an array, recursively `evaluateTernary` it" doesn't collide with anything that exists today — except someone literally assigning an array as a result value. That collision can be dodged with a wrapper convention later if it ever matters (e.g. only treat it as a nested ternary when its first element is itself a valid condition shape), or by introducing an explicit `?:`-style marker for nesting.

I like the idea that if cond2 is a string that starts with '?.', then treat it as a condition, otherwise consider it to be the value for the else of cond1.

Are there any other ambiguities that need to be addressed before implementing this?

---

## Thoughts (Kimi)

Your heuristic — nested array is a ternary iff its first element is a string starting with `?.` — is a good trigger: cheap, predictable, and it sidesteps the literal-array collision in the common cases. A few refinements and remaining ambiguities to pin down before implementing:

### 1. Require length ≥ 2 for the trigger

A nested array like `['?.a']` (length 1) matches the `?.` heuristic but isn't any valid ternary form. Treat it as a literal. So the full trigger becomes: *first element is a `?.`-prefixed string **and** the array has at least 2 elements*.

### 2. Comparison-mode nesting — include or explicitly defer?

The heuristic as stated only catches truthiness-mode nesting. But this is plausible:

```JS
// cond1 ? then1 : (lhs === rhs ? match : noMatch)
[cond1, then1, [['?.lhs', '?.rhs'], 'match', 'no match']]
```

Here the nested array's first element is itself an array — your rule treats it as a literal value. Two options:

- **Extend the trigger**: nested array is a ternary if its first element is a `?.`-prefixed string *or an array* (comparison mode). This mirrors exactly how the top-level dispatch already works, so it's consistent.
- **Defer it**: v1 supports truthiness-mode nesting only; comparison nesting comes later.

I'd extend it — the recursion is the same either way, and the top-level code already has the "first element is array → comparison mode" branch to reuse. The cost is that a literal array whose first element is an array also becomes unassignable in result positions. Rare enough to accept, but it should be documented alongside the existing literal-`?.`-string caveat.

### 3. Recurse at result positions, not inside `resolveTernaryValue`

It's tempting to put the "array → recursively evaluate" hook inside `resolveTernaryValue` so it works everywhere. Don't: that function also resolves the *operands* of comparison mode (`lhs`, `rhs`), where an array should keep passing through as a literal. Apply the recursion explicitly in `evaluateTernary` at the result positions only:

- Truthiness form: positions 1 (then), 2 (else), 3 (neither).
- Comparison forms: positions 1 (result), 2 (elseResult).

A small helper like `resolveResult(value, source, options)` that checks the trigger and either recurses into `evaluateTernary` or falls through to `resolveTernaryValue` keeps this tidy.

### 4. Chain candidates — do nested arrays recurse there too?

```JS
[cond1, '||', [cond2, then2, else2]]
```

The chain loop resolves candidates via `resolveTernaryValue`, so today the nested array would be assigned as a literal. Decide one way and document it. My recommendation: **yes, recurse** — resolve chain candidates through the same `resolveResult` helper from point 3. `a || (b ? c : d)` is a natural thing to write, and the trigger heuristic makes it unambiguous. If you'd rather keep v1 minimal, deferring is fine — no syntax conflict either way.

### 5. `TERNARY_SKIP` propagation

If the selected branch is a nested guard that skips, what should the outer expression do?

```JS
[cond1, [guard, value], elseValue]
// cond1 truthy, guard falsy → skip the whole assignment, or assign elseValue?
```

I recommend **propagating the skip**: the outer condition selected the then-branch, and that branch produced no value, so the assignment is skipped — `elseValue` is *not* assigned. This matches the mental model "the guard means don't touch", and it's also what falls out naturally if `evaluateTernary` just returns the recursive call's result. But it should be a conscious decision, since "fall back to elseValue" is a defensible alternative.

### 6. Conditions that aren't `?.` paths won't trigger nesting

Conditions can also be literals (`true`, `0`) or protocol strings (`storage://flag`). A nested ternary like `[true, 'a', 'b']` or `['storage://flag', x, y]` will be treated as a literal array under the heuristic. Acceptable for v1 — nested ternaries almost always test resolved source data — but document it. If it ever matters, the trigger can be extended to registered protocol strings without breaking anything.

### 7. No new conflicts with existing dispatch

Worth stating explicitly, since this was the original "checkmate" worry:

- The `'||'` / `'??'` chain check compares `arr[1]` against marker *strings*; a nested array never collides.
- The length-based dispatch (2/3/4) happens on the *outer* array first, so `[cond1, then1, [cond2, then2, else2]]` (outer length 3) unambiguously takes the ternary branch before the else-position array is inspected.
- Recursion depth is bounded by the pattern literal's nesting depth — no cycle risk for authored patterns.

### Summary

1. Trigger: first element is `?.`-prefixed string, plus length ≥ 2; consider also accepting a first-element array for comparison-mode nesting.
2. Recurse via a dedicated helper at result positions only — not inside `resolveTernaryValue`.
3. Decide whether chain candidates recurse (I say yes, same helper).
4. Propagate `TERNARY_SKIP` outward from nested guards.
5. Document: literal arrays starting with a `?.` string (or an array) can't be assigned in result positions; literal/protocol conditions don't trigger nesting.

---

## Human Response I

I agree with all your recommendations.  Please implement.

---

## Implementation Notes

Nested ternaries implemented, per the approved recommendations:

- **`assignFrom.ts`**:
  - `isNestedTernary` — trigger is array with length ≥ 2 whose first element is a `?.`-prefixed string *or* an array (comparison-mode nesting included).
  - `resolveResult` — recurses into `evaluateTernary` for nested ternaries, falls through to `resolveTernaryValue` otherwise. Used at all result positions (then/else/neither, comparison results) and for chain candidates/fallbacks. `resolveTernaryValue` itself is untouched, so comparison operands stay literal.
  - `TERNARY_SKIP` propagates outward from nested guards; in chains, a skipping nested guard counts as a failed candidate and the chain continues.
- **`tests/ternary-command.html`**: 10 new tests — else/then-position nesting, 3-level nesting, comparison-mode nesting, literal array pass-through, length-1 array literal, skip propagation, nested chain candidates.
- **`docs/ternary-assignment.md`**: new "Nested ternaries" section documenting the trigger, skip propagation, chain interaction, and the literal-array limitation.
- Compiled: no errors in `assignFrom.ts`, and `assignFrom.js` contains the new code.

Ready for you to run `npx playwright test tests/ternary-command.spec.ts`.

---

## Human Response II

All tests pass.

