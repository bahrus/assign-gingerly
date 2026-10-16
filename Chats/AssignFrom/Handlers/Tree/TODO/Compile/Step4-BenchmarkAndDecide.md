# Step 4: Benchmark and Go / No-Go

*Outline.*

**Goal:** rerun the Step 1 benchmarks with `compile` on, and compare against the Step 1 baseline and the vanilla-template lower bound.

**The bar (agreed in Step 1):** for example, ≥ 1.5× faster creation of 1,000 static-heavy instances, with no rebind regression.

**Outcomes:**
- **Pass:** document `compile`, and continue to Step 5.
- **Marginal:** look at where the time goes (walk? dynamic-key application? template lookup?) before deciding.
- **Fail:** keep the compiler (it's still useful for Step 5's server-side templates, possibly), but don't ship the runtime `compile` path.

## Bruce's Update

It was mentioned in [step 3](./Step3-CloneAndBind.md#claudes-implementation-notes) that part of step 4 should include:

> The benchmark card should be written with ` :=` statics, so there's something to bake. A variant with property statics (`className`) shows what compiling gains without rewriting patterns.

Can you please do this step now?

## Claude's Results

### Short version

- **Compiling with statics written as ` :=` makes creation 1.6–1.9× faster in Firefox and WebKit,** clearing the 1.5× bar.
- **In Chromium the gain is 1.2–1.4×,** below the bar. But there, today's Tree was only ~1.4× slower than hand-written template cloning to begin with, and compiled Tree gets to **1.06–1.19× of it**. There was no 1.5× left to win in Chromium.
- **Rebind: no regression** in any browser.
- **Compiling *without* rewriting statics** (`className`) gains 1.3× in Firefox and WebKit, and **nothing in Chromium** (0.9–1.0×).
- **Once layout is included,** every gain shrinks to 1.0–1.2×.

**Recommendation: a conditional pass.** Keep `compile` as an **opt-in**, documented as "for static-heavy lists, with statics written as ` :=`". **Don't make it the default.** Details and the next-step options are below.

### What was measured

[`demos/tree-benchmark.html`](../../../../../../demos/tree-benchmark.html), group B1, has **four Tree variants** of the same lists. A check confirmed all four build identical DOM (attributes compared as a set).

| Variant | Statics written as | `compile` |
|---|---|---|
| **Tree** (today's baseline) | properties (`className: 'card'`, `ariaLabel`, `role`) | off |
| Tree compile | properties | on |
| Tree := | attributes (`'class :=': 'card'`, …) | off |
| **Tree := compile** | attributes | on |

These run next to vanilla `createElement` and vanilla **template clone**, the lower bound.

**Shapes:**
- the static-heavy **card**: 16 elements, 3 bound values, 24 statics;
- the binding-heavy **row**: 7 elements, 4 bound values.

**Method:**
- 11 timed runs per measurement (3 for 10,000);
- **one fresh browser page per approach**;
- 3 repetitions, interleaved, reporting medians;
- build-only (`?layout=0`) and with a forced layout;
- in Chromium, Firefox and WebKit.

**Why one page per approach:** my second run measured all approaches in one page, as Step 1 did. In WebKit, approaches measured later in a page came out up to 3× slower, a drift that reproduced exactly on a rerun. So I added `?approach=` to the page, and the final run isolates every approach. Chromium and Firefox gave the same picture both ways.

The page also gained `?ops=` and `?runs=` options. The map is now created once per approach, as an app would, so the warmup runs compile it and the timed runs reuse the templates.

### Results: static-heavy card, build only (ms; × template clone in parentheses)

| | Chromium | Firefox | WebKit |
|---|---|---|---|
| **create 1,000** | | | |
| Tree (today) | 16.1 (1.41) | 25 (2.27) | 17 (2.13) |
| Tree compile | 16.5 (1.45) | 18 (1.64) | 13 (1.63) |
| Tree := | 18.4 (1.61) | 24 (2.18) | 18 (2.25) |
| **Tree := compile** | **13.6 (1.19)** | **13 (1.18)** | **10 (1.25)** |
| template clone | 11.4 | 11 | 8 |
| **create 10,000** | | | |
| Tree (today) | 165.5 (1.26) | 228 (2.09) | 189 (2.15) |
| Tree compile | 183.6 (1.40) | 175 (1.61) | 143 (1.63) |
| **Tree := compile** | **139.0 (1.06)** | **123 (1.13)** | **103 (1.17)** |
| template clone | 131.4 | 109 | 88 |
| **rebind 1,000** | | | |
| Tree (today) / Tree := compile | 12.4 / 12.1 | 14 / 13 | 14 / 13 |

**Speed-ups over today's Tree, consistent across all three runs:**

| | Chromium | Firefox | WebKit |
|---|---|---|---|
| **Tree := compile**, create 1k | **1.18–1.42×** | **1.60–1.92×** | **1.60–1.70×** |
| **Tree := compile**, create 10k | **1.19–1.21×** | **1.78–1.94×** | **1.71–1.83×** |
| Tree compile (statics unchanged), create 1k / 10k | 0.98× / 0.90–0.92× | 1.39× / 1.30–1.37× | 1.31× / 1.25–1.32× |
| Rebind (any variant) | 0.96–1.03× | 0.93–1.08× | 1.00–1.08× |

Firefox and WebKit timers have 1 ms resolution, so their 1k numbers are coarse. The 10k numbers agree with them.

### Results: binding-heavy rows, and with layout

- **Rows, build only:** `Tree := compile` vs. today's Tree is 1.1–1.25× (Chromium), 1.3–1.4× (Firefox) and 1.3–1.4× (WebKit). There's less to bake: 4 bound values out of 7 elements, and only `class` statics.
- **With a forced layout,** every comparison shrinks to **1.0–1.2×**:
  - card create 1k, `:=` compile vs. Tree: 1.04× (Chromium), 1.20× (Firefox), 1.08× (WebKit);
  - rebind stays flat.

  Layout dominates, as in every earlier benchmark.

### What this says

1. **The gain comes from baking, not from cloning.**
   - In Chromium, `createElement` is fast (vanilla `createElement` is only 1.2× template clone). So cloning bare elements saves nothing, and compiling with property statics is even a little slower at 10k (0.90×). The pairing walk and per-instance property statics cost what `createElement` would have.
   - Firefox and WebKit have slower `createElement` (1.75–2×), so cloning alone gains 1.3×.
   - **Everywhere, the big win is ` :=` statics, which make the per-instance work disappear.** This confirms your decision to bake only ` :=` (no allowlist): it's the mechanism that pays.
2. **Compiled Tree is near the floor.** `Tree := compile` is 1.06–1.25× of hand-written template cloning in every browser. The remaining gap is Tree's own bookkeeping per instance:
   - pairing 16 `TreeNode`s;
   - the repeat's keyed reconciliation;
   - `normalize(spec)` on every `syncNode`;
   - the fast-path application of the 3 bound values.
3. **The bar.** Firefox and WebKit clear ≥ 1.5× with no rebind regression. Chromium can't: its whole headroom was 1.41×, and compiling captures 0.83 of that factor (16.1 → 13.6 ms, against a floor of 11.4 ms). By the "marginal" branch of this step's outcomes, the time left in Chromium is the bookkeeping listed above, not template work.
4. **Real pages include layout,** where the gains are 4–20%. Compiling matters most for **building large lists off-screen** or ahead of display (e.g. `content-visibility`, virtualized lists, background tabs), and for the eventual server-rendered path (Step 5 / 6).

### Recommendation

- **Ship `compile` as an opt-in** (it is already, and documented as experimental). In `docs/tree.md`, add the guidance: *use it for large, static-heavy lists, and write statics as ` :=`. Without ` :=` statics it gains little, and nothing in Chromium.*
- **Don't make it the default.** It needs the ` :=` rewrite to pay off, it imposes the immutable-spec rule, and with layout the gain is small.
- **Optional, a small follow-up before Step 5:** cache `normalize(spec)` per spec object, and skip work in `pairNodes` for nodes with nothing to bind. Both help compiled *and* uncompiled Tree. The likely gain is a few percent, so I'd only do it if you want to chase Chromium's last 1.19× → ~1.1×.

### Questions for you

1. **Accept the conditional pass:** opt-in `compile`, documented with the ` :=` guidance, not the default?
2. **Next:** Step 5 (server-rendered templates), the small bookkeeping optimization, or pause the roadmap here? Given that layout dominates on real pages, Step 5's value is mostly the **SSR / adoption story** (Step 6) rather than raw speed. I'd do it only if server rendering is a goal for you.

## Bruce's Response

I was inclined to that agree that compile should be opt in for the simple reason that launching the handler is asynchronous, so we should be able to choose what to import at that point, and since not all content repeats, importing something that is designed for repeating scenarios seems wasteful.

Can you please do at least one more experiment?

Can you create a page that does the same exact thing [js-framework-benchmark-vanilla](../../../../../../demos/js-framework-benchmark.html) does -- but using the tree handler instead of the manage template list handler?

Make it possible to test compiling and no compiling options (either with one page with a checkbox or two pages).

## Claude's Response II

### 1. The compiler is now imported only when `compile` is set

I took your point literally and implemented it:
- **`processHandlerCommands`** now calls an optional **`static prepare(config)`** on a handler class before instantiating it, and awaits it only when it returns a promise. The hook is documented on `AssignFromHandlerConstructor` in `types.d.ts`.
- **`TreeHandler.prepare`** does `import('./compileTree.js')` only for configs with `compile`, and only once.
- `tree.ts` no longer imports the compiler statically, so **trees without `compile` never download it**.
- If `assign()` is called directly, without `prepare`, a `compile` config renders uncompiled, with a one-time warning.

**Test:** `tests/tree.html` now checks the page's resource timing. `compileTree.js` is **never fetched** in the normal run and **is fetched** in the `?compile` run. All Tree and `compileTree` tests pass.

### 2. The experiment: [`demos/js-framework-benchmark-tree.html`](../../../../../../demos/js-framework-benchmark-tree.html)

It's the same page as `js-framework-benchmark.html`:
- the same data generator, buttons and timing (`render`, then `requestAnimationFrame` + `setTimeout`);
- `builtIns.tree` instead of `manageTemplateList`;
- the same row markup: `td.a`, `td.b`, and `button.remove` with "×", written as ` :=` statics and literal text.

A **`compile: true` checkbox** reloads the page with `?compile`, so the two modes never share state. A smoke test confirmed that both modes build the same 1,000 rows as the `manageTemplateList` page, and that update and swap work.

### Two bugs found in the existing `manageTemplateList` page

While checking that each page's timing covers its work, I found two problems in `demos/js-framework-benchmark.html`. I **left the page unchanged.**
1. **In Chromium, its timer stops before any rows exist.** It calls the synchronous `assignFrom`, whose ` =>` handler work runs afterwards. At the moment "Create 10,000 … 10.4 ms" was written, **0 of the 10,000 rows existed**. That's why it reported ~12 ms for every operation in Chromium. Firefox happened to cover the work. The fix is `await assignFromAsync(…)`. For the comparison below, I measured a copy with that one change (scratch only).
2. **"Swap rows" doesn't swap.** After it, row 2 still has id 3, where Tree and vanilla show 1000. So its swap timing measures a no-op, and I've left it out below.

Both look worth fixing in the page, along with the `manageTemplateList` swap behavior itself. **Shall I?**

### Results

**Pages:**
- vanilla (`createElement`, re-appending every row on each render);
- vanilla template;
- `manageTemplateList` (awaited);
- Tree;
- Tree with `compile`.

**Method:**
- each page loaded 3 times in a fresh browser, interleaved;
- per load, one untimed warm-up sequence, then 3 timed sequences of create 1k → append 1k → update every 10th → swap → clear → create 10k → clear;
- medians of 9 samples, in ms, as the pages measure them; × vanilla in parentheses.

| | Chromium | | | Firefox | | | WebKit | | |
|---|---|---|---|---|---|---|---|---|---|
| | **mTL** | **Tree** | **Tree compile** | **mTL** | **Tree** | **Tree compile** | **mTL** | **Tree** | **Tree compile** |
| Create 1,000 | 34.2 (1.22) | 25.4 (0.90) | 24.4 (0.87) | 32 (1.45) | 24 (1.09) | 23 (1.05) | 226 (1.17) | 202 (1.05) | 191 (0.99) |
| Append 1,000 | 58.7 (1.24) | 36.6 (0.77) | 41.5 (0.88) | 49 (1.09) | 30 (0.67) | 31 (0.69) | 319 (0.87) | 226 (0.62) | 230 (0.63) |
| Update every 10th | 54.5 (1.15) | 38.9 (0.82) | 38.5 (0.81) | 41 (0.89) | 27 (0.59) | 25 (0.54) | 220 (0.60) | 166 (0.45) | 166 (0.45) |
| Swap rows | (no-op) | 31.5 (0.56) | 47.9 (0.84) | (no-op) | 32 (0.70) | 33 (0.72) | (no-op) | 296 (0.79) | 297 (0.79) |
| Clear | 24.7 (1.30) | 16.9 (0.89) | 16.5 (0.87) | 53 (1.15) | 41 (0.89) | 43 (0.93) | 184 (1.20) | 158 (1.03) | 126 (0.82) |
| Create 10,000 | 848.6 (2.48) | 368.0 (1.08) | 355.0 (1.04) | 317 (1.43) | 260 (1.17) | 267 (1.20) | 2121 (1.16) | 1883 (1.03) | 1878 (1.03) |

**Baselines:**
- Vanilla: create 1k 28.1 / 22 / 193 ms; create 10k 342 / 222 / 1829 ms.
- Vanilla template: create 1k 25.7 / 23 / 182 ms; swap 30.2 / 18 / 88 ms.

### What this says

1. **Tree beats `manageTemplateList` on every operation in every browser:**
   - 1.1–1.4× on create 1k;
   - **2.3× on create 10k in Chromium**, 1.1–1.2× elsewhere;
   - 1.3–1.6× on append and update.

   Against vanilla, Tree is at parity on creates (0.90–1.17×) and faster on append and update (0.45–0.82×). That's because this "vanilla" page re-appends every row on each render.
2. **Compiling makes no measurable difference here,** within ±10%. The differences go both ways and are mostly noise. The reason is that the timing includes waiting for the next frame (`requestAnimationFrame`), so results land on ~16 ms frame boundaries. For example, Chromium's swap 31.5 vs. 47.9 ms is exactly one frame apart, for an operation where `compile` runs identical code. These rows are also **binding-heavy**: 5 elements, 2 bound values, and only 4 small statics. That matches Step 4: compiling pays off for static-heavy markup, built without layout, and this benchmark is neither.
3. **A real finding about Tree: swapping two rows is slow in Firefox and especially WebKit.** WebKit takes 296 ms vs. 88 ms for vanilla template; Firefox 32 vs. 18 ms. The cause is `placeChildren`. After a swap, its cursor falls out of step, so it **moves nearly every row after the first swapped one** (~997 `insertBefore` calls) instead of 2. Chromium moves nodes cheaply, so it barely shows there (31.5 vs. 30.2 ms). A smarter placement, such as only moving elements that are out of order relative to a longest-increasing-subsequence, as keyed frameworks do, would fix it. That's independent of compiling.

### Updated recommendation

- **`compile` stays opt-in,** now loaded only when used. That's your reasoning, and both experiments support it. It matters for large, static-heavy content with ` :=` statics, and is neutral otherwise.
- **The swap / reorder fix in `placeChildren`** looks like a better use of the next effort than Step 5, since it affects every Tree with a keyed repeat.

### Questions for you

1. **Fix the two `js-framework-benchmark.html` bugs** (the await, and the swap), and look at why `manageTemplateList` doesn't reorder?
2. **Optimize Tree's reordering** (the swap case) next?
3. **Step 5:** still deferred?

## Bruce's Response II

Yes, please address both 1, and 2, before moving on to step  5.

## Claude's Implementation Notes: Reordering and the Benchmark Page

Both are done.

**Results:**
- **Full suite: 142 passed, 2 skipped, 0 failed,** in Chromium, Firefox and WebKit.
- **`tree.html`:** 130 / 130, normally and with `?compile`.
- **New `template-list-reorder.html`:** 14 / 14.
- `tsc` is clean, in the scratch copy; no `.js` touched.

### Minimal-move placement, shared: [`utils/placeNodes.ts`](../../../../../../utils/placeNodes.ts)

`placeNodes(parent, nodes, first)` puts `nodes` in order, starting at `first`:
1. **Fast path:** nodes already in place are skipped. An unchanged order is one walk and **0 moves**.
2. **On the first mismatch,** the longest run of the remaining nodes that are already in relative order stays put. That's a longest increasing subsequence of their current positions, O(n log n), as keyed frameworks do. Only the others move, so **a swap is 2 moves** instead of ~997.
3. **Consecutive nodes that move or are new go in together** through one fragment, so **creating a list is a single insertion**.
4. **Other nodes in the region** (a repeat container's own text, or a node added by other code) end up after the items. If one sits before or between them, placement falls back to the old cursor walk, which is still correct.

**`builtIns.tree`** uses it for repeat items and for top-level keys, replacing its two copies of the cursor loop.

**`manageTemplateList`** used to **never move existing items**: it updated them in place and appended new clones before the end marker. That's why "Swap rows" did nothing, and why an item inserted mid-list landed at the end. Now:
- when kept items stay in their old relative order and all new items come after them (create, append, update, remove), it still does its **single fragment append**, unchanged;
- otherwise it calls `placeNodes` with every item's nodes in key order. **Multi-node items** (e.g. a text node plus an element) move as a unit.

### The benchmark page

[`demos/js-framework-benchmark.html`](../../../../../../demos/js-framework-benchmark.html) now uses `await assignFromAsync(…)`, so its timings cover the render. Before, in Chromium, they stopped before any rows existed. Its swap now really swaps (row 2 becomes id 1000).

### Tests

- **`tests/tree.html`, new "reorder" section:**
  - unchanged order → 0 moves;
  - create 1,000 → at most 2 insertions;
  - swap → right order, ≤ 2 moves;
  - reverse, shuffle, insert + remove → right order;
  - the container's own text stays after the items;
  - a foreign node in the container → still the right order.
- **[`tests/template-list-reorder.html`](../../../../../../tests/template-list-reorder.html) (new), for `manageTemplateList`:**
  - create → one insertion;
  - unchanged → 0 moves, elements kept;
  - swap → really swapped, ≤ 2 moves;
  - reverse, shuffle;
  - an item inserted mid-list lands in place;
  - append → still one insertion;
  - two-node items move as a unit.
- **`tests/benchmark.spec.ts`** now also runs the Tree page with and without `compile`, and prints a 5-column table. It got a 180 s timeout: five pages with Create 10,000 exceed the default 30 s.

### Benchmark after the fixes

The same method as before: 9 samples per page; ms; × vanilla in parentheses. Chromium and Firefox are from one run, WebKit from a confirming rerun.

| Swap rows 1↔998 | Before | **After** | vanilla template |
|---|---|---|---|
| Tree, Chromium | 31.5 | **15.3 (0.34)** | 19.8 |
| Tree, Firefox | 32 | **12 (0.26)** | 21 |
| Tree, WebKit | 296 | **48 (0.13)** | 85 |
| manageTemplateList, Chromium / Firefox / WebKit | no-op | 41.7 / 39 / 191 | |

**Tree now swaps faster than vanilla template cloning in every browser.** `manageTemplateList` now really swaps, at 0.5–0.9× vanilla.

| Other operations, after | Chromium: mTL / Tree / Tree compile | Firefox: mTL / Tree / Tree compile |
|---|---|---|
| Create 1,000 | 29.3 / 24.0 / 23.5 | 31 / 23 / 22 |
| Append 1,000 | 57.5 / 46.7 / 31.2 | 50 / 34 / 28 |
| Update every 10th | 48.6 / 33.0 / 32.2 | 40 / 26 / 23 |
| Clear | 23.6 / 16.4 / 16.4 | 56 / 44 / 42 |
| Create 10,000 | 299.8 / 296.9 / 261.3 | 336 / 259 / 224 |

Vanilla for comparison: Chromium create 1k 22.2 ms and create 10k 259.9 ms; Firefox 22 and 221 ms.

**What the numbers say:**
- **Nothing regressed.** Creates and updates are where they were.
- **One WebKit run** showed Tree's Create 10,000 at 2.2× vanilla. The confirming rerun had it at **1.02×**, with vanilla itself varying 751 → 1,871 ms between runs. WebKit timings on this machine swing a lot from run to run, so only large effects (like the swap) are reliable there.
- **Tree vs. Tree compile** still differs within frame-quantization noise, as before. These rows are binding-heavy.
- **`manageTemplateList` remains the slowest of the five on most operations.** Tree is 1.2–1.4× faster creating 1,000 rows, and 1.0–1.3× creating 10,000.

### Status

Items 1 and 2 are done. **Ready for Step 5** when you are.

## Bruce's Response III

Sorry to keep pushing off step 5, I just want to be thorough.

When I open the various list framework benchmark pages (js-framework-*.html) the headline number now reflects the time to render rows, which is an honest accounting.  We should definitely show that number, as it is important.  But it does tend to swallow what we are in control of.  But can you please:

1.  Apply the css-visibility technique to each of the pages in a uniform way.
2.  If possible, also, additionally show how long it took before telling the browser "here are the rows, now do your thing"?

Please don't run any lengthy timing tests for this ask unless absolutely necessary.

## Claude's Response III

Both are done, uniformly, through one shared module: [`demos/js-framework-benchmark-common.js`](../../../../../../demos/js-framework-benchmark-common.js). All four pages now use it:
- `js-framework-benchmark.html` (`manageTemplateList`);
- `-tree.html`;
- `-vanilla.html`;
- `-vanilla-template.html`.

The two vanilla pages' scripts became modules for the import. It's a hand-written `.js` with no `.ts` source; a `.mjs` wouldn't load, because the dev server serves `.mjs` as `text/html`.

### 1. Content-visibility: a `?cv` checkbox on every page

**One catch:** `content-visibility` **has no effect on native table rows.** It's built on CSS containment, which doesn't apply to internal table boxes (rows, cells). Putting it on the `<tr>`s as they are would silently do nothing.

So with `?cv`, every page applies the same stylesheet:
- `table`, `thead` and `tbody` become `display: block`;
- each `tr` becomes `display: grid` (three columns) with `content-visibility: auto; contain-intrinsic-size: auto 2.1rem`;
- cells become blocks.

The rows look the same, but now they're ordinary boxes, so **rows outside the viewport skip layout and paint.**

The checkbox reloads the page with the flag, keeping other flags; the Tree page's compile checkbox works the same way. So any combination works, e.g. `js-framework-benchmark-tree.html?compile&cv`.

### 2. A second number: "script", the time until the rows are handed to the browser

Every result line now reads:

```
Create 10,000              172.1ms  (10000 rows)  script    80.2ms
```

- **total**, as before: from the click until the next frame has rendered (`requestAnimationFrame` + `setTimeout`). It **includes the browser's style, layout and paint.**
- **script:** until the page's `render()` has finished. The rows are in the DOM, but **no layout or paint has happened yet.** That's the part the library (or the vanilla code) controls.

A note under the buttons explains both. The line format keeps the total and the row count where `tests/benchmark.spec.ts` (and my runner) parse them. That spec still passes.

### A quick smoke test (no timing runs, as you asked)

One Create 10,000 followed by one Swap, per page and mode, Chromium only: **single samples, so indicative only.**

| Page | Create 10k, total → with `?cv` | Create 10k, script | Swap, total → with `?cv` |
|---|---|---|---|
| vanilla | 290 → 118 | 27–30 | 316 → 104 |
| vanilla template | 351 → 127 | 49–81 | 119 → 20 |
| manageTemplateList | 423 → 193 | 88–154 | 226 → 103 |
| Tree | 343 → 172 | 80 | 68 → 71 |
| Tree compile | 321 → 187 | 66 | 66 → 82 |

**What it suggests** (to be confirmed by a proper run, if you want one):
- **`?cv` roughly halves (or better) the totals,** because the browser only lays out the rows near the viewport. The script part doesn't change, as expected.
- **The script numbers separate what we control:**
  - Tree ~80 ms vs. `manageTemplateList` ~90–150 ms for 10,000 rows;
  - Tree compile ~66 ms;
  - the vanilla template page ~50–80 ms. Its `render()` awaits once per row, which costs it.
  - Vanilla `createElement` ~30 ms is the floor in Chromium, which has a fast `createElement` (as seen in Step 4).
- **Even with `?cv`, a large share of the total is the browser's work**, not ours: e.g. Tree 172 ms total vs. 80 ms script.

### Status

Done. Step 5 is next, when you're ready.

## Bruce's Response IV

Can you please remove the repeated awaits per row for the vanilla template page?

## Claude's Response IV

Done. In [`demos/js-framework-benchmark-vanilla-template.html`](../../../../../../demos/js-framework-benchmark-vanilla-template.html), `createRow` and `render` are now plain synchronous functions, so there's no `await` per row.

**Smoke check** (single samples, Chromium): Create 10,000 script time is **48–62 ms**, from 49–81 ms; total 329 ms (130 ms with `?cv`). Swap is 114 ms (20 ms with `?cv`). Rows and both modes work.

**The page is still slower than the `createElement` page** (~30 ms script). One likely reason, which I haven't changed: its `<template id="row-tpl">` is written with indentation, so **every cloned row also copies ~6 whitespace text nodes**: 4 between the cells inside the `<tr>`, plus 2 around it in the cloned fragment. The `createElement` page and Tree's templates have none. Writing the template on one line (`<tr><td></td><td></td><td><button class="remove">×</button></td></tr>`) would make it a fairer floor. **Shall I?**

## Bruce's Response V

Yes, please.

## Claude's Response V

Done. `<template id="row-tpl">` is now on one line (`<tr><td></td><td></td><td><button class="remove">×</button></td></tr>`), so a cloned row copies no whitespace text nodes.

**Smoke check** (single samples, Chromium): rows, swap and both modes work. Create 10,000 script time was **42 ms with `?cv` and 73 ms without**; earlier single samples were 48–62 ms. That's **no clear change**: at one sample, the noise is larger than the effect. So I can't confirm that the whitespace explained the gap to the `createElement` page (~30 ms, also single samples). Step 4's isolated runs found Chromium's `createElement` to be about as fast as cloning, so the two pages may simply be close, with single samples scattering around that.

A proper run (the 9-sample, fresh-page method) would settle it in about 25 minutes. I haven't run it, per your request. **Let me know if you want it.**

## Bruce's Response VI

Can you please update the [manage template list](../../../../../../docs/manage-template-list.md) with up-to-date information about timing, and also mention that the tree handler can seemingly handle everything that the manage template list can do, and seemingly faster? Should we investigate optimizing manage template list to match? 

There is one [external package](https://github.com/bahrus/three-peat) that I maintain that relies on manage template list.  But I do wonder if you see benefits to continuing to support manage template list, especially after doing step 5?  Should we deprecate and then remove manage template list?  Or do you see

## Claude's Response VI

(Your message seems to end mid-sentence, at "Or do you see". I've answered what's there; tell me if there was more.)

### `docs/manage-template-list.md` is updated

- **Benchmark section, rewritten.** The old numbers were artifacts of the timing bug, e.g. "Create 10,000: 13.3 ms, 23× faster than vanilla". So was the faster-than-Solid/Svelte/Lit table built on them. The section now:
  - says plainly that those numbers were wrong, and why;
  - gives the current Chromium and Firefox results next to Tree and both vanilla pages;
  - explains the **total** vs. **script** split and the `?cv` option.
- **Reconciliation:** documents the new reordering (minimal moves; append is still one insertion).
- **Await:** a note to use `assignFromAsync`, since the handler is async. The doc's own two examples used `assignFrom`, the same pattern that broke the benchmark page; they now use `assignFromAsync`.
- **New section, "manageTemplateList and builtIns.tree".** It says when to use which.
- **Link fix:** the benchmark link pointed to a `nicholaskajoh/js-framework-benchmark` fork; it now points to the canonical `krausest/js-framework-benchmark`. The demo pages still have the old link; I can change them too.

### "Tree can seemingly handle everything manageTemplateList can do": not quite

**For lists defined in JavaScript, yes:** Tree covers them, and is faster on these benchmarks. But `manageTemplateList` has a different starting point, and some features Tree lacks.

**Its starting point is existing HTML.** It clones a `<template>` (or fragment) authored in the page, and three-peat even derives that template from the first child of server-rendered markup. Tree has no "here's my HTML" mode; its markup comes from a JavaScript spec. **That's what three-peat relies on**, and it's HTML-first by design.

**Features with no Tree equivalent:**
- `infer` / `itemprop` distribution (which three-peat's examples lean on);
- hiding removed items (`forget: false`);
- `method: 'prepend' | 'after'`;
- multi-element items (`configs`);
- `fromHost`;
- `waitForSettled`;
- `yieldEvery`.

### Should we optimize manageTemplateList to match?

**Probably worth a short, bounded pass, after profiling.** Where its time goes:
- **Totals are close to vanilla.** The gap shows in **script time**: ~90–150 ms for 10,000 rows vs. Tree's ~80 ms (single samples).
- **The likely cost is per item.** Each clone goes through the general `assignFrom` path. That means `categorizeKeys`, option-object spreads (`{ from: item, fromStack, pipes, ...withOptions }`) and, on this page, `pin` resolution, all per row.
- **Tree's fix for the same problem applies here.** Tree solved it with its fast path: patterns of plain keys and `?.` paths compiled once per pattern object and applied directly. The same idea should transfer to `toClone`. That's mostly reuse, not new design.

### Deprecate and remove?

**My recommendation: don't remove it. Converge the engines instead, and decide about the API later.**

1. **They already share code.** The reordering is now one routine (`utils/placeNodes.ts`). The remaining duplication is keyed reconciliation and per-item binding, and that can be shared the same way.
2. **Step 5 points toward Tree adopting existing templates.** Step 5 has Tree read `<template>`s emitted by a server; Step 6 adopts server-rendered instances. A natural extension is **"Tree from an existing template plus a binding map"**: compile the plan from HTML instead of a spec. That's exactly `manageTemplateList`'s model. Once that exists, `manageTemplateList` can become a **thin adapter**: its config API and features (three-peat keeps working) on top of Tree's repeat engine.
3. **Then deprecation is a choice, not a migration.** If three-peat moves to the template mode, `manageTemplateList` can be deprecated with a clear replacement. If not, the adapter costs little to keep.
4. **Removing it now** would leave three-peat, and HTML-first authoring in general, without a supported path.

### Questions for you

1. **A bounded optimization pass on `manageTemplateList` now** (profile, then a `toClone` fast path), or after Step 5?
2. **Is the convergence direction OK?** That means adding a "Tree from an existing template" idea to the roadmap (after Step 5 / 6), with `manageTemplateList` becoming an adapter over it.
3. **Update the demo pages' benchmark links** to `krausest/js-framework-benchmark` too? 


