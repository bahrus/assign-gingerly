# Optimize Rebind

## Bruce's Ask

During the [Baseline excerise](./Step1-FragmentTargetsAndBaseline.md), it was recommended:

> **Recommendation:** before Step 2, **profile Tree's own overhead.** There are cheap candidates that help creation *and* rebinding, with no new code path:
> - `normalize()` allocates a new tuple for every node on every call, and could be cached per spec object;
> - pattern objects are spread per node (`{ ...options, from }`);
> - static literal keys (e.g. `className: 'card'`, `_: 'Active'`) are re-applied on every rebind, although they never change.

Please investigate the gains from these (and other ideas) to see if the gap can be narrowed.  Please indicate what changes you made if any, the benefits, and other relevant findings.

## Claude's Findings and Changes

**Short version:** the gap narrowed by roughly half. The profiler pointed at a different culprit than my three guesses: general-purpose setup on every node, not the spec / option allocations. Two changes made the difference:
- **a fast path for plain patterns:** about 1.5× faster create and 1.6–1.7× faster rebind;
- **skipping literal keys on rebind:** another ~2×.

All tests pass.

### Method

- **Profiling:** Chrome CPU profiles (via CDP) of 1,000-card create and rebind loops, using a scratch page that runs only Tree, with data generated outside the timed region. The profile shows self time per function.
- **Measuring:** a timing script (medians of 9, three rounds, Chromium / Firefox / WebKit) after each change, plus the full `demos/tree-benchmark.html` at the end, in all three variants (baseline, `?cv`, `?layout=0`).

### What the profile showed (before)

Rebinding 1,000 cards:

| Self time | Function | Notes |
|---|---|---|
| 28% | `assignGingerly` | General-purpose: copies keys into `processedSource`, applies aliases, checks `ish`, symbols and commands, and so on. Includes the native setters. |
| 9.5% | `normalizeAliasOptions` | Builds a fresh alias `Map` and method `Set` **twice per node** (in `getValues` and in `assignGingerly`) |
| ~5% | garbage collection | |
| 4% | `getValues` | |
| 4% | `applyPattern` | Two option spreads per node |
| 3% | `containerOf` | `instanceof HTMLTemplateElement` on every bind |
| 1.3% | `normalize` | |

So of the three candidates, **`normalize` caching barely registers.** The option spreads were real but secondary. The big cost was going through the fully general `getValues` + `assignGingerly` machinery for patterns that are just `{ className: 'card', textContent: '?.name' }`.

### Changes made (all in `handlers/tree.ts`, plus one export)

| # | Change | Kept? | Effect |
|---|---|---|---|
| A1 | `normalize()` cached per spec object | **Reverted** | No measurable gain, and it would add a "don't mutate specs after first use" caveat |
| A2 | Each node's container (`template.content` or the element) computed once at creation | Kept | Within noise. No behavior change; removes a per-bind `instanceof`. |
| B | **Fast path for plain patterns** | **Kept** | Big; see below |
| C | **Skip literal keys on rebind** | **Kept** | Big for rebind; see below |

**B. Fast path.**
- **What it does:** a pattern whose keys are all plain property names (identifiers, not `ish`) and whose values are all primitive literals or `?.` paths is compiled once per pattern object into entries (key, literal or pre-split path). It's then applied directly: navigate the path, then assign. That's exactly what `getValues` + `assignGingerly` do for such keys:
  - `aka` applies to keys;
  - a path segment that's aliased or names a pipe resolves through `getValue`;
  - plain-object values still merge through `assignGingerly`;
  - `tryAssignTo` is honored (`tryAssignTo` is now exported from `assignGingerly.ts` for this).
- **When it falls back:** for anything else in the pattern (operator keys, `$root` / `$parent` / `$0`, `!`, protocols, object or array literals, event bindings), and for calls with `withMethods`, `akaMethods`, `withAsyncMethods`, substitutions, `pin` / `at`, loop variables, or a permission processor, the existing path runs unchanged.

