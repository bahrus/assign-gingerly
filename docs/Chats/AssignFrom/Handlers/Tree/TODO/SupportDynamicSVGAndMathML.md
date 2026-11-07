# Support Dynamic SVG and MathML

## Bruce's Ask

It was pointed out that the tree handler doesn't support dynamic SVG (and MathML):

> **And one gap matters for your SVG example: Tree can't render SVG today.** It creates elements with `document.createElement(tag)`. In an HTML document, that makes `<circle>` an unknown *HTML* element, not an SVG one, so nothing draws. Neither `tree.ts` nor `compileTree.ts` has any `createElementNS`. So SVG isn't only a static-blob example; it's currently unsupported. A static blob parsed as HTML would fix it for static SVG, because the HTML parser puts `<svg>` content in the SVG namespace.

It does now support blobs of these, but not dynamic content, as I understand it.

Please describe any decisions that need to be made first to support this.


## Claude's Answer

Right: **snippets cover static SVG and MathML** (the browser's parser builds them), but **elements Tree creates** are always HTML elements. `document.createElement('circle')` makes an `HTMLUnknownElement`, which draws nothing. That applies everywhere Tree creates elements: map values, children, repeat items, switch cases, and children Tree creates inside a snippet's SVG hole.

**One constraint shapes the answers below: parity with the HTML parser.** o2h's output, and any server or snippet markup, goes through the browser's HTML parser. Whatever Tree builds has to be the DOM the parser would build from the same markup. Otherwise `adopt` mismatches, and o2h's equivalence with Tree breaks.

### Decisions

**1. How Tree knows the namespace: inferred, as the parser does it, or declared?**

- **Inferred (my recommendation):** follow the parser's rules.
  - `<svg>` starts the SVG namespace, and `<math>` starts MathML;
  - children inherit their parent's namespace;
  - **integration points** switch back to HTML for their children: SVG's `foreignObject`, `desc` and `title`; MathML's `annotation-xml` (with an HTML `encoding`), plus `mi`, `mo`, `mn`, `ms` and `mtext` for elements other than `mglyph` / `malignmark`.

  Authors then write SVG as they would in HTML, and Tree's DOM matches the parser's.
- **Declared:** a header field, e.g. `{ tag: 'circle', ns: 'svg' }`. It's explicit, but noisy, and easy to get out of step with what the parser would do.
- **Possibly both:** inference, plus a reserved `ns` header field for the rare case it gets wrong. I'd add the field only if a real case shows up.

**2. Where the namespace context starts: from the container.**

A tree's top-level elements, a repeat's items, a nested tree, and a hole's children are created inside an existing element. Their namespace comes from that element, by the same rules: a tree rendered into an `<svg>` (or a `<g>` hole in an SVG snippet) creates SVG children, while one rendered into a `foreignObject` or a `div` creates HTML. A `ShadowRoot` or other fragment target means HTML.

This makes "a static SVG snippet with a dynamic `<g>` hole" just work, which is probably the most common dynamic SVG case: a chart frame with bars or points inside.

**3. Tag name case: `linearGradient`, `foreignObject`, `clipPath`, `feGaussianBlur`.**

SVG element names are case-sensitive. The HTML parser corrects lowercase spellings with a fixed table (`lineargradient` → `linearGradient`).
- **Option:** require the correct case in the notation and in `` tree`…` ``.
- **Recommendation:** apply the parser's table, so both spellings work, as they do in HTML. That needs a small table (about 40 SVG names), and tag comparisons in `syncNode` / `adopt` would use the adjusted name.
- **Also check:** `` tree`…` `` must keep tag case as written. It does: its parser keeps tag names as written, and lowercases only to check for void elements.

**4. Attribute name case: `viewBox`, `preserveAspectRatio`, `stdDeviation`.**

- **At runtime:** `setAttribute('viewBox', …)` on a real SVG element keeps the case, so the runtime path (` :=`) is fine once elements are real SVG elements.
- **`compile`:** this needs a fix. compileTree **lowercases baked attribute names** (`compileTree.ts`, `bakeKey`), so `viewBox` would be baked as `viewbox`, which an SVG element doesn't recognize. It should keep the case (or apply the parser's attribute table) for non-HTML elements.
- **o2h:** fine as is. It lowercases attribute names, but the browser's parser restores SVG's case from its own table.

