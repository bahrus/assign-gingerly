# `microJoin`: a Sync ` =&` Op That Emits Semantic Elements

## Background

From the compile roadmap ([Step 2](../Handlers/Tree/TODO/Compile/Step2-CompileTree.md)): `join` produces one string, so a compiled Tree can't bake its static parts as cheaply as plain text. **`microJoin`** produces mixed content instead:
- **static text** (bakeable into a template);
- **one element per dynamic value** (`<span itemprop>`, `<data value>`, `<time datetime>`).

Those elements are **locatable by element path**, so they fit the compiled walk with no text-node handling. The output is also **semantic and search-engine friendly**, which brings back some of the microdata that Tree set aside.

**Precedent:** `builtIns.microDataJoin` already does this as an **async ` =>` handler** (with comment markers), using `{ prop, val, format }` segments and a type → element mapping (`createElementForValue`, `formatValue`). `microJoin` would be its **sync ` =&` counterpart**, following the same move `join` made (handler → sync op), and could eventually supersede it.

## Proposed spec (draft)

```js
assignFrom(p, {
    '?. =&': {
        microJoin: ['Launched ', { prop: 'date', val: '?.date_utc' }, ' by ', { prop: 'name', val: '?.name' }],
    },
}, { from: vm });
// <p>Launched <time itemprop="date" datetime="2026-03-14T15:09:26.000Z">Mar 14, 2026</time> by <span itemprop="name">Demo 7</span></p>
```

- **Segments:** strings → text; `{ prop, val, format? }` → an element, chosen by the resolved value's type (as in `microDataJoin`): string → `span`, number → `data`, boolean → `data`, `Date` / ISO string → `time`; nullish → omitted. Nested arrays → all-or-nothing optional groups (as in `join`).
- **What an op returns:** a sync op returns a value that's assigned to the LHS, but `microJoin` needs to **render into the element.** Two options:
  - **(a)** the op returns a `DocumentFragment` and the LHS is the element itself (`'?. =&'`), with ` =&` treating a fragment result as "replace children";
  - **(b)** a small special case: `microJoin` writes into the LHS element directly.

  **Decide in the implementation doc.** (a) keeps ops pure-ish, but needs fragment handling in ` =&`.
- **Rebinding:** on later calls, the same structure → update the existing elements in place (keyed by position / `prop`) rather than recreating. Without comment markers: the op owns the element's whole content, as `join` does.
- **Tree / compiled:** in a compiled Tree, static text and element shells are baked; dynamic elements are located by path, and their text / `value` / `datetime` set per instance.

## Plan

1. **Implement** `microJoin` in `syncOps/` (registered in `SYNC_OPS`), sharing the type → element mapping with `handlers/microDataJoin.ts` (extract it into a shared module).
2. **Tests:** segments of each type; optional groups; rebind in place (the same elements updated); nullish values; use inside Tree patterns.
3. **Benchmark:** add a **B6** group to `demos/compile-benchmark.html`, for the same line rendered as:

   | Variant | |
   |---|---|
   | (i) `join` | `textContent` |
   | (ii) `microJoin` | runtime (create + rebind) |
   | (iii) `microJoin` with baked static text / element shells | simulating the compiled path |

   Build-only and with layout, in Chromium, Firefox and WebKit. **The question:** what does the semantic output cost per line, and how much does baking recover?
4. **Docs:** `docs/sync-ops.md` (a new op section), and a note in `docs/tree.md`.

## Open questions

1. **How the op applies its result:** (a) fragment-returning or (b) writes into the element? See above.
2. **Formatting:** reuse `microDataJoin`'s `format` option, and/or allow **pipes** in `val` (e.g. `'?.date_utc?.parseDate?.longUtc'`, which already works in paths)? Pipes probably cover most needs.
3. **Long term:** deprecate `builtIns.microDataJoin` once `microJoin` covers it?

## Status

Not started. To be done (implemented and benchmarked) before resuming Step 2.