**C. Literal keys skipped on rebind.**
- **When it applies:** when a node is rebound with the **same pattern object** and the **same effective `aka`** (compared shallowly, because Tree merges the config's `aka` into a new object per call).
- **What it does:** literal entries (`className: 'card'`, `['dt', 'Height']`, `'Active'`) are skipped, and only bound values are re-applied.
- **Inline configs are safe:** a config written inline creates new pattern objects per call, so it always re-applies everything. A literal whose value differs between calls is never skipped.
- **The one behavior change, now documented in `docs/tree.md`:** if other code changes such a property directly, a rerun no longer restores it.

### Results

**Scratch harness** (1,000 cards, no layout, data generated outside the timing; median ms):

| | Create: before → after | Rebind: before → B → B+C |
|---|---|---|
| Chromium | 18 → 11–13 | 17.5 → 9–11 → **5.4** |
| Firefox | 40 → 22–26 | 34 → 21 → **13** |
| WebKit | 27 → 17–18 | 23 → 12 → **7** |

**`demos/tree-benchmark.html`, Tree ÷ vanilla template clone, card shape:**

| | Before (Step 1 addendum) | After |
|---|---|---|
| **Chromium, no layout:** create / rebind | ~2.2× / ~3× | **~1.5× / ~1.5×** |
| **Firefox, no layout:** create / rebind | ~4.5× / ~10× | **~2.5× / ~5×** (vanilla rebind there is only ~3 ms) |
| **WebKit, no layout:** create / rebind | ~3.8× / ~5.6× | **~2.3× / ~2.0×** |
| **With normal layout** (all browsers) | 1.3–1.8× | **mostly 1.1–1.4×** |
| **With `content-visibility`** | ~2–3× | **~1.3–1.8×** (Firefox rebind ~3×) |

For the row shape, Tree is now within ~1.0–1.3× of template clone with layout. Construction only, it's ~1.5–2.7×; there are no "before" numbers for this mode.

**After the changes**, a Chromium profile shows Tree's own overhead is now small. Of the remaining self time, ~20% is `applyFast`, which includes the native `textContent` / `className` setters (real DOM work), and then `createElement` / `appendChild`. `containerOf` (~2.5%, creation only), `normalize` (~2%) and `getValue` for the repeat's `of` (~1%) are the remaining Tree-specific items.

### Other ideas evaluated

| Idea | Finding |
|---|---|
| **Dirty check: write only when the value differs** | **Measured, not shipped.** On reruns with *unchanged* data, Chromium 5.1–5.8 → 4.0–5.8 ms, Firefox 12–13 → 9–10, WebKit 7 → 5–6. It also avoids DOM mutations (no `MutationObserver` noise, no text-node replacement). But it skips setters that someone might rely on for side effects, so it's a semantic choice. **Your call:** I'd consider it as an opt-in, or as the default only for `textContent`. |
| `containerOf` via `localName === 'template'` instead of `instanceof` | Not done. It's ~2.5% of creation, a trivial change, and worth folding into a later pass. |
| Resolving `of` without `getValue` when it's `'?.'` | Not done. ~1% of rebind. |

### A test-suite finding, unrelated to Tree

The one full-suite failure I saw (and very likely the unreproduced one from Step 1) is **`tests/find-class-prototype-in-path`**. It reported `total: 0`. Its page starts with `data-total="0"` in the markup, and the spec waits only for the attribute to *exist*, so under parallel load (e.g. next to the CPU-heavy benchmark) it can read the results before the page's tests have run. Alone, it passes every time. **The fix** is one line in the spec: wait for `data-total !== '0'`. I didn't change it, since it's outside this step.

### Verification

- **Full suite:** 123 passed, 2 skipped (the benchmark in Firefox and WebKit), plus that one unrelated race (it passes when run alone).
- **All Tree-related specs** pass in Chromium, Firefox and WebKit: tree, root references, pipes, event binding.
- `tsc` is clean, in a scratch copy; no `.js` touched.

### What this means for compiling

The *Tree-overhead* part of the gap is now mostly gone. What's left, ~1.5× in Chromium and ~2–2.5× in Firefox and WebKit (construction only), is mostly **`createElement` vs. cloning**, which is exactly what compiling (Steps 2–3) targets. Rebind is now close to vanilla in Chromium and WebKit, so compiling no longer has to make up for slow rebinding.

### Decisions for you

1. **Dirty check:** skip, opt-in, or default (perhaps only for `textContent`)?
2. **The small remaining items** (`containerOf` via `localName`, `of: '?.'` without `getValue`): fold them in now, or leave them for a later pass?
3. **The `find-class-prototype-in-path` race:** OK to apply the one-line fix to that spec?

## Bruce's Response

Please apply all three fixes now, thanks for checking.

## Claude's Notes: The Three Follow-ups

All three are applied.

1. **Dirty check, for `textContent` only.** I went with the conservative of the options I'd listed. On the fast path, `textContent` is only assigned when the text differs (`null` / `undefined` compare as `''`, matching the setter). That's where the win is, since a same-string assignment replaces the text node and fires `MutationObserver`s, and a native `textContent` setter has no side effects to preserve. **Other properties are still always assigned**, so setters (including custom-element ones) behave exactly as before. Documented in `docs/tree.md` → Performance Notes. If you'd like it broader (opt-in for all properties), that's a small follow-up.
2. **The small tweaks:**
   - **`containerOf`** checks `localName === 'template'` instead of `instanceof HTMLTemplateElement`.
   - **A new `resolvePath` helper** (with split paths cached by string) resolves simple `?.` paths directly, falling back to `getValue` under the same conditions as the fast path. It's now used by the fast path **and** by repeats. The repeat's `of`, and especially its **`key`, which previously cost an options spread plus `getValue` for every item**, now resolve directly.
3. **The flaky spec.** `tests/find-class-prototype-in-path.spec.ts` now waits for `data-total !== '0'` instead of for the attribute to exist (the page's markup starts with `data-total="0"`).

### Results

Scratch harness, 1,000 cards, no layout, median ms (before these follow-ups → after):

| | create | rebind | rebind, unchanged data |
|---|---|---|---|
| Chromium | 11–13 → **9.3–10.4** | 5.4 → **4.4–5.2** | 5.1–5.8 → **3.4–4.0** |
| Firefox | 22–26 → **22–24** | 13 → **11** | 12–13 → **9–10** |
| WebKit | 17–18 → **16** | 7 → **6–7** | 7 → **5** |

**For all of Step 1b**, from the original baseline:

| | create | rebind |
|---|---|---|
| Chromium | 18 → ~10 ms (**~1.8×**) | 17.5 → ~4.7 ms (**~3.7×**) |
| Firefox | 40 → ~23 ms (**~1.7×**) | 34 → ~11 ms (**~3.1×**) |
| WebKit | 27 → ~16 ms (**~1.7×**) | 23 → ~6.5 ms (**~3.5×**) |

### Verification

- **Full suite, twice: 124 passed, 2 skipped** (the benchmark in Firefox and WebKit), **0 failed**. The previously flaky spec passed both times while running alongside the benchmark.
- Tree tests: 120 / 120 in Chromium, 119 / 119 in Firefox and WebKit.
- `tsc` is clean, in a scratch copy; no `.js` touched (the repo's `.js` is stale until you rebuild).

