# Famous Performance Test

---

## Human Ask

There's a "famous" performance test suite that I used to always see frameworks / libraries use to show how their performance for keyed / nonkeyed looping compare.

Do you know which test I'm talking about?  If so, I want to see if it is feasible to add that test to this package just to test the ManageTemplateList handler.

---

## Response

### Yes — JS Framework Benchmark

You're thinking of [**js-framework-benchmark**](https://github.com/nicholaskajoh/js-framework-benchmark) by Stefan Krause (originally, now maintained by the community). It's the standard comparison that Solid, Lit, Svelte, React, Vue, etc. all use to show their list-rendering performance.

The benchmark tests a table with 1,000 / 10,000 rows and measures:

| Operation | What it tests |
|-----------|--------------|
| Create 1,000 rows | Initial render speed |
| Replace all 1,000 rows | Full re-render (new data) |
| Partial update | Update every 10th row |
| Select row | Highlight one row |
| Swap rows | Swap two specific rows |
| Remove row | Delete one row from the middle |
| Create 10,000 rows | Stress test |
| Append 1,000 rows | Add to existing list |
| Clear all rows | Remove everything |

### Is It Feasible?

Yes — the benchmark is framework-agnostic. Each framework provides an implementation that:
1. Renders a `<table>` with `<tr>` rows from an array of `{ id, label }` objects
2. Responds to button clicks for each operation (create, update, swap, delete, etc.)
3. Uses keyed rendering for the "keyed" variant

For `manageTemplateList`, the implementation would be:

```html
<template id="row-template">
    <tr>
        <td itemprop="id" class="col-md-1"></td>
        <td itemprop="label" class="col-md-4"><a></a></td>
        <td class="col-md-1"><a><span class="glyphicon glyphicon-remove"></span></a></td>
        <td class="col-md-6"></td>
    </tr>
</template>
```

```js
async function run() {
    await assignFrom(tbody, {
        '?. =>': {
            do: 'builtIns.manageTemplateList',
            resolve: {
                forEach: '?.data',
                instantiate: 'globalThis://row-template',
            },
            fromEachItem: {
                assignToFragment: { /* ... */ },
                withOptions: { inferredAssignments: { byItemprop: true } },
                resolve: { key: '?.id' }
            }
        }
    }, { from: state });
}
```

### What You'd Get

- A concrete performance baseline for `manageTemplateList`
- Comparison point against vanilla JS, Lit `repeat`, Solid `<For>`, etc.
- Proof that the keyed reconciliation works correctly under stress
- Visibility into whether `waitForSettled`, fragment buffering, etc. are actually faster

### Practical Approach

Rather than integrating into the official benchmark runner (which has a complex build system), I'd suggest:

1. Create a standalone `demos/js-framework-benchmark.html` page that implements the standard operations
2. Use the same data generation (random adjective + noun labels, incrementing IDs)
3. Measure with `performance.now()` and display results in the page
4. Optionally add a Playwright test that runs the operations and reports timing

This gives you the comparison data without the overhead of integrating into their framework.

### Want Me To

- Create the benchmark demo page?
- Create it as a Playwright test that reports timing?
- Both?

---

## Human Response I

If we followed this approach, would I be able to compare apples with apples, as far as performance metrics?

---

## Response to Human Response I

### Short Answer: Approximately, But Not Exactly

The official js-framework-benchmark uses a specific measurement methodology:

1. **Chrome DevTools Performance tracing** via Selenium/Playwright — measures from button click to paint completion (includes layout, paint, compositing)
2. **Controlled environment** — headless Chrome, specific hardware, multiple warmup runs, statistical averaging
3. **Standardized DOM structure** — exact same HTML (Bootstrap-based table), same number of columns, same CSS

A standalone demo page with `performance.now()` measures **JavaScript execution time only** — it doesn't capture layout/paint costs, which are often the dominant factor for large table updates.

### To Get True Apples-to-Apples

You'd need to either:

**Option A: Integrate into the official benchmark**

The [js-framework-benchmark repo](https://github.com/nicholaskajoh/js-framework-benchmark) supports adding new frameworks. You'd:
1. Create a `frameworks/keyed/assign-gingerly/` directory
2. Implement their standard `index.html` + `src/main.js` using `manageTemplateList`
3. Run their benchmark runner (uses Playwright + Chrome tracing)
4. Get results directly comparable to every other framework on the leaderboard

This gives *exact* apples-to-apples. The downside: their build system is complex (Docker, specific Node versions, coordination scripts). But once set up, you get official-grade numbers.

**Option B: Replicate their measurement approach locally**

Use Playwright to:
1. Click a button
2. Wait for `requestAnimationFrame` + `setTimeout(0)` (their "flush" strategy)
3. Measure total elapsed time from click to idle

This approximates their methodology without their full infrastructure. Not identical (no Chrome DevTools tracing for paint metrics), but close enough for directional comparison with published results.

### My Recommendation

**Start with Option B** — a Playwright test in this repo that:
- Uses the same data generation (1000 rows, adjective + noun labels)
- Uses the same DOM structure (Bootstrap table)
- Measures click-to-idle for each operation
- Reports timing results

This gives you:
- Quick feedback on `manageTemplateList` performance
- Directional comparison with published numbers (vanilla JS is ~30-50ms for 1000 rows on modern hardware)
- A test you can run anytime without external infrastructure

If the numbers look competitive and you want official comparison, *then* submit to the official benchmark.

### What "Competitive" Looks Like

From recent js-framework-benchmark results (Chrome, desktop):

| Operation (1000 rows) | Vanilla JS | Solid | Lit | Svelte |
|----------------------|-----------|-------|-----|--------|
| Create | ~40ms | ~45ms | ~55ms | ~50ms |
| Replace all | ~45ms | ~48ms | ~60ms | ~55ms |
| Partial update | ~15ms | ~18ms | ~25ms | ~20ms |
| Swap rows | ~15ms | ~18ms | ~20ms | ~18ms |
| Remove row | ~15ms | ~16ms | ~18ms | ~17ms |

(Approximate — actual numbers vary by hardware and benchmark version.)

`manageTemplateList` should target vanilla JS territory since it does minimal abstraction over direct DOM manipulation. The main overhead is the `assignFrom` pipeline (resolveValues, inferredAssignments) — which is where optimization matters.

### Want Me To Build Option B?

