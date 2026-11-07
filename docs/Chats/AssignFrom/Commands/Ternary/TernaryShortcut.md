# Ternary Shortcut

---

## Human Ask

This package supports [ternary assignment](/docs/ternary-assignment.md)

As explained in that document, the ternary operator ?= supports:

[cond, then, else]

However, it is a bit inconvenient to have to provide this, a frequent occurrence I'm sure:

[cond, cond, else]

It would be more convenient to allow for:

[cond, '??', else]

if condition is truthy, return the actual condition.  Otherwise return the else.

In fact, I could see the following being useful, the equivalent of

const answer = cond1 || cond2 || cond3 ...

[cond1, '??', cond2, '??', cond3, ...]

Is there a better alternative to '??'

I'm also interested in being able to extend what ternaries support to support nested conditions:

```JS
const answer = cond1 ? then1 : cond2 ? then2 : cond3 ? then3 : else
```

Supporting this latter feature is outside the scope of this proposal, but I want to make sure that supporting:

[cond1, '??', cond2, '??', cond3, ...]

won't create a "checkmate" as far as supporting nested conditions.

---

## Thoughts (Kimi)

Grounded in the current implementation (`evaluateTernary` in `assignFrom.ts:96`), here are my observations.

### Naming: `'??'` is a slight misnomer

The proposed semantics — "if truthy, return the condition itself, otherwise the else" — are `cond || else`, **not** JavaScript's `??` (which returns the LHS unless it's *nullish*). This matters in practice:

```JS
const vm = { count: 0, fallback: 5 };
// [?.count, '??', ?.fallback]
// JS ?? semantics  → 0 (count is not nullish)
// JS || semantics  → 5 (count is falsy)
```

So candidates for the token, in rough order of preference:

- `'||'` — semantically accurate. Reads naturally as "or".
- `'??'` — fine if you deliberately want *nullish* semantics (`?.a ?? ?.b ?? ?.c`), which is arguably the more common real-world need for a fallback chain ("first defined value wins"). A chain of `??` with nullish semantics is very useful for config-style fallbacks.
- Support **both**, mirroring JS: `'||'` = first truthy, `'??'` = first non-nullish. The parsing cost is identical; only the predicate differs.

My recommendation: implement both. If forced to pick one, pick `'||'` since that matches the stated ask ("if condition is truthy").

### The shorthand also fixes a hidden inefficiency

Today, `[cond, cond, else]` resolves `cond` **twice** through `getValue` (once for the condition test, once for the then-value) — path lookups, protocol resolution, and `withMethods` all run twice. The shortcut form would resolve it once and reuse the value. Worth stating in the eventual docs as a benefit, not just a convenience.

### Implementation sketch

In `evaluateTernary`'s truthiness branch, the marker check must run **before** the length-based dispatch (`arr.length === 4` etc.), otherwise a chain like `[c1, '??', c2, fallback]` (length 4) would be misread as the three-state form. Sketch:

```JS
// truthiness branch, before the length checks:
if (arr[1] === '||' || arr[1] === '??') {
    const isNullish = arr[1] === '??';
    for (let i = 0; i < arr.length; i += 2) {
        const val = resolveTernaryValue(arr[i], source, options);
        const pass = isNullish ? val != null : !!val;
        if (pass) return val;
        if (i + 1 >= arr.length) return arr.length > i + 1 ? resolveTernaryValue(arr[i + 1], source, options) : TERNARY_SKIP;
        // else continue to next candidate
    }
    // odd trailing element = final else; even count ending in marker = TERNARY_SKIP
}
```

Edge cases to pin down:

- `[c1, '||', c2, '||', c3]` (odd length, no explicit else) → the last candidate doubles as the final value (like JS `c1 || c2 || c3`, which yields `c3` even if falsy). This is the cleanest rule.
- `[c1, '||']` (length 2) → guard form: assign resolved `c1` if truthy, else skip. Falls out naturally.
- Literal collision: a user can no longer assign the literal string `'||'` (or `'??'`) as a then-value in position 1. Acceptable, but document it. Escaping seems unnecessary for such strings.

