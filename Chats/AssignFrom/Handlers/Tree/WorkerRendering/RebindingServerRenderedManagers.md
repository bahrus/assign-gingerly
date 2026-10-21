# Rebinding Server-Rendered Managers

## The Problem (from [StylingIncompletelyRenderedElements.md](./StylingIncompletelyRenderedElements.md))

In o2h's demo, after the residue is applied, the server-rendered rocket card's "Increase by one" button reaches the card's `RocketManager`, and its state changes. But the card doesn't update. The same button in the client-rendered card (builtIns.tree) works.

**Why:** on the client, builtIns.tree keeps a `TreeNode` per element: which spec it came from, and so which pattern to re-apply. When a manager calls `ctx.rebind()`, Tree re-applies the subtree's patterns against the manager (`'?.heightLabel'` → the `<span>`). Server-rendered markup has no such record, and the residue only carries what HTML can't (properties, events, the manager's value), not the *bindings*. So when the manager calls `ctx.rebind()`, there's nothing to re-apply.

## Claude's Proposal

### What "working" needs

Some code on the client has to know, for each element of a manager's subtree, which pattern (with unresolved paths) applies to it, and re-apply those patterns against the manager on `ctx.rebind()`. Three ways to get there:

| | How | Cost | Limits |
|---|---|---|---|
| **A. Tree adopts the server's markup (hydration)** | The client runs the **same** `builtIns.tree` call (config + data). Instead of clearing markers it finds without state, Tree **walks the spec and the existing elements in lockstep**, builds its `TreeNode`s around them, and binds them. That attaches managers, events and properties, i.e. everything the residue does, plus the record needed to rebind. | Moderate. Tree already pairs specs with existing elements when it clones compiled templates (`pairNodes`), and o2h's output provably has Tree's structure (the equivalence test). | The client needs the **config and the data**. The data is the API response, so either ship it (a JSON script block, as for the residue) or refetch it. |
| B. Re-render a manager's subtree on `rebind()` | The residue entry names the map key; on `ctx.rebind()`, the client runs Tree for that key into the managed element, replacing the server's children. | Small. | Replaces elements (loses focus and any state in them), needs the config on the client, and is a special case rather than a step towards hydration. |
| C. `builtIns.scope` with itemprops | o2h emits `itemprop` on bound elements inside managed subtrees; `builtIns.scope` with `infer` re-binds them. | Small. | Only simple `?.name` bindings (not microJoin, ternaries, repeats); adds microdata the page didn't ask for. |

### Recommendation: A, hydration, starting with Tree adopting matching markup

It's the general answer, and it's **Step 6** from the compile plan ([Step6-AdoptServerRenderedInstances.md](../Compile/TODO/Step6-AdoptServerRenderedInstances.md)). With it:
- **The server-rendered page becomes a normal Tree page,** with rebinding in place on later data, and managers, events and switches all live.
- **The residue becomes optional.** It stays useful when the page doesn't want to ship the data or the config (for read-mostly parts), and as what's shown before hydration.
- **The data cost is explicit:** it's the same JSON the server rendered from, so a page can embed it, as frameworks do, or the client can fetch it.

**A sketch:**
1. **The trigger:** o2h already emits Tree's markers (`<!--?start name="tree"-->`). Today, markers without state are cleared and rebuilt. Instead, Tree would **try to adopt** first:
   - walk each map key's spec alongside the elements between the markers;
   - **validate structure as it goes:** tag names, child counts, switch slots, repeat items by key;
   - on success, build the `TreeNode`s and run the normal bind. A bind is idempotent, so text that's already right isn't rewritten (the fast path skips unchanged `textContent`).
   - **Fall back** to today's rebuild on any mismatch, per key. One debug note per tree.
2. **What adoption has to recover from the markup:**
   - **repeats:** items' keys (by re-resolving `key` against the data, in order);
   - **switches:** the chosen case (re-chosen from the data, then validated against the element), and `<!--?switch-->` placeholders;
   - **nested trees:** their own markers.
3. **Opt-in** at first, with an `adopt: true` on the tree config, so nothing changes for pages that expect today's behavior.
4. **o2h's side:** nothing new for the markup. o2h might add an option to embed the data as JSON for the client.

### Questions

1. **A (hydration) rather than B or C?**
2. **The data on the client:** embedded by o2h (an option), fetched by the page, or left to the page entirely?
3. **Adoption opt-in (`adopt: true`) at first,** or the default for markers found without state?
4. **The residue once hydration exists:** keep both (residue for pages that don't ship data), or plan to retire it?

## Bruce's Response I

I'm not hugely excited about this approach, but I cn't put my finger on why, nor can I propose a better alternative.  Please proceed with A, and go with your instincts for the other questions.

## Claude's Implementation Notes

Done: **A, as `adopt: true` on the tree config.** Nothing is committed.

**My calls on the other questions:**
- **The data on the client:** left to the page. o2h doesn't embed it. The page can embed the JSON or fetch it. The [hydration benchmark](../../../../../demos/hydration-benchmark/compare.html) suggests embedding is cheap: `JSON.parse` takes under 1 ms for 420 KB.
- **Opt-in:** `adopt: true`. Nothing changes for existing pages.
- **The residue stays,** for pages that don't want to ship their data. A page uses one or the other; adoption removes the `data-residue` marks of what it adopted.

### Results

| | |
|---|---|
| assign-gingerly, new `tests/tree-adopt.html` | **17 / 17**, in Chromium, Firefox and WebKit |
| assign-gingerly, full suite (scratch copy) | **168 passed, 6 skipped** |
| o2h, `npm test` (workspace) | **9 passed, 6 skipped** (the new hydration test in all three browsers) |
| o2h demo, "Hydrate" | **66 of 66** elements adopted (none rebuilt); the server card's "Increase by one" re-renders it (70 m → 71 m); the server's links bar switches to "verified" when its manager's async check settles; no console errors |

### How it works (`handlers/tree.ts`)

**Small by design.** Adoption **only builds Tree's records** (the `TreeNode`s) around the existing elements, and the **ordinary bind** does everything else. So there's no second binding code path to keep in sync.

1. **Where it hooks in:** on the first run, Tree finds markers without state. With `adopt`, instead of clearing them, `adoptTree` walks the map entries (the shared `mapEntries`) alongside the elements between the markers, and `adoptNode` mirrors `createNode` without creating anything:
   - **elements:** the tag is checked, then managers are attached (with Tree's `ctx.rebind`, which is what makes the card live);
   - **static children:** paired by position;
   - **repeats:** items paired via the shared `repeatItems`, keyed, with `empty` handled;
   - **switches:** the case is re-chosen via the shared `chooseCase`; a case rendering nothing must be a `<!--?switch-->` placeholder;
   - **nested trees:** they adopt their own markers when bound (`adopt` is carried down);
   - **an element's own content** (text, `microJoin`) needs no pairing.
2. **The normal sync then runs** on those nodes: patterns, events, properties.
   - The fast path doesn't rewrite unchanged text, and `microJoin` updates in place, so **the markup isn't touched**. The test checks that `innerHTML` is identical after adoption.
3. **`data-residue` marks** in the adopted region are removed.
4. **Any mismatch** (tag, element count, item count, missing placeholder) **falls back to today's rebuild**, all of it, never half-adopted, with one `console.debug` saying why.

**The tests** (`tests/tree-adopt.html`) render with Tree, serialize the result (markers included, like a server would send it), parse it into a new container and adopt it. They cover:
- every element reused;
- the manager attached;
- an event reaching it, with its `ctx.rebind()` re-rendering the card;
- later runs: a keyed repeat reordering adopted items, a switch, a nested tree, `microJoin` in place;
- an empty repeat and an empty switch;
- marks removed;
- a tampered tag falling back to a rebuild, with the debug note;
- without `adopt`, a rebuild as before.

**Also:**
- **Types:** `adopt?: boolean` on `TreeConfig` (`treeTypes.d.ts`, **the submodule**).
- **Docs (`tree.md`):**
  - a new *Hydration: `adopt`* subsection;
  - *Server Side Rendering* now presents residue vs hydration;
  - the Config block has `adopt`;
  - the rebind note mentions it.
- **One limit:** with `compile`, adopted nodes aren't paired with compiled templates, so items *added later* are created rather than cloned. It's documented.

### o2h

- **`tests/hydration.html`** (with a spec): o2h's HTML, adopted by builtIns.tree. It checks:
  - every element reused;
  - no marks left;
  - **the same DOM** as Tree's own rendering (apart from the manager `itemscope`);
  - the rocket card going 70 m → 71 m on "Increase by one", then to feet on `metric = false`.
- **The demo** has a **Hydrate** button next to "Apply the residue". They're mutually exclusive: a page does one or the other. The log reports how many elements were adopted.
- **README:** a *residue or hydration* table, and the new test.

### On "not hugely excited"

A few things that might be behind the feeling, for what they're worth:
- **The server and the client must agree on more:** the config, the pipes, the manager classes and the same data, or adoption falls back to a rebuild. That's inherent to hydration in any framework, but here it's visible, because o2h and Tree are separate.
- **The data is shipped twice** (as HTML and as JSON). The benchmark says that's cheap to *parse*, but it still adds bytes. Compression helps, since the JSON repeats the HTML's text.
- **The fallback is all-or-nothing.** A small mismatch anywhere rebuilds the whole tree. Per-key fallback would be gentler, and I'd add it if mismatches turn out to happen in practice.

One step that could make it feel better: **o2h emitting the data for the client** (opt-in, as a `<script type="application/json">` next to the HTML), with a tiny client helper that hydrates from it. Then "server renders, client hydrates" is one call on each side, with no plumbing in between.

**To do on your side:**
1. **Build** (your watch build already compiled `handlers/tree.js`; o2h's tests ran against it).
2. **Commit the `types` submodule** (`adopt` on `TreeConfig`).
3. **`git add`:**
   - in assign-gingerly: `tests/tree-adopt.*`;
   - in o2h: `tests/hydration.html`.
