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
