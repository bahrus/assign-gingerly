# Step 1: Fragment Targets + Baseline Benchmarks

**Goal:** clear the two remaining prerequisites before any compiling work:

- **A.** Tree can render into a `ShadowRoot` (and other `DocumentFragment`s), so it's usable inside web components.
- **B.** We have numbers for today's Tree, and for the nested-vs-flat template question, so compiling has a concrete bar to beat.

Neither part changes Tree's behavior for `Element` targets.

---

## A. `ShadowRoot` / `DocumentFragment` targets

### Today

`TreeHandler.assign` returns early unless `lhsTarget instanceof Element`. Nothing else in Tree fundamentally needs an `Element`:

| Piece | Works on a fragment? |
|---|---|
| `findChildMarkers` (scans `childNodes`) | Yes |
| `createMarkers` (`appendChild`) | Yes at runtime, but its parameter is typed `Element` → widen to `Element \| DocumentFragment` |
| `placeInOrder(parent: Element, …)` (`insertBefore`) | Yes at runtime → widen the type to `ParentNode & Node` |
| State keyed by the start marker | Yes |
| "removed by other code" checks (`node.element.parentNode !== lhsTarget`) | Yes: the parent of a top-level node *is* the fragment / shadow root |
| `resolveManagerConfig`: `(element).customElementRegistry?.itemscopeRegistry` | Yes, and a `ShadowRoot` can carry a **scoped** `customElementRegistry`, which managers would then be registered in |

### Proposed change

- Accept `Element | DocumentFragment` targets (a `ShadowRoot` is a `DocumentFragment`).
- Widen the types of `createMarkers` and `placeInOrder`.
- Add tests:
  1. render into `attachShadow({ mode: 'open' })`, then rerun → elements reused;
  2. arrays and managers inside a shadow root;
  3. a `{ tag, ish: Class }` header resolves its registry from a shadow root with a scoped registry (if the browsers support scoped registries; skip the test where they don't).

### The plain-`DocumentFragment` caveat

When a plain fragment's children are appended somewhere, they (including Tree's markers) **move out** of the fragment. Rerunning Tree on the now-empty fragment creates a fresh tree, as it does today for an `Element` whose markers were removed. The proper way to rerun is to target the node the content moved into. That's correct behavior, but worth one sentence in the docs.

### Decisions needed

1. **Scope:** any `DocumentFragment` (recommended; costs nothing extra), or `ShadowRoot` only?
2. **Element-only checks elsewhere:** none of Tree's other paths need an `Element` target, but ` +=` self-binding (`' +='`) requires an `Element` LHS. Binding events on a *shadow root* itself would be a new feature. **I recommend not doing that now.** A shadow root isn't an element; bind on the host from outside instead.

---

## B. Baseline benchmarks

### B1. Tree vs. vanilla (the bar for compiling)

**A new benchmark page** (`demos/tree-benchmark.html`) plus a spec (`tests/tree-benchmark.spec.ts`), following the existing `tests/benchmark.spec.ts` pattern: buttons per operation, results printed to the page, and the spec reporting a comparison table.

**Two component shapes:**

| Shape | What it is | Why |
|---|---|---|
| **Static-heavy card** | ~12 elements: wrappers, labels, classes, ARIA, 2–3 bound values. Like the demo's rocket card. | The case compiling should win big |
| **Binding-heavy row** | ~6 elements, nearly every one bound (like js-framework-benchmark's rows) | The case compiling should barely help |

**Four approaches:**
- Tree, as it is today;
- vanilla `createElement`;
- vanilla template clone + manual binding (an approximate lower bound for what compiling could reach);
- `manageTemplateList` for the row shape, for reference.

**Operations:**

| Operation | Sizes |
|---|---|
| Create N instances | 1,000 and 10,000 |
| Rebind all (same structure, new values) | 1,000 |
| Keyed reorder (swap, reverse) via a repeat | 1,000 |
| Clear | 1,000 |

**Reporting:**
- the median of several runs, after a warmup;
- **ratios relative to vanilla template clone**, so we can see how much headroom compiling could plausibly capture.

### B2. Nested vs. flat templates (confirming the principle)

A micro-benchmark in the same page, with an outer card template plus an item template (a list of K items per card):

| Variant | Description |
|---|---|
| **Nested** | The item `<template>` lives *inside* the card template's content. Each card clone also deep-copies it, and items are cloned from the card's own copy. |
| **Flat** | The item template is a separate, shared template. Card clones contain no template, and items are cloned from the shared source. |

Measured over N cards × K items, with N ∈ {1,000} and K ∈ {0, 3, 20}, timing card creation including items. Prediction: nested is slower, and the gap grows with the item template's size and with N, while K = 0 shows the pure "copied for nothing" overhead. If the numbers contradict this, we revisit the principle before Step 3.

### Decisions needed

3. **Run benchmarks in the default `npm test`?** The existing `benchmark.spec.ts` does run in the full suite. **I recommend Chromium only, informational (no thresholds),** and also runnable on its own via `npm run benchmark`-style scripting.
4. **Component shapes:** are the two above (static-heavy card, binding-heavy row) the right representatives, or do you have a real component in mind for the "thousands of instances" case? A real one would be better.
5. **The go / no-go bar for compiling (used in Step 4):** I suggest **≥ 1.5× faster creation of 1,000 static-heavy instances, with no regression in rebind**. Anything less isn't worth the extra code path.

---

## Deliverables

- [ ] Tree accepts `DocumentFragment` / `ShadowRoot` targets (types, code, tests, one doc paragraph)
- [ ] `demos/tree-benchmark.html` + `tests/tree-benchmark.spec.ts` (B1 + B2)
- [ ] A results table appended to this file (Chromium, Firefox, WebKit if practical), with conclusions on (a) the headroom for compiling and (b) nested vs. flat
- [ ] The README's prerequisites table updated

## Bruce's Feedback

I agree with all the recommendations for the decisions.

---

## Claude's Implementation Notes

**Both parts are done.** Decisions applied as recommended:
- any `DocumentFragment` target;
- no event binding on a shadow root itself;
- benchmarks run in Chromium only, informational;
- the two component shapes as proposed;
- a 1.5× go / no-go bar. **But see the results: the bar needs revisiting.**

### A. Fragment targets ✅

| File | Change |
|---|---|
| `handlers/tree.ts` | Accepts `Element \| DocumentFragment`; `findChildMarkers` / `placeInOrder` widened to `TreeTarget` |
| `markerUtils.ts` | `createMarkers(target: Element \| DocumentFragment, …)` |
| `handlers/tree.ts` (managers) | **Resolve through the tree's target registry.** The target travels with the options under a private symbol (spread preserves it). `resolveManagerConfig` tries the target's `customElementRegistry` first (so a shadow root with a scoped registry uses its own managers), then the created element's, then the global one. |
| `tests/tree.html` | 3 new scenarios (38 in total): see below |
| `docs/tree.md` | A new "Targets" section, including the plain-fragment caveat |

**The new tests:**
1. **Shadow root:** with a manager and a repeat; a rerun reuses elements.
2. **Plain `DocumentFragment`:** after appending, a rerun on the new parent reuses the moved tree.
3. **Scoped registry:** a manager name resolved in a shadow root's scoped registry, not the global one. This **runs for real in Chromium**, which supports scoped registries, and is skipped elsewhere.

**Tree tests:** 120 / 120 in Chromium, 119 / 119 in Firefox and WebKit.

### B. Benchmarks ✅

[`demos/tree-benchmark.html`](../../../../../../demos/tree-benchmark.html) + `tests/tree-benchmark.spec.ts`. The page runs everything automatically on load: medians of 5 runs (3 for 10,000) after a warmup, each timing including a forced layout. The spec runs in Chromium only (skipped in Firefox and WebKit) and prints the tables.

**Results:** Chromium, 3 runs. Ratios are relative to vanilla template clone (the realistic lower bound for compiling). I give ranges because single runs are noisy: some cells moved 2–3× between runs (e.g. "card reverse" 37 → 167 ms across *all* approaches at once), which points to the machine rather than the code. **The ratios are steadier than the absolute times.**

| Shape / operation | Tree | `createElement` | template clone | `manageTemplateList` |
|---|---|---|---|---|
| **card** create 1,000 | **1.44–1.52×** | 1.10–1.19× | 1.00 | |
| card create 10,000 | 1.32–1.53× | 1.04–1.19× | 1.00 | |
| card rebind 1,000 | ≈ 2× `createElement` (48–50 ms vs 18–20 ms)\* | | | |
| card reverse 1,000 | 1.59–1.61× | 0.99–1.05× | 1.00 | |
| card clear 1,000 | ≈ 1.0–1.2× | ≈ 1.0–1.1× | 1.00 | |
| **row** create 1,000 | 1.34–1.40× | 1.06–1.11× | 1.00 | 1.17–3.38× |
| row create 10,000 | 1.25–1.41× | 1.07× | 1.00 | 1.20× |
| row rebind 1,000 | 1.53–1.79× | ≈ 1.0× | 1.00 | 1.13–1.20× |
| row reverse 1,000 | 1.39–1.48× | ≈ 1.0× | 1.00 | 0.88–0.97× |
| row clear 1,000 | ≈ 1.0–1.1× | ≈ 1.0× | 1.00 | ≈ 1.0–1.1× |

\* In the card's rebind, the vanilla template-clone cell was itself erratic (21–55 ms) even though it runs the same update code as `createElement`, so I compare that row against `createElement`.

**B2: nested vs. flat templates** (1,000 cards, × K items):

| K | Nested ÷ flat |
|---|---|
| 0 | **1.11–1.17** (consistent) |
| 3 | 0.73–1.11 (noise) |
| 20 | 0.98–1.13 (noise) |

### Conclusions

**(a) The headroom for compiling is smaller than hoped.**
- **Vanilla template clone is only ~10–20% faster than vanilla `createElement`.** Cloning itself buys little at these sizes.
- **Tree's creation overhead is ~1.3–1.5× template clone.** That's the *most* that clone-and-bind compiling could recover on creation, and it's right at the agreed **1.5× bar**. So compiling would very likely *not* clear it.
- **Tree's bigger relative cost is in rebind and reverse** (1.4–1.8×, about 2× in the card's rebind), which compiling, as designed, doesn't touch.

**Recommendation:** before Step 2, **profile Tree's own overhead.** There are cheap candidates that help creation *and* rebinding, with no new code path:
- `normalize()` allocates a new tuple for every node on every call, and could be cached per spec object;
- pattern objects are spread per node (`{ ...options, from }`);
- static literal keys (e.g. `className: 'card'`, `_: 'Active'`) are re-applied on every rebind, although they never change.

Those may close much of the 1.3–1.8× gap on their own. Compiling would then be judged mainly on **server-rendered templates** (Step 5), where its value isn't raw speed.

**(b) Nested vs. flat: the principle holds, but the effect is modest at these sizes.**
- **Measured:** the "copied for nothing" overhead is clearly measurable when the outer clone dominates (K = 0: +11–17%). Once item work dominates (K ≥ 3), it disappears into the noise.
- **Not measured:** the overhead grows with the *inner* template's size; mine was small (3 elements). Larger inner templates, or deeper nesting, would make it bigger, which fits your timing experiments.
- **Flat was never meaningfully slower.** So Principle 1 stands: there's no downside, and a real cost avoided.

### Verification

- **Full suite:** 124 passed, 2 skipped (the benchmark in Firefox and WebKit) on 4 consecutive runs. One earlier run had a single failure I couldn't capture or reproduce afterwards. I note it rather than hide it; if it recurs, the benchmark running in parallel with timing-sensitive tests is the first suspect.
- `tsc` is clean, in a scratch copy; no `.js` touched.

### Deliverables

- [x] Tree accepts `DocumentFragment` / `ShadowRoot` targets (types, code, tests, one doc section)
- [x] `demos/tree-benchmark.html` + `tests/tree-benchmark.spec.ts` (B1 + B2)
- [x] Results table and conclusions (above). Chromium only, per decision 3.
- [x] The README's prerequisites table updated

### Decisions for you before Step 2

