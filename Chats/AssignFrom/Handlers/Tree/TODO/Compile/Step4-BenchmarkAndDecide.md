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
