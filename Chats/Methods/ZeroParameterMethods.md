# Support for Zero Parameter Methods

---

## Human Ask

The readme provides this example:

```JS
assignGingerly(elementRef, {
  '?.deref?.classList?.add': 'active'
}, { withMethods: ['deref', 'add'] });
```

Maybe I'm forgetting something, but how does assignGingerly know not to do:

```JS
elementRef.deref('classList').add('active');
```

I suspect this was an oversight.  If I'm right, any suggestions how to get this example to work?

---

## Revision

I think the example should look like:

```JS
assignGingerly(elementRef, {
  '?.deref?.?.classList?.add': 'active'
}, { withMethods: ['deref', 'add'] });
```

Can you confirm from looking at the code that this will either not pass anything, or at least pass an empty string?  Maybe we should assume pass nothing just in case?






---

## Kimi Code's Response

### Confirming the original suspicion

Yes — the original ask is correct. In `evaluatePathWithMethods` (`assignGingerly.ts:447-457`), when a middle path segment is in `withMethods` and the *next* segment is **not**, the next segment is passed as an argument:

```TS
if (withMethods.has(nextPart)) {
    // Both are methods - call first with no args
    current = method.call(current);
} else {
    // Only current is method - call with next part as string arg
    current = method.call(current, nextPart);
    i++; // Skip next part since we consumed it as argument
}
```

So today, `'?.deref?.classList?.add'` executes as `elementRef.deref('classList').add('active')`. The README example only works by accident — both the README's `deref() { return this.element; }` and the real `WeakRef.prototype.deref` silently ignore extra arguments. Any zero-parameter method that validates its arguments (or has optional parameters that change behavior) would break.

### Confirming the Revision's empty-segment marker

No — the proposed `'?.deref?.?.classList?.add'` does **not** work today, and it would pass neither nothing nor an empty string. `parsePath` (`assignGingerly.ts:322-329`) filters empty segments out:

```TS
parts = path.split('?.').filter(part => part.length > 0);
```

`'?.deref?.?.classList?.add'.split('?.')` produces `['', 'deref', '', 'classList', 'add']`, and the filter collapses it back to `['deref', 'classList', 'add']` — the exact same broken path as before. `deref` would still receive `'classList'`.

### Making the Revision work

The marker is implementable, but the change is wider than it looks:

1. **`parsePath`** must preserve empty segments (drop the filter, or keep a parallel raw split). It has a cache (`agPathCache`) keyed by the raw string, so that's not an obstacle.
2. **`evaluatePathWithMethods`** needs the new rule: if `part` is a method and `nextPart === ''`, call with **zero args** and skip the empty segment (`i++` extra). Agreed with the "pass nothing" instinct — passing `''` is semantically wrong and no safer; a zero-arg call is the only honest interpretation of the marker.
3. **Duplicated logic must be updated in lockstep**: `evaluatePathWithAsyncMethods.ts:47-77` and the nested-`@each` method handling in `applyToEach` (`assignGingerly.ts:563-578`) reimplement the same "consume next segment as argument" rule. All three sites need the marker, or behavior will diverge between sync/async/`@each` paths.
4. **Non-method consumers of `pathParts`** (`ensureNestedPath`, the `+=`/`=!`/`-=`/`Y=` command handlers) currently never see empty segments. Once the filter is gone they must defensively skip `''`, and a stray `'?.?. '` typo that is silently tolerated today could change meaning. Worth an explicit decision: is `?.?.` after a *non-method* segment an error, or ignored?

### Edge cases to pin down in tests

- Marker after the **last** segment: `'?.reset?.?'` — should this mean "call `reset()` with no args, ignoring the value"? Currently a trailing empty segment is also filtered, so this needs an explicit yes/no.
- Marker after a non-method segment: `'?.a?.?.b'` — recommend ignoring the empty segment (skip), not erroring, to stay consistent with today's tolerance.
- Aliasing: `applyAliases` splits/rejoins on `?.` and maps each part through `aliasMap.get(part) ?? part`, so empty parts survive unharmed — but a test should lock that in.

### Alternative worth considering: `()` suffix

Before committing to `?.?.`, consider `'?.deref()?.classList?.add'` with the segment staying `'deref()'`:

- `parsePath` needs no change — `'deref()'` is non-empty, so the filter never touches it. Only the three method-evaluation sites strip the `()` suffix before the `withMethods` lookup and property access.
- It's far more visible in the path string; `'?.?. '` is easy to miss in review and easy to produce by accident.
- It doesn't change the meaning of empty segments anywhere else, so the blast radius is smaller.

That said, `?.?.` has one advantage: it reads as "empty argument list" positionally, right where the argument would have been consumed. Either works; `()` is the safer diff, `?.?.` is the more minimalist notation. If `?.?.` is chosen, the four implementation points above are the full scope.

---

## Human Response I

My concern about `'?.deref()?.classList?.add'` is it suggests to developers that they can specify an argument inside.  

Developers would naturally ask why can't I do this:

`'?.deref(classList)?.add'`



Maybe this would be better?

`'?.deref|?.classList?.add'`

When this topic was first broached with another AI engine, I first proposed that rather than having "withMethods", that we use a special symbol - | to indicate method calls in general, and that only allow for at most one parameter:

`'?.deref|?.querySelector|.myClass?.classList|add'`

The push back was this would throw quite a bit of complexity in the parsing for little gain.

I've since warmed to the idea that we specify which methods are allowed separately.



---

## Kimi Code's Response II

### The objection to `()` is fair — and worse than stated

Agreed that `'?.deref()?.classList?.add'` invites the question "why can't I put an argument inside?" And the answer today is uglier than a clean error: with `'?.deref(classList)?.classList?.add'`, the segment `'deref(classList)'` is not in `withMethods`, so `evaluatePathWithMethods` treats it as a **plain property access** and auto-creates `current['deref(classList)'] = {}` (`assignGingerly.ts:466-472`). The mistake wouldn't throw — it would silently build a garbage property and then fail downstream on `classList`. A syntax that invites a silently-corrupting mistake is a real liability, not just an aesthetic one.

### `|` as a zero-arg suffix marker works well

`'?.deref|?.classList?.add'` has the same small blast radius as `()` and none of its suggestiveness:

- **`parsePath` needs no change.** Splitting on `'?.'` yields `['deref|', 'classList', 'add']` — the marker segment is non-empty, so the filter never touches it. All the empty-segment fallout from my previous response (non-method consumers, `?.?.` typo semantics, trailing-marker ambiguity) disappears.
- **Implementation is confined to the method-evaluation sites**: `evaluatePathWithMethods`, `evaluatePathWithAsyncMethods`, the `applyToEach` method branch, and the last-segment call sites. Each detects a trailing `|`, strips it, then proceeds as today — except the zero-arg call never consumes the next segment.
- **No collision with the command grammar**: the command suffixes (` +=`, ` =!`, ` -=`, ` Y=`) are space-delimited, and a bare `|` currently has no meaning in paths, so this isn't repurposing anything.
- **Only literal property names ending in `|` collide** (e.g. a key `'foo|'`). JS identifiers can't contain `|` at all, so this only affects exotic string keys — acceptable, but worth one line in the docs.

### Recommended semantics: `|` modifies, `withMethods` allows

Keep `withMethods` as the allowlist and treat `|` purely as an arity modifier:

1. Strip a trailing `|` from the segment → base name `deref`.
2. If `withMethods` doesn't have `deref`, `|` means nothing — plain property access as today (consistent with how unlisted "methods" are already treated).
3. If it does: middle segment → call with zero args, do **not** consume the next segment; last segment → call with zero args, ignore the value.

That last point is a bonus: `'?.reset|'` gives a clean answer to the trailing-marker edge case I raised earlier — today there is no way to invoke a listed method as the final segment without feeding it the value.