1. **Insert a "Step 1b: profile and trim Tree's overhead"** (normalize caching, fewer option spreads, skipping static keys on rebind), and re-measure against this baseline before deciding on compiling? **I recommend yes.**
2. **Revisit the Step 4 bar?** Given the ~1.3–1.5× ceiling, compiling would need to be justified by server-rendered templates (Step 5) rather than by runtime speed alone.

---

## Addendum: `content-visibility` and construction-only timings

Two follow-ups prompted by the simple [template vs. `h()` page](../../../../../../demos/template-vs-h-benchmark.html), which showed cloning to be **2.7–4.3× faster** than `h()` for a large static structure. That's far more than the 10–20% above.

**How often is layout forced?** Once per timed operation. The whole batch (1,000 or 10,000 items) is inserted, then `stage.offsetHeight` is read once. It isn't once per item.

**New URL options on `demos/tree-benchmark.html`:**

| Option | Effect |
|---|---|
| `?cv` | Adds `.card { content-visibility: auto; contain-intrinsic-size: 500px; }` |
| `?layout=0` | Skips the forced layout (construction only) |
| `?only=card` / `?only=row` | Runs one shape |

Note that `content-visibility` doesn't apply to table rows (containment doesn't apply to table-internal boxes), so only the card shape is affected.

**Card shape, median ms:** baseline / `cv` / no forced layout.

| Operation / approach | Chromium (2 runs) | Firefox | WebKit |
|---|---|---|---|
| create 1,000: Tree | 50–55 / 28–30 / 26 | 80 / 61 / 50 | 94 / 56 / 30 |
| create 1,000: `createElement` | 36–41 / 15–16 / 13–14 | 54 / 29 / 19 | 83 / 41 / 14 |
| create 1,000: template clone | 38 / 13 / 11–12 | 45 / 18 / 11 | 77 / 34 / 8 |
| create 10,000: Tree | 560–570 / 273–274 / 252–261 | 772 / 516 / 428 | 1133 / 586 / 337 |
| create 10,000: `createElement` | 420–442 / 162–165 / 142 | 535 / 313 / 210 | 962 / 425 / 144 |
| create 10,000: template clone | 394–400 / 126–144 / 114–116 | 437 / 209 / 102 | 893 / 365 / 81 |
| rebind 1,000: Tree | 48–50 / 24–25 / 27–28 | 77 / 45 / 40 | 88 / 38 / 39 |
| rebind 1,000: template clone | 18–20 / 7–8 / 9 | 20 / 17 / 4 | 31 / 8 / 7 |

### What this shows

1. **Yes, `content-visibility: auto` dilutes the forced layout a lot.**
   - **Chromium:** it brings timings close to the "no layout at all" numbers (create 1,000 template clone: 38 → 13 ms; Tree: 50 → 28 ms). Skipped subtrees are laid out at their intrinsic size, so the one forced layout becomes cheap.
   - **Firefox and WebKit:** the effect is real but smaller, about half way to "no layout".
2. **With layout out of the way, the gaps widen considerably:**

   | Ratio (cv / no layout) | Chromium | Firefox | WebKit |
   |---|---|---|---|
   | Tree ÷ template clone, create | ~2.0–2.3× | ~2.5–4.5× | ~1.6–4.2× |
   | `createElement` ÷ template clone, create | ~1.1–1.3× | ~1.5–2× | ~1.2–1.8× |
   | Tree ÷ template clone, rebind | ~3× | ~3–10× | ~4–5× |

3. **This revises my Step 1 conclusion.** The 1.3–1.5× "ceiling" was mostly an artifact of a full layout of every card dominating each measurement. When rendering is cheap (`content-visibility`, off-screen work, or a layout paid once later anyway), **compiling has 2–4× of headroom on creation**, which clears the 1.5× bar comfortably. That holds especially in Firefox and WebKit, where cloning beats `createElement` by more.
4. **Rebind is the bigger gap, and compiling doesn't address it.** Tree's rebind is ~3–5× vanilla once layout is diluted. That strengthens the case for **Step 1b** (normalize caching, fewer option spreads, skipping static keys on rebind). It helps rebind directly, and it helps creation too.

**Revised recommendation:** keep the 1.5× bar, but **measure Step 4 with `?cv` and with `?layout=0` as well as the baseline**. Do Step 1b first, because rebind is where Tree is furthest behind.