### No checkmate for nested conditions

The two features occupy disjoint syntactic space:

- **`||` / `??` chains** are *flat*: markers in odd positions of the outer array.
- **Nested ternaries** can recurse through the *value positions* using nested arrays:

```JS
// cond1 ? then1 : cond2 ? then2 : else
[cond1, then1, [cond2, then2, else]]
```

Position-0 nested arrays already mean "comparison mode", and that's unambiguous because it's *the first element*. Nested arrays in positions ≥ 1 currently pass through `resolveTernaryValue` untouched (non-strings pass through as literals), so adding "if an element in a result position is an array, recursively `evaluateTernary` it" doesn't collide with anything that exists today — except someone literally assigning an array as a result value. That collision can be dodged with a wrapper convention later if it ever matters (e.g. only treat it as a nested ternary when its first element is itself a valid condition shape), or by introducing an explicit `?:`-style marker for nesting.

One genuine ambiguity to keep in mind: `[[lhs, rhs], ...]` comparison mode combined with a chain — e.g. `[[a, b], '||', fallback]`. Recommend explicitly ruling markers invalid in comparison mode for now; it keeps the grammar simple and there's no compelling use case.

### Summary

1. Prefer `'||'` (truthy) over `'??'` (nullish) for the stated semantics — or implement both.
2. Check for the marker before the length-based dispatch to avoid collision with the three-state form.
3. Flat chains and future nested ternaries (via recursion in result positions) do not conflict — no checkmate.
4. Bonus: the shortcut halves path-resolution work versus `[cond, cond, else]`.

---

## Human Response I

I like your suggestion to implement both '||' as well as '??'.

>  One genuine ambiguity to keep in mind: `[[lhs, rhs], ...]` comparison mode combined with a chain — e.g. `[[a, b], '||', fallback]`. Recommend explicitly ruling markers invalid in comparison mode for now; it keeps the grammar simple and there's no compelling use case.

Sounds good.

Please implement if no other ambiguities / questions remain.  Also update the [ternary assignment](/docs/ternary-assignment.md) document to mention this new feature.

---

## Implementation Details

`tests/ternary-command.html` is updated — ready for you to run the test.

What's in place:

- **Tests** (`tests/ternary-command.html`): 14 new cases — 9 for `'||'` chains (basic shortcut, multi-candidate, JS-semantics fallback on all-falsy, length-4 vs three-state disambiguation, literal candidates, `[c1, '||']` guard form) and 5 for `'??'` chains (nullish vs truthy distinction with `0`/`false`, null/undefined fallback, multi-candidate).
- **Docs** (`docs/ternary-assignment.md`): new "Chain shortcut" section covering both markers, laziness, edge cases, and the comparison-mode/literal-string limitations.
- **Build**: `npx tsc` re-emitted `assignFrom.js` with `evaluateChain` included. Note the build prints pre-existing errors in `DX/installForwarding.ts`, `DX/pinCorrector.ts`, and `assignGingerly.ts` — none related to this change, and emit succeeded anyway.

Run with `

---

Fixed. The bug was in my fallback rule: I treated any even-length array as "dangling trailing marker → skip", but `['?.a', '||', '?.b', 'fallback']` ends with a real fallback value, not a marker.

Corrected rule in `evaluateChain` (`assignFrom.ts`):

- Ends with a **candidate** → last candidate doubles as fallback (JS semantics).
- Ends with a **non-marker element** after the last candidate → explicit fallback (the failing test's case).
- Ends with a **marker** → guard form, skip assignment.

`docs/ternary-assignment.md` edge-case bullets updated to match. Recompiled — no errors in `assignFrom.ts`, and `assignFrom.js` has the new `evaluateChain`. Ready for you to re-run the test.