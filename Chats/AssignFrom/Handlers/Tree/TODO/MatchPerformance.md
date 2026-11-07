# Match Performance

## Bruce's Ask

We observed this earlier in one of the chats, and I think you may have speculated on the causes.

I'm finding that with no cpu throttling:

http://localhost:8000/demos/js-framework-benchmark-tree.html

... takes up about 65 ms to render 10,000 rows.

http://localhost:8000/demos/js-framework-benchmark.html

... takes up about 100 ms.

Can you please investigate if there are any optimizations that could bring down the time the manageTemplateList takes to more closely match what tree achieves?

## Claude's Response

**Yes: `manageTemplateList` can match tree.** With four library changes and two changes to the demo page, creating 10,000 rows takes 44 ms in Chromium, the same as tree. That's down from 87 ms. The demo's own markup accounts for about a third of the gap, and the other two thirds is `assignFrom`'s general path running once per cell.

I measured everything below in a scratch copy of the repo, and **I haven't changed anything in the repo yet.** I also found a bug on the way: every row gets the same two ids.

### Where the time goes

These are script times in Chromium, as medians of 7–9 runs, with a forced GC before each operation:

| Create 10,000 rows | ms |
|---|---|
| The demo today | 87 |
| The template on one line, so no whitespace text nodes | 71 |
| …and `at` instead of `pin` | 62 |
| …and the three small library changes (3 to 5 below) | 55 |
| …and a fast path for `#[x]?.prop` (1 below) | **44** |
| Tree | 44 |
| Hand-written template cloning (`js-framework-benchmark-vanilla-template.html`) | 42 |

**The demo's template is indented,** so each row clones 9 whitespace text nodes along with its 6 elements. Tree makes none, and the hand-written page keeps its template on one line for exactly this reason (its comment says so). Clearing 10,000 rows (26 ms against tree's 17) is almost all those extra nodes.

**`pin` costs more than `at`.** It checks each cell with `matches()`, and writes an id onto it. The docs already recommend `at` for thousands of rows.

**What's left is per-cell work.** Each `#[a]?.textContent: '?.id'` goes through `getValues` and then a whole `assignGingerly` call, to set one property. That was half of the handler's time in the profile. It's the same cost that tree's fast path removes.

### What I'd change in the library

1. **A fast path for `'#[x]?.prop': '?.path'`, the biggest gain.** It's the same idea as tree's fast path, and with the same limits: a plain property on the left, and a `?.` path on the right. The value is read and set directly. Anything that could change the meaning falls back to today's path: `withMethods`, `akaMethods`, `substitutions`, a permission processor, an aliased or piped segment, or an object value. Like tree's, it skips setting `textContent` when the text is unchanged. On its own, it takes the demo as it is from about 80 ms to 68.
2. **Fix the duplicate ids (a bug).** `generateUniqueId` counts per root node, and each row's pins resolve while the row is still in its own fragment. So every row's cells get `-ag:0` and `-ag:1`: in Create 1,000, 2,000 cells share 2 ids. A single counter for the page fixes it, at no measurable cost. The suite still passes with it.
3. **Work out a pattern's categories once.** `assignFrom` re-expands and re-categorizes the same pattern object for every row. Caching that per pattern, when there's no `where_x_in`, gains 5–8%. The cache would need care in one place, which modifies `normalPattern` for `#[x]` values with `pin`.
4. **Move each row's nodes once.** The handler moves each clone into a temporary fragment, then moves its nodes one at a time into the batch. Moving the clone's fragment once gains about 4%.

**Tried and dropped:** removing all rows with a single `Range` when the list is cleared. It gained nothing in Chromium, and in WebKit it took **3.4 seconds** to clear 10,000 rows, against 60 ms.

**Not in the library:** dropping the whitespace for you. Spaces between inline items can be meaningful, so I'd document it instead: keep row templates on one line, as the hand-written page does.

### What I'd change in the demo

- **Put the template on one line.**
- **Use `at`, or keep `pin`, whichever the page is meant to show.** With the fixes, `pin` costs about 12 ms more than `at` at 10,000 rows, because of its id writes and `matches()` checks.

### The other browsers

These are script times for creating 10,000 rows, as medians of 5 runs:

| | Today | Library changes | Library changes, one-line template, `at` | Tree |
|---|---|---|---|---|
| Chromium | 87 | 68 | 44 | 44 |
| Firefox | 130 | 102 | 61 | 70 |
| WebKit | 98 | 78 | 43 | 62 |

So in Firefox and WebKit, it would be **faster than tree.** Update every 10th and swap gain the most, because `manageTemplateList` reapplies every row on each render: they drop from about 8 ms to 3–4, which is tree's level or below. Clear is unchanged.

### Checked

- **The suite:** with all four library changes, all 180 tests pass in the scratch copy, with 18 skipped.
- **The ids:** with the fix, 2,000 cells got 2,000 distinct ids.
- **How to rerun:** the scripts are in my scratchpad (`mtl-ab.mjs`, `mtl-patch.cjs`). They serve copies on loopback ports, and leave port 8000 and your server alone.

### Decisions for you

1. Should I make library changes 1 to 4 in the `.ts`, with tests? I recommend yes.
2. For the demo: should I put the template on one line, and should it use `at` or keep `pin`? I'd make both changes, and add a note about whitespace to the `manageTemplateList` docs.

## Bruce's Response I

Yes to both decisions.


## Claude's Implementation Notes I

**Done.** `manageTemplateList` now creates 10,000 rows as fast as tree in Chromium, and faster in Firefox and WebKit. All four library changes and both demo changes are in, with tests and docs.

### Script time, before and after

These are medians of 5 fresh page loads, with a forced GC before each operation, in ms. "Before" is the library and the demo page as they were.

| Create 10,000 | Before | Now | Tree | Hand-written template clone |
|---|---|---|---|---|
| Chromium | 86 | **44** | 44 | 42 |
| Firefox | 127 | **57** | 67 | 40 |
| WebKit | 104 | **45** | 61 | 30 |

- **Smaller lists gain as much.** Create 1,000 went from 13 to 6.6 ms in Chromium, against tree's 8.5.
- **Updates gain the most.** Update every 10th and swap went from about 8–12 ms to 2–3 ms in all three browsers, below tree's 4, because `manageTemplateList` reapplies every row on each render.
- **Clear is still a little behind tree:** clearing 10,000 rows takes 20 ms, against 18 in Chromium.

Your measurement in the page includes layout and paint, so it will show smaller relative gains than these script times.

### What changed

- **[assignFrom.ts](../../../../../assignFrom.ts):**
  - **The fast path:** `assignIdRefFast` handles `'#[x]?.prop': '?.path'`, called from `processIdRefNormalKeys`, with the limits described in my response.
  - **The pattern cache:** `preparePattern` caches a pattern's expansion and categories per pattern object, unless it uses `where_x_in` and the like. With `pin` or `at`, `normalPattern` is copied before `#[x]` values are resolved into it, so the cached one never changes.
- **[resolveIdRef.ts](../../../../../resolve/resolveIdRef.ts):** generated ids now come from one counter for the page.
- **[manageTemplateList.ts](../../../../../handlers/manageTemplateList.ts):** the temporary fragment is gone, and each clone's nodes move into the batch in one step. They still move one at a time if something has taken a node out of the clone.
- **[js-framework-benchmark.html](../../../../../demos/js-framework-benchmark.html):** the template is on one line, and the page uses `at`, with a comment on each.
- **New test, [id-ref-fast-path.html](../../../../../tests/id-ref-fast-path.html) (31 checks, in all three browsers):**
  - the fast path gives the general path's result in 11 cases;
  - the ways around it (aliases, pipes, `assignTo`, a permission processor);
  - unchanged text keeps its text node;
  - a reused pattern gives each call its own values, and a `#[x]` value is resolved afresh;
  - `where_x_in` still expands per call;
  - 200 pinned cells get 200 distinct ids;
  - an indented template keeps its whitespace nodes, in order.
- **Docs:**
  - [manage-template-list.md](../../../../../docs/manage-template-list.md): the fast path, unique ids, a new "Writing the Template" section on whitespace, the new script times, and tree's comparison updated.
  - [README](../../../../../README.md): a line saying to reuse a pattern object but not change it, because of the cache.

### Two things to know

- **A pattern object is now treated as fixed after its first use.** Tree already did this. Changing a pattern in place between calls would apply the old keys, so change a copy instead. Nothing in the suites, o2h or o2h-edge does that.
- **`textContent` isn't set again when the text is the same,** as in tree, so the text node stays. The general path sets it every time.

### Checked

- **assign-gingerly:** 183 passed and 18 skipped, in a copy of the repo on a loopback port, since your server is on 8000. `tsc` is clean, and your build produced the `.js`.
- **o2h:** 27 passed, 24 skipped by design.
- **o2h-edge:** 22 of 22.

Nothing is committed.
