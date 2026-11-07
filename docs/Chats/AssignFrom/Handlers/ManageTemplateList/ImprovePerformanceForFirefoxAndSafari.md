# Improve Performance for Firefox and Safari

---

## Human Ask

[The benchmark test for managedTemplateList handler](/tests/benchmark.spec.ts) looks great for Chrome, but not so great for Firefox and Safari, compared to vanilla code.

The numbers do seem unrealistically too good for Chrome, but at least it seems the library is pretty fast on that browser.

So what gives for the other browsers?

Don't burn through too many tokens on this question, but what seems to be the most likely explanation?

---

## Findings / Analysis

### What the MTL path does per row (that vanilla doesn't)

Tracing `demos/js-framework-benchmark.html` → `handlers/manageTemplateList.ts` → `assignFrom.ts` → `resolveIdRef.ts`, each row in a Create/Append/Update op pays for:

1. **Full pattern machinery per row** — `assignFrom` runs `expandSubstitutions`, `categorizeKeys`, `getValues`, `assignGingerly` for every one of the 1,000/10,000 rows. Path *strings* are cached (`parseCachedPath`), but the object/key processing is not.
2. **Pin resolution per cell** (`resolveIdRef.ts:71-108`) — for `#[a]`/`#[b]`: `getRootNode()`, child-path walk, `el.matches('.a')` / `el.matches('.b')` (selector-engine call), and an auto-generated `el.id = '-ag:N'` attribute write. That's 2 `matches()` + 2 `id` writes per row → 20,000 of each on Create 10,000.
3. **Update ops re-process every row** — keyed reconciliation updates *all* existing rows in place (`manageTemplateList.ts:174-207`), so "Update every 10th" runs the full per-row pipeline 1,000 times, while vanilla touches only `row.cells[1].textContent` directly.
4. **Row removal is one-by-one** — with `forget: true`, removals are individual `removeChild` calls (`manageTemplateList.ts:155`), vs `tbody.textContent = ''` in the vanilla versions. This affects Clear and the create-after-clear ops.

### Most likely explanations, ranked

1. **JS↔DOM binding cost of the per-row micro-operations.** The hot loop crosses into the DOM engine thousands of times (`matches()`, `id` writes, `textContent` writes, `cloneNode`). Blink's bindings and selector engine are the fastest of the three for exactly this shape of workload; SpiderMonkey (Firefox) and JSC (Safari) are measurably slower at string-heavy, call-dense hot loops and at DOM-API micro-calls. Vanilla barely crosses the boundary per row, so its numbers stay flat across browsers while MTL's overhead scales with engine speed. This is the best fit for "ratio is fine on Chrome, bad elsewhere."

2. **Gecko/WebKit table layout.** Large auto-layout tables are a known slow spot in both engines vs Blink. This inflates *both* vanilla and MTL absolute numbers (so it doesn't explain a worse ratio by itself), but it widens the absolute gap and makes every measurement noisier.

3. **Headless measurement artifacts.** The timed region ends on `requestAnimationFrame` + `setTimeout(0)`. Headless Chromium fires rAF under BeginFrame control (essentially immediately, no vsync), which likely explains the "unrealistically good" Chrome numbers — layout/paint may not be fully accounted. Headless Firefox throttles rAF toward vsync (~16.7ms constant added per op), inflating every op and hitting the small ops (Update, Swap, Clear) hardest in *relative* terms.

4. **Async overhead.** `assignFrom` dispatches the handler fire-and-forget via `import('./processHandlerCommands.js')` (`assignFrom.ts:513-517`), so the measured window includes extra microtask/module-resolution hops. Minor after warmup, but SpiderMonkey/JSC async-machinery is slower than V8's.

### Suggested cheap experiments (before optimizing)

- **Comment out `expect` in the pin config** (drop the `matches()` calls) and re-run Firefox — isolates hypothesis 1's selector cost.
- **Replace pin with direct `?.cells?.0?.textContent` paths** (the commented-out variant in the demo) — removes pin resolution entirely; if Firefox parity is restored, pin is the culprit.
- **Replace per-node `removeChild` with range-based removal** between markers — tests hypothesis on Clear/Create.
- **Measure without rAF** (stop timer right after `await render()`) to quantify the headless-rAF artifact per browser.

### Notes

- "Swap rows" is nearly free in MTL today: existing keys are updated in place and the DOM is never reordered (`manageTemplateList.ts` only inserts *new* clones), so that row of the table isn't evidence of anything.
- WeakRef caching (a known JSC slow spot) is *not* on this path — pin `{path}` form assigns IDs but skips the WeakRef cache.