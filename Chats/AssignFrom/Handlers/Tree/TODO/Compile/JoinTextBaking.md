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

Not started. To be done before resuming Step 2.