**5. Namespaced attributes: `xlink:href`, `xml:lang`.**

These need `setAttributeNS`. SVG 2 has plain `href`, which works with `setAttribute`.
- **Recommendation:** document plain `href`, and map `xlink:href` / `xml:*` / `xmlns:*` to `setAttributeNS` (a short table). Or refuse them, with a message pointing to `href`.

**6. Properties: SVG's are mostly animated objects, not values.**

Tree patterns set **properties** by default. On SVG elements, many properties aren't plain values:
- `circle.r` is an `SVGAnimatedLength`, so `{ r: 5 }` does nothing useful.
- `className` is an `SVGAnimatedString` **without a setter**, so `{ className: 'bar' }` throws a TypeError in strict-mode code, which Tree's is.

The options:
- **Guidance only:** use ` :=` (attributes) in SVG and MathML. `` tree`…` `` already turns plain attributes (`cx=${'?.x'}`) into ` :=`, so templates mostly do the right thing already.
- **Mapping (my recommendation, on top of the guidance):** in non-HTML namespaces, Tree writes `className` as the `class` attribute, the one property everybody will reach for. A general "property to attribute" fallback would be too magic, so I'd stop at `className`.
- **Unchanged:** `textContent` works as is (`<text>`, `<tspan>`, `<title>`), and so do events.

**7. `compile`: templates need namespaces too.**

compileTree's template data (`TemplateElement`) has only a tag. `buildTemplate` uses `createElement`, so a compiled SVG would come out as HTML, as at runtime.
- **Two ways to fix it:** record a namespace per template element (decided at compile time, by the same rules from the template's root context), or build SVG subtrees by parsing their `toHTML` output in a `<template>`. The first is consistent with the rest; the second is simpler.
- **Also:** `toHTML` (used for server templates) would need correct case and self-closing, or none, for SVG.

**8. MathML: the same machinery, or later?**

MathML uses the same namespace mechanism, and its integration points are listed in decision 1. Supporting it alongside SVG costs a few more table entries and tests.
- **Recommendation:** do both together, with SVG as the main test case.

**9. o2h.**

o2h writes HTML text, so the parser decides the namespaces: nothing to change for namespaces. Two things to check:
- **Void elements:** its `VOID_TAGS` must not apply inside SVG (e.g. a hypothetical `<image>` vs HTML's `<img>`). It already only lists HTML void tags, so this is probably fine.
- **Equivalence:** a dynamic SVG case should be added to its equivalence and hydration tests.

**10. Managers in SVG (`ish` on an SVG element).**

Managers attach through the element's `ish` property, which isn't HTML-specific, so they'd probably work. I'd test it, but not design for it now.

### Proposed answers, for a quick yes/no

| # | Proposal |
|---|---|
| 1 | Infer namespaces as the HTML parser does (integration points included); reserve an `ns` header field, unimplemented for now |
| 2 | The context starts from the container element's namespace (so SVG holes and `<svg>` targets work) |
| 3 | Apply the parser's SVG tag-name case table; both spellings work |
| 4 | compileTree keeps attribute-name case for SVG/MathML elements (no more lowercasing there) |
| 5 | Plain `href` documented; `xlink:` / `xml:` / `xmlns:` mapped to `setAttributeNS` |
| 6 | Guidance: use ` :=` in SVG/MathML; map `className` to `class` there; nothing more |
| 7 | Compiled templates record a namespace per element |
| 8 | MathML together with SVG |
| 9 | o2h unchanged; add SVG cases to its equivalence and hydration tests |
| 10 | Managers in SVG: tested, not designed for |

Once these are settled, the implementation is mostly in two places: one "namespace for a child of this element" function (shared by Tree, compileTree and the snippet holes), and `createElementNS` where `createElement` is now.