I would *not* make `|` alone sufficient to trigger a method call (bypassing `withMethods`). The allowlist is the only thing standing between a path string and arbitrary method invocation on the target; keeping two independent switches (membership + arity) costs one array entry and preserves the current security posture.

### On the history

Worth noting the irony: this is the pipe from `SupportPipe.md` coming back, but in a form the original pushback doesn't apply to. That proposal was `|` as a *general method-call grammar* (method indicator, argument placement, at-most-one-parameter rules) — genuinely heavy parsing for little gain. This is a single-character suffix checked with `segment.endsWith('|')` in code paths that already exist. Same symbol, roughly 5% of the complexity.

Also note `SupportPipe.md`'s Example 2 (`'?.deref?.querySelector?.my-custom-element?.myProp'`) already works today, because `querySelector` is in `withMethods` and therefore `deref` gets zero args. The gap is exactly and only "method followed by a plain property" — which is what `deref|` fixes. That narrowness is a good sign for the design.

### Test checklist if implemented

- `'?.deref|?.classList?.add'` → `deref()` zero-arg, continues to `classList.add(value)`.
- `'?.reset|'` (last segment) → `reset()` zero-arg, value ignored.
- `|` on a segment not in `withMethods` → plain property access, no call.
- Mixed chain: `'?.deref|?.querySelector?.my-el?.classList?.add'` → `deref()` then `querySelector('my-el')`.
- Same cases through `withAsyncMethods` and an `@each` path.
- README example updated to `'?.deref|?.classList?.add'`; JSDoc for `withMethods` in `types/assign-gingerly/types.d.ts` documents the suffix.

---

## Human Response II

Looks great.  Please implement.

---

## Implementation Summary

Implemented the `|` zero-argument marker as specified above.

**Code changes:**

- `assignGingerly.ts` — `evaluatePathWithMethods` strips a trailing `|` from a segment when the base name is in `withMethods`: middle segments are called with zero args without consuming the next segment; the last segment is returned stripped with an `isZeroArg` flag. Call sites honoring `isZeroArg`: the nested-path method call, the non-nested key method call, `applyToEach` (both the nested-`@each` navigation branch and its last-segment call), and the async fire-and-forget branch. Also fixed the `withAsyncMethods` gate (`pathParts.some(...)`) to recognize `|` -suffixed segments.
- `evaluatePathWithAsyncMethods.ts` — mirrored the same logic for both sync and async method sets; `AsyncPathResult` gains `isZeroArg`.
- `eachTime.ts` — last-segment method call honors `isZeroArg`.
- `types/assign-gingerly/types.d.ts` — `withMethods` JSDoc documents the `|` suffix (both `IAssignGingerlyOptions` and `AssignFromOptions`).
- `README.md` — new "Zero-argument calls (`|` marker)" section; the chained `deref` example now reads `'?.deref|?.classList?.add'`.

**Semantics (as agreed):** `|` modifies, `withMethods` allows. A segment with `|` whose base name is not listed is treated as a literal property name, `|` included.

**Tests added:**

- `tests/with-methods.html` — zero-arg middle segment (`deref|`), zero-arg last segment (`?.reset|`, value ignored), non-nested key (`reset|`), `|` on unlisted segment (literal property name), mixed chain (`deref|` + `querySelector('my-el')`), and async zero-arg via `withAsyncMethods`.
- `tests/foreach.html` — zero-arg method in a nested `@each` path.

**Verification:** `npx tsc` clean; full Playwright chromium suite passes (26/26), including all pre-existing tests.

**Pre-existing issue noticed (not fixed, out of scope):** when `withMethods` is set, a `@each` path whose iterable is reached via a *single plain property* (e.g. `'?.groups?.@each?.value'` with `withMethods` present) silently does nothing — `evaluatePathWithMethods` never navigates into the last segment of the pre-`@each` path, and the caller can't distinguish "last segment was consumed as a method argument" from "never navigated." Only surfaces when `withMethods` is combined with `@each` over a plain property.
