# Baking `join` Text: Benchmark, Then Build or Discard

## Background

From [Step 2](./Step2-CompileTree.md): for a compiled Tree, could the **static parts** of a ` =&` `join` be baked into the template, so only the dynamic parts are set per instance?

```js
['li', { '_ =&': { join: ['T+', '?.time', 's: ', '?.reason'] } }]
// baked:  <li>T+<!-- 2 dynamic text slots -->s: </li>   (as separate text nodes)
```

**How it would work, with no markers:**
- **Locating:** the element is located by its element path (see Step 2's binding design). Its text children are fully owned by the join, so `childNodes[i]` indices are stable *within that element*.
- **Baked:** static pieces become text nodes in the template.
- **Per instance:** dynamic pieces are placeholder text nodes whose `.data` is set.
- **Optional (all-or-nothing) sub-arrays:** their static separators are set to `''` when dropped.

**The doubt:** today it's **one** `textContent` assignment of a concatenated string, which creates one text node. Baked, it's cloning N text nodes plus several `.data` writes. That may be no faster, or even slower.

## Plan

1. **Benchmark:** add a **B5** group to `demos/compile-benchmark.html`, using the failures-style line (2 static + 2 dynamic pieces) and a longer one (e.g. 4 static + 4 dynamic):

   | Variant | |
   |---|---|
   | Today | Clone the element, then `textContent = parts.join('')` |
   | Baked | Clone with static text nodes, then set `.data` on the dynamic slots (by `childNodes[i]`) |
   | Baked, with optional segments | Some static separators cleared to `''` |

   Measure create (1k / 10k) and **rebind** (only the dynamic values change), build-only and with layout, in Chromium, Firefox and WebKit.
2. **Decide:**
   - **Clearly faster** (say ≥ 1.2× on create *and* no rebind regression) → design it into the Step 2 compiler.
   - **Otherwise → discard.** Literal-only joins are just text anyway (and will be baked as such).

## Status

Done: benchmarked and **discarded** (see the findings below).

## Bruce's Response

The only way this could work I think is with [ranges](https://developer.mozilla.org/en-US/docs/Web/API/Range/setStart) and markers, but I'm not sure at all.

Please see what you find if anything.  

## Claude's Findings: Discard

**Recommendation: don't bake `join` text.** It's slower on creation in every browser, and it doesn't reliably help rebinding. Details below. The benchmark page is [`demos/join-baking-benchmark.html`](../../../../../../demos/join-baking-benchmark.html).

### On ranges and markers

- **Ranges aren't needed.** Each dynamic piece can be its own `Text` node, whose `.data` is set directly. That's the cheapest possible update, and a `Range` would only add work on top.
- **Markers are only needed for *parsed* HTML.** When a template comes from an HTML string (e.g. server-rendered, Step 5), adjacent text merges into a single text node. So static and dynamic pieces can only stay separate if something sits between them. **Comments** (`T+<!----> <!---->s: `) do that.
- **A DOM-built template doesn't need them:** `cloneNode` preserves separate, and even empty, text nodes.

So I benchmarked both approaches against today's join.

### What was measured

A `<li>` line, as either:
- **short:** `['T+', ?, 's: ', ?]`;
- **long:** `['Core ', ?, ', flight ', ?, '; landing: ', ?, ' (', ?]`.

Three variants:

| Variant | Create | Rebind |
|---|---|---|
| **text (today)** | Clone a bare `<li>`, then one `textContent` assignment of the joined string | Re-assign `textContent` |
| **text nodes** | DOM-built template with static text nodes baked in; set the dynamic slots' `.data` | Set the dynamic slots' `.data` |
| **comment markers** | Parsed HTML template, with each dynamic slot a placeholder text node between two comments (SSR-compatible) | Same as text nodes |

Medians, 1k and 10k lines, build-only and with one forced layout ("+L"). Every variant is checked to render identical text first.

### Results (ratio vs. "text (today)"; > 1 = slower)

| | create 1k | create 1k + L | create 10k | rebind 1k + L | rebind 10k |
|---|---|---|---|---|---|
| **Chromium**, short: text nodes / markers | 2.6 / 2.3 | 1.15 / 1.10 | 1.9 / 2.6 | 1.29 / 1.24 | 0.91 / 0.96 |
| **Chromium**, long | 3.3 / 4.3 | 0.89 / 0.92 | 2.3 / 2.9 | 1.83 / 1.93 | 1.96 / 1.79 |
| **Firefox**, short | 2.0 / 2.0 | 1.67 / 1.33 | 2.7 / 3.1 | 1.20 / 1.20 | 0.67 / 0.78 |
| **Firefox**, long | 3.0 / 3.0 | 1.60 / 1.70 | 3.0 / 4.4 | 1.43 / 1.43 | 1.11 / 1.11 |
| **WebKit**, short | 3.0 / 3.0 | 1.21 / 1.29 | 1.9 / 2.3 | 1.09 / 1.18 | 0.36 / 0.43 |
| **WebKit**, long | 1.5 / 2.0 | 1.50 / 1.63 | 2.4 / 3.2 | 1.46 / 1.46 | 0.65 / 0.71 |

In absolute terms, today's create costs **~0.6–2 ms per 1,000 lines** (build only). There's very little to win back.

### Why

- **Setting `textContent` once is about as cheap as DOM text gets:** one string concatenation in JavaScript, and one text node created by the engine.
- **Baking replaces that with more nodes:** cloning 4–8 text nodes (plus 4–8 comments with markers) and then several `.data` writes. Each of those costs more than the single string.
- **The only win is rebind *without* layout** (WebKit, and the short line in Chromium and Firefox), where updating a couple of small text nodes beats regenerating the string. Once layout is included, the extra nodes make it slower again (1.1–1.9×).

**Against the bar** set in the plan (≥ 1.2× faster create *and* no rebind regression), it fails on both counts. **So: discard.**
- **Joins stay as they are:** a single `textContent`, set per instance, and skipped on rebind when all-literal (Step 1b).
- **In a compiled Tree,** a join stays a per-instance dynamic key. A join with only literal pieces is just text, and can be baked as such.

**For `microJoin` (step 1e):** this suggests its value will be **semantic output, not speed.** Extra elements per line will cost more than a plain string. Its B6 benchmark should measure *how much* that costs, rather than expect a win.
