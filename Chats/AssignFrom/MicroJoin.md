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

Implemented and benchmarked. See the implementation notes below.

## Bruce's Response

> 1. **How the op applies its result:**

I'm afraid I don't know the right answer here.  Maybe b?

> 2.  **How the op applies its result:**

I only see in the documentation that we use toLocale(), which I think we should do by default.  Do we support custom formatting already?  Any reason not to carry over that support.  I agree pipes is an elegant way, we should definitely support that.

> 3. **Long term:** deprecate `builtIns.microDataJoin` once `microJoin` covers it?

Yes, we should remove the async handler, also join as well.

## Claude's Implementation Notes

`microJoin` is implemented as a sync ` =&` op; the async `builtIns.microDataJoin` handler is **removed**; and it's benchmarked.

### Your answers, as implemented

1. **How the result is applied: (b), with a small generalization.** The ` =&` dispatcher now resolves the LHS *first* and calls every op as `op(args, extra, { lhsTarget })`. **Value ops** (`join`) ignore the context and return a value, which is assigned as before. **Rendering ops** (`microJoin`) write into `lhsTarget` and return `undefined`. A new `SyncOpContext` type lives in `types.d.ts`, and the `SyncOp` signature in `syncOps/registry.ts` gained the third argument. It's backward-compatible, because `join`'s `(args, extra)` signature still works.
2. **Formatting.** There was **no custom formatting** in `microDataJoin`: its `TemplateSegment` declared a `format` field, but nothing ever read it. What it had were the locale defaults (`Date` → `toLocaleDateString()`, number → `toLocaleString()`), which `microJoin` keeps. For custom formatting, I added an optional **`text`** to each segment: it overrides the display text, while **`val` still decides the element and its machine-readable attribute** (`datetime`, `value`). `text` resolves like any value, so **pipes** work naturally:

   ```js
   { prop: 'launched', val: '?.date_utc?.toDate', text: '?.date_utc?.parseDate?.longUtc' }
   // <time itemprop="launched" datetime="2026-03-14T15:09:26.000Z">March 14, 2026 at 3:09 PM</time>
   ```

   A plain pipe on `val` would turn a `Date` / number into a string (and so a `<span>`), losing the machine-readable attribute, which is why `text` is separate. The `md` tag's docs now show `text` instead of the dead `format`.
3. **Removal.**
   - **`microDataJoin` is gone:** `handlers/microDataJoin.ts` / `.js`, its `BUILT_IN_MAP` entry, the `🏷️` emoji alias, and the `package.json` export. That export is replaced by `./syncOps/microJoin.js`. The README section is rewritten for `microJoin`, and every other mention (README, `docs/paths-dx.md`, `DX/paths.ts`, `markerUtils.ts`) is updated.
   - **The async `builtIns.join` handler was already removed earlier,** when `join` moved to the ` =&` operator. Nothing of it is left in code (only a historical note in `DX/emojis.ts` / `processHandlerCommands.ts`).
   - **Clarification needed:** if by "join as well" you meant **removing the ` =&` `join` op itself**, I'd advise keeping it. It's the fastest way to produce plain text (see the benchmarks below), and `microJoin` is roughly 3–5× its cost. Let me know if you meant something else.

### Behavior (`syncOps/microJoin.ts`)

- **Type → element mapping** (carried over): `Date` → `<time datetime>`, number → `<data value>`, boolean → `<data value>` with no text, anything else → `<span>`. Every element gets `itemprop=prop`.
- **Nullish values:** top-level nullish items, and segments with a nullish `val`, are **omitted**. The old handler rendered an empty `<span>` for a top-level nullish segment; omitting matches `join`. A **nested sub-array is all-or-nothing:** it's dropped if any item in it is nullish or has a nullish `val`.
- **No comment markers:** the op owns the element's whole content.
  - **Same structure** (the same sequence of text and `tag` + `itemprop` elements): text nodes, element text, `value` and `datetime` are updated **in place**.
  - **Changed structure** (an optional group toggling, or a value changing type): it re-renders.
- **`itemscope`:** the element gets an empty `itemscope` if it has none (carried over).
- **A non-element LHS throws.**
- **Performance:** default-locale formatting uses **cached `Intl.NumberFormat` / `Intl.DateTimeFormat` instances** (same output as `toLocale*()`). Chromium builds a new formatter on every `toLocale*` call, and caching **halved runtime `microJoin` in Chromium** (create 1k: 12.8 → 6.3 ms; 10k: 109 → 55 ms).

### Tests: a new `tests/micro-join.html` (+ spec), 8 scenarios, 28 assertions

1. Type mapping, `itemscope`, text nodes
2. `text` override through pipes (with `val` still a `Date` → `<time>`)
3. Nullish and optional groups
4. Same-structure updates in place (element identity, text, `value`, `datetime`)
5. Structure changes re-render (a group appears; a type changes)
6. LHS forms (`'?.querySelector?.p =&'`, `'?. =&'`, bare `' =&'`); a non-element LHS throws
7. `assignFromAsync`, and inside a **Tree** pattern (rebinding in place)
8. `join` (a value op) unchanged

**Results:** 28 / 28 in Chromium, Firefox and WebKit. **Full suite: 130 passed, 2 skipped, 0 failed.** `tsc` is clean, in a scratch copy; no `.js` touched.

### Benchmark (B6): [`demos/microjoin-benchmark.html`](../../../demos/microjoin-benchmark.html)

The line is `'Core ', {serial}, ', flight ', {flight: number}, '; landing: ', {landing}`. Ratios are vs. the plain-string baseline of each group.

| | Chromium\* | Firefox | WebKit |
|---|---|---|---|
| **Runtime:** `microJoin` ÷ `join` (both through `assignFrom`), create 1k / 10k | 3.7× / 4.5× | 4.0× / 4.1× | 4.5× / 5.0× |
| Runtime, rebind 1k / 10k | 3.5× / 3.6× | 4.0× / 3.2× | 3.0× / 3.2× |
| Runtime, with layout (create / rebind 1k) | 1.8× / 2.3× | 1.8× / 2.6× | 2.1× / 1.8× |
| **Compiled-style:** baked `microJoin` shells ÷ one `textContent` string, create 1k / 10k | 1.2× / 1.2× | 3.0× / 3.0× | 1.5× / 2.3× |
| Compiled-style, rebind 1k / 10k | 1.2× / 1.3× | 1.5× / 2.5× | 1.7× / 2.4× |

\* After the formatter caching. Chromium's raw-DOM baselines were noisy in this run, but its ratios held.

### What this means

- **Semantic output has a real but bounded cost.** At runtime, `microJoin` is **~3.5–5×** a `join` (plus ~1.8–2.6× once layout is included). Per line, that's ~5–9 µs, vs. ~2 µs for `join`.
- **Baking (compiled Tree, Step 2) recovers most of the runtime overhead.** Baked shells cost **~1.2–3×** a plain string, with Chromium at the low end (~1.2×). That's the price of 3 extra elements per line, not of the op machinery.
- **Guidance for the docs** (already in `docs/sync-ops.md`): use `join` when you only need text, and `microJoin` when you want the markup (search engines, microdata consumers, styling individual values).
- **For Step 2:** `microJoin`'s static text and element shells are bakeable, with the elements located by element path (no text-node handling), as designed.

### Status

Done. Next on the roadmap: **back to Step 2** (`compileTree`). 

## Bruce's Response II

Maybe it already does this, but can we make microJoin "backwards compatible" with join, so that:

```JS
assignFrom(oElement, {
    '?.textContent =&': { microJoin: ['?.lastName', ', ', '?.firstName'] }
}, { from: { lastName: 'Targaryen', firstName: 'Helaena' } });
```

would still create spans, data, time elements, just no itemprop attribute?

Does this introduce any ambiguities?

## Claude's Response II

It didn't do this before (bare strings were all text), but it does now. Your example produces:

```html
<div><span>Targaryen</span>, <span>Helaena</span></div>
```

### Behavior

- **A reference string becomes an element, without `itemprop`.** That covers `'?.name'`, `'$root?.x'` / `'$parent?.x'` / `'$0'`, `'!?.x'` / `'!!?.x'`, and registered protocols. The element follows the same type mapping as segments: a string gives `<span>`, a number gives `<data value>`, a boolean (e.g. `'!!?.flag'`) gives `<data value>`, and a `Date` gives `<time datetime>`.
- **Literal strings stay text.** `{ prop, val, text? }` segments still get `itemprop`, and the two forms mix freely in one array.
- **`itemscope` is only added when at least one segment has a `prop`.** A purely join-style array leaves the element's attributes alone.
- **Nullish values and optional groups** behave as before (and as in `join`).
- **In-place updates:** the "same structure" check now also compares the presence or absence of `itemprop`, so a join-style rebind updates the existing spans in place.

### Does this introduce any ambiguities?

There's one real ambiguity, plus a few smaller points.

1. **Literal or reference? This was the real one, and it's resolved by looking at the config, not the values.** By the time an op runs, `'?.firstName'` has already resolved to `'Helaena'`, which looks exactly like the literal `', '`.
   - So the ` =&` dispatcher now also passes the op the **unresolved** array (`ctx.rawArgs`) and the protocol handlers. `microJoin` walks the raw and resolved arrays together and asks the resolver's own test (a new `isReferenceString` in `resolve/getValues.ts`): "was this a reference?"
   - There's no guessing from content, so a value like `'?.oops'` coming *from the data* is still just text.
2. **A literal that starts with `?.` (or `$root`, or a protocol prefix) is always a reference.** That's the same rule as `join` and every other RHS, so nothing new. You can't write the literal text "?.foo" in either op without a pipe or a segment.
3. **`'?.textContent =&'` means "render into the element".** For `join`, that LHS assigns a string to `textContent`. For `microJoin`, it would make no sense to assign `undefined`, so I treat an LHS ending in `textContent` on an element as that element. `'?. =&'` still works.
   - This is a small special case, but it's what makes a `join` → `microJoin` swap a one-word change.
   - Any other non-element LHS still throws.
4. **Calling the op directly** (not through ` =&`) has no raw args, so every string is treated as a literal. That's safe (no accidental elements), and it's documented.
5. **The element type follows the value type.** If `'?.age'` flips between a number and a string, the element flips between `<data>` and `<span>`, which forces a re-render instead of an in-place update. That's correct behavior, just not free.
6. **Cost:** a `join` array switched to `microJoin` gains one element per reference, so the earlier B6 cost ratios (~3.5–5× `join` at runtime) apply. `join` remains the choice when you only want text.

### Changes

- **`resolve/getValues.ts`:** new exported `isReferenceString(value, protocols)`. It is `looksLikeReference` plus `!` / `!!` negation.
- **`types.d.ts`:** `SyncOpContext` gains:
  - `lhsParent` / `lhsKey` (the object and key the LHS path ends at);
  - `rawArgs` (the op's unresolved arguments);
  - `protocols`.
- **`assignFrom.ts`:** the ` =&` dispatcher passes the fuller context. `join` ignores it.
- **`syncOps/microJoin.ts`:**
  - flattens the raw and resolved arrays in parallel;
  - reference strings become `{ val }` items, so `itemprop` is only set when there's a `prop`;
  - adds `textContent` LHS targeting;
  - makes `itemscope` conditional.
- **Tests:** Test 9 in `tests/micro-join.html` covers your example, a number, a negated boolean, a dropped optional group, no `itemprop` / `itemscope`, rebinding in place, and mixing with segments. **37 / 37** pass in Chromium, Firefox and WebKit. **Full suite: 130 passed, 2 skipped, 0 failed.** `tsc` is clean, in the scratch copy; no `.js` touched.
- **Docs:** updated the `microJoin` sections of `docs/sync-ops.md` and the README.
