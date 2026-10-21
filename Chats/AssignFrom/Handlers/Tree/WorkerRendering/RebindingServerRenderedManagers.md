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

## Bruce's Query I

Does the hydrate approach use the data-residue values at all?  Why is it that if I press the hydrate button and not the apply residue button, it removes the data-residue attributes?

## Claude's Answer I

**No, hydration doesn't use the residue at all,** neither the residue object nor the `data-residue="eN"` values. Hydration re-derives everything the residue would have carried, from the **config and the data**:
- the properties without an attribute;
- the event bindings;
- the managers' values.

The bind after adoption applies each element's whole pattern, exactly as when Tree builds the element itself. So the residue is redundant once a page hydrates. The server needn't even send it.

**Why it still removes the marks:** a `data-residue` mark means "this element is still waiting for something HTML couldn't carry". After adoption and the bind, nothing is waiting any more: Tree has applied exactly those things. So the marks are stale, and leaving them would cause a real problem. With o2h's `style: true`, or any `[data-residue] { visibility: hidden }` rule, the rocket card and the links bar would **stay hidden forever** after hydrating, because only `applyResidue` (or `builtIns.scope`) would ever remove them. So Tree removes the marks of what it adopted. It reads only the mark itself, never its value.

**In short:**

| | Uses the residue object | Uses the `eN` values | Removes the marks |
|---|---|---|---|
| `applyResidue` | yes | yes: they say which entry belongs to which element | each one, once that element is ready |
| Hydration (`adopt: true`) | no | no | all of them in what it adopted, once bound (they've become stale) |

**A possible follow-up:** since a hydrating page ignores the residue, o2h could have an option to skip it, e.g. `residue: false`. That would drop both the residue object and the marks, so the HTML is a little smaller. The default style would then have nothing to hide, so the page would show everything at once and become live when hydration finishes. Want that?

## Bruce's Response II

I think there is value in saying "the server rendering of this section has lost some critical functionality that will need to be restored in the client.  Until it does, hide it".

Maybe we should call the attribute something other than data-residue?

## Claude's Answer II

**Agreed on both counts.** The mark says something about the *element*: "the server couldn't render all of this; hide it until the client restores it". *How* it's restored is a separate matter: the residue, hydration, `builtIns.scope`, or the page's own code. So the name shouldn't say "residue".

### What changes

- **The mark is independent of the residue.** o2h always marks elements that lost something (properties, events, a manager), whichever way the page will finish them.
  - **With a residue** (the default), the mark's **value** names the element's entry, as today: `data-…="e3"`.
  - **Without one** (a new opt-out, e.g. `residue: false`, for hydrating pages), the mark is a **bare attribute**: `data-…`. It still hides the part until Tree adopts and binds it.
- **Whatever finishes the element removes the mark,** as now: `applyResidue`, `adopt`, `builtIns.scope`.
- **The exported constant** gets a neutral name too: `PENDING_ATTRIBUTE` (or whatever matches the name chosen), instead of `RESIDUE_ATTRIBUTE`.

### Name candidates

| Name | For | Against |
|---|---|---|
| **`data-pending`** | Short, neutral, reads well in CSS (`[data-pending] { visibility: hidden }`) | Generic: some apps already use it for loading states |
| `data-incomplete` | Says exactly what it is | A little negative; longer |
| `data-hydrate` | Familiar from frameworks | Implies one method (hydration), which is what we're moving away from |
| `data-not-hydrated` | Your first idea | The same: it names one method, and negatives read awkwardly in CSS |
| `data-ginger-pending` | Namespaced: won't clash with an app's own `data-pending` | Longer; ties the markup to the library's name |

**My recommendation: `data-pending`.** Its clarity in CSS outweighs the small clash risk. It's only ever set by o2h and removed by these finishers, so a clash would mean an app styling `[data-pending]` for its own purpose. If you'd rather rule that out, `data-ginger-pending` is the safe choice.

### Questions

1. **The name:** `data-pending`, `data-ginger-pending`, or another?
2. **o2h's `residue: false` option** (marks without values, no residue object), for hydrating pages?

Once you've chosen, I'll rename it throughout:
- **assign-gingerly:** `applyResidue`, Tree's `adopt`, `builtIns.scope`, the tests and the docs;
- **o2h:** the output, `RESIDUE_STYLE`, the types, the tests, the demo and the README.

I'll also add the opt-out.

## Bruce's Query II

You earlier raised the question of whether we should keep the applyResidue (residue: true) support?  I left it to you, and you kept it.  What are the selling points for keeping it?  I'm thinking it might be too subtle to know when it should be used, when it only gives a partial solution at best.

## Claude's Answer III

**The honest case for keeping the residue:**

1. **The client never needs the data.** This is the only strong argument. Hydration requires the *whole* view model on the client. The residue carries only the leftovers, already resolved. That matters when the data **can't or shouldn't be shipped**:
   - it's private, or includes fields the page must not expose;
   - it came from an authenticated or rate-limited API;
   - it's large, while only a sliver of it is interactive.
2. **The client never needs the config, the pipes or the Tree handler.** It's a little less code to load, and nothing has to stay in sync between server and client. But the client still loads assign-gingerly, so the saving is modest.
3. **It finishes each element independently,** so parts become usable one by one. Hydration finishes per tree.

**Against it,** your point holds, and I'd add to it:
- **It's partial in a way that's easy to miss.** Events and properties work, but **nothing re-renders**: a manager's state changes and the markup doesn't. That's exactly the surprise you hit with "Increase by one". The difference between "finished" and "live" is too subtle to be a good default.
- **Two client paths** to explain, test and keep correct, plus o2h's residue machinery (leftover collection, entry names, the `unrendered` reporting for it).
- **For o2h's main use case, a Worker rendering a *public* API, argument 1 rarely applies.** The data is public, and the [benchmark](../../../../../demos/hydration-benchmark/compare.html) shows shipping it is cheap to parse.

### Recommendation: retire the residue; keep the marks

**One path:** the server renders HTML and marks what lost functionality, and the client hydrates (`adopt: true`). Concretely:

| | Becomes |
|---|---|
| **The marks** | Kept, renamed (Answer II), **bare** (no `eN` values): "hide until the client restores this" |
| **Who removes them** | Tree's `adopt` (as now), and `builtIns.scope` (as now) |
| **assign-gingerly `applyResidue` / `RESIDUE_ATTRIBUTE`** | Removed. The constant is renamed to the new name. `whenEventsBound` stays, since it's useful on its own. |
| **o2h's `residue` output** | Removed. o2h still classifies what HTML can't carry, now only to decide what to **mark**. `unrendered` stays, for keys that can't be done on the server at all. |
| **o2h `style: true`** | Kept, targeting the new name |
| **o2h demo** | One "Hydrate" button; the "Apply the residue" button is gone |
| **Optional, later** | o2h emitting the data as `<script type="application/json">` for the client to hydrate from (Claude's Implementation Notes, last section), so "server renders, client hydrates" is one call on each side |

**The door stays open:** if a page with server-only data comes up, a residue-like mechanism can come back, narrowly scoped and clearly labeled "static". The marks and `whenEventsBound` would already be in place for it.

### Questions

1. **Retire `applyResidue` and o2h's residue,** keeping the (renamed) marks and hydration as the one path?
2. **The mark's name** (from Answer II): `data-pending`, `data-ginger-pending`, or another?

With both answers, I'll do the removal and the rename together, across both repos (code, tests, demo, docs). 

## Bruce's Response - III

Please completely remove the residue approach with no concern for backwards compatibility.  Please use data-pending.

Also, do you see any benefit to the scope handler in assign-gingerly?  If not, please remove it.


## Claude's Implementation Notes II

The residue is gone from both repos, with no compatibility shims, and the mark is now `data-pending`.

### assign-gingerly

| | |
|---|---|
| **Removed** | `applyResidue.ts`, `RESIDUE_ATTRIBUTE`, the `./applyResidue.js` export in package.json, and `tests/apply-residue.html` / `.spec.ts` |
| **Added** | `PENDING_ATTRIBUTE = 'data-pending'` in `markerUtils.ts`, exported from `index.ts` |
| **Tree `adopt`, `builtIns.scope`** | Remove `data-pending` (instead of `data-residue`) once they've bound an element |
| **Docs** | tree.md's SSR section is rewritten around hydration, plus a "Pending marks: `data-pending`" subsection with the CSS. scope.md's pending-marks section now points there. |

`whenEventsBound` stays: it's useful on its own.

### o2h

| | |
|---|---|
| **o2h.ts** | Returns `{ html, unrendered }`. It still classifies what HTML can't carry (events, properties without an attribute, managers), but only to mark the element with a bare `data-pending`, with no `eN` value. The constants are now `PENDING_ATTRIBUTE` and `PENDING_STYLE`. |
| **types.d.ts** | `O2HResidue` and `O2HResult.residue` are removed, and the constants renamed. This applies to both copies (o2h's and assign-gingerly's `types/o2h`). |
| **Tests** | The marks test checks bare `data-pending` and `PENDING_STYLE`. The equivalence test compares o2h's raw HTML with Tree's DOM, ignoring the marks and the managers' `itemscope`; manager liveness is left to the hydration test. The hydration test checks that no `data-pending` remain. |
| **Demo** | Only the Hydrate button remains: the residue button and panel are gone. |
| **README** | "Finishing on the client: hydration" replaces the residue/hydration table. |

### Results

- **assign-gingerly** (tsc, then Playwright in a scratch copy): 163 passed, 2 failed and 6 skipped across the three browsers.
  - **The 2 failures are Firefox flakes:** in the full run, the event cases of `scope` and `tree-adopt` failed under load: "the button calls the manager", and "an event reaches the manager". Both test listeners that attach once their module has loaded. The pending-mark cases passed. Run alone, both specs passed 3 of 3 times. If this recurs, a `whenEventsBound` wait in those two cases would settle it.
- **o2h** (tsc, then Playwright in workspace mode, against the sibling assign-gingerly): 9 passed and 6 skipped.

### For you

- **Delete the stale `applyResidue.js`** (and `applyResidue.d.ts` / `.js.map`, if your build left them). It's build output, so I didn't touch it.
- **Commit the submodules separately:** `assign-gingerly/types` (treeTypes.d.ts, o2h/types.d.ts) and `o2h/types` (o2h/types.d.ts).
- **Your server on port 8000** (running since yesterday evening) answers the test specs' hardcoded `localhost:8000` URLs. I left it running and ran my copy on 8001.

### On removing `builtIns.scope`

**I'd keep it.** Its case is markup that **wasn't produced from a tree config**: hand-written HTML, a PHP/Razor/CMS template, or another framework's output, annotated with `itemprop` / `itemscope`. `adopt` can't help there, because it pairs a spec with the elements it rendered, and that markup has no spec. `builtIns.scope` is the one way to bind such markup against a manager (the original [ssr-manager-demo](../../../../../demos/ssr-manager-demo.html) scenario). It's also the small, Tree-free way to bind one sub-object (`$parent` / `$root` included) into an existing element.

**The costs are low:** `handlers/scope.ts` is self-contained, it's loaded only when a config names it, and its test suite passes.

**If you'd rather the story be "o2h + hydration only",** say so, and I'll remove it, along with scope.md, the demo, the tests and its builtIns entry.

## Bruce's Response -- Possible Optimization

Do you think it would be possible to add an option so that tree (and possibly other handlers) skip over nodes that don't contain any node with data-pending attribute?  Could this improve performance a bit?


## Claude's Answer IV

**Yes, for Tree's `adopt`, and it would help mostly content-heavy pages.** It's only worth it as an opt-in, though, because it changes what hydration guarantees.

### What adoption does today

The first run with `adopt` has two parts:

1. **The adoption walk** (`adoptNode`) pairs the spec with the existing elements and builds Tree's records around them. It also resolves the repeats' `of` / `key` and the switches' discriminants, and attaches managers.
2. **The ordinary bind** (`syncNode` → `bindContent`) then resolves every pattern key of every element. It writes only what differs, but it still resolves and compares everything.

### What a skip could leave out

**Only part 2, and only for elements whose subtree has no `data-pending`.** The walk can't be skipped: later runs and managers' `ctx.rebind()` need the records.

**An element without the mark has nothing HTML lost.** Its pattern was text, attributes and reflected properties, and those are already in the markup. So its bind would rewrite nothing. Everything that does need the client (events, properties without an attribute, managers) is marked, so it would still be bound.

**Finding the unmarked subtrees is cheap:** one `querySelectorAll('[data-pending]')` per tree, adding each mark's ancestors (up to the tree's target) to a Set. That costs about pending elements × depth, done once. `bindContent` would then skip any element not in the Set.

**Nested trees:** a skipped element's nested tree wouldn't be adopted on the first run. It would adopt on the next one (the flag is carried down), or immediately if a mark is inside it, since its ancestors are in the Set.

### How much it would save

**I haven't measured it.** The walk and the bind are about the same kind of work (resolving paths per element), so for a page that's mostly static text in repeats, the skip could save up to roughly half of the adoption time.

**For the tree-demo page, it's noise:** there, nearly everything interesting is pending anyway (the managers' sections, the buttons). The benchmark that would show it is a long list of mostly static items, which I'd add to `demos/hydration-benchmark/` as an "adopt" variant before deciding.

### The catch: it trusts the server

**The full bind also corrects.** Today, if the client's data or pipes produce something different from what the server rendered, the bind fixes it silently. With the skip, those elements keep the server's version until the next run touches them.

**That's realistic, not hypothetical:**
- **Locale and time zone:** the demo's `549,054 kg` and its date pipes format differently on a server in another locale or zone.
- **Time:** "T-minus" countdowns and "verifying" states change between the server render and hydration.
- **Data:** the client's copy can be newer than what the server rendered from.

**So it shouldn't be the default.** Hydration's promise today is that "after adopt, the DOM is exactly what Tree would build". The skip weakens that to "exactly what the server built, plus what was pending".

### Other handlers

- **`join` / `microJoin` and the other sync ops** run inside Tree's patterns, so the skip covers them.
- **`builtIns.scope`** binds a single element. Its markup is typically hand-written or from a CMS, so the absence of a mark there says nothing. I wouldn't apply the skip to it.

### Proposal

- **An option on adopt:** `adopt: 'pending'`, meaning "adopt, and bind only the pending parts on the first run". `adopt: true` would keep today's full bind.
- **Measure before keeping it:** add an adopt variant to the hydration benchmark that times `adopt: true` against `adopt: 'pending'`.
- **If the gain is small** (say under 20% on the list page), drop the option: the extra guarantee is worth more.

### Questions

1. **Go ahead:** benchmark first, then implement `adopt: 'pending'` if it pays?
2. **The option's shape:** `adopt: 'pending'`, or a separate flag such as `trustServer: true`?

## Bruce's Response -- Please benchmark first

I think the example should be contrived to be one where there's quite a bit of static information, like a company's mission, address, CEO, number of employees, all of which are static, and the stock value, which is changing.

You raised the issue of formatting as a major stumbling block.  This argues in favor of using something like [be-intl](https://github.com/bahrus/be-intl) to move the formatting away from the tree instructions.

The rocket example, only one section is hidden, which makes me think it could help there?


## Claude's Benchmark Notes

To measure the skip, I prototyped it: **`adopt: 'pending'`** in `handlers/tree.ts`, experimental, and documented as such in `treeTypes.d.ts`. `adopt: true` is unchanged.

### The benchmark

[`o2h/demo/benchmark/adopt.html`](../../../../../../o2h/demo/benchmark/adopt.html) lives in o2h, since it needs both packages.

**How it measures:**
- o2h renders each scenario once, in the page as a server would.
- The page then hydrates fresh copies of that HTML with `adopt: true` and with `adopt: 'pending'`, alternating the modes. It reports medians per hydration; the `innerHTML` parse isn't counted.
- "Client render" (Tree building the same DOM from nothing) is timed too, for scale.

**What it checks:** that `'pending'` gives the same DOM as `true`, that no marks are left, and that clicking the manager's button re-renders, in both modes.

**The scenarios:**
- **Company profile** ([`companyDefinition.js`](../../../../../../o2h/demo/benchmark/companyDefinition.js)), contrived as you suggested:
  - static: name, tagline, mission, founded, industry, employees, website, address, the CEO with a quote, 6 leaders, 8 offices and 6 products;
  - live: the stock quote, a `StockManager` with a Refresh button. That's the only `data-pending` element.
- **Company directory:** 100 such profiles in one repeat.
- **Rocket:** the tree-demo definition.

### Results

Medians of 31 samples. Each cell is `adopt: true` → `adopt: 'pending'`, with the share saved:

| Scenario | Elements (bound by `'pending'`) | Chromium | Firefox | WebKit |
|---|---|---|---|---|
| Rocket | 65 (18) | 0.165 → 0.100 ms (39%) | 0.25 → 0.15 ms (40%) | 0.30 → 0.20 ms (33%) |
| Company profile | 129 (6) | 0.125 → 0.070 ms (44%) | 0.20 → 0.10 ms (50%) | 0.20 → 0.10 ms (50%) |
| Company directory | 12,901 (601) | 11.4 → 5.9 ms (48%) | 21 → 7 ms (67%) | 17 → 9 ms (47%) |

Firefox and WebKit timers are coarse (0.1 ms or 1 ms), so their small-scenario numbers are rough. All checks passed in all three browsers.

### What the numbers say

- **On the rocket question: yes, proportionally.** Only the links bar and the rocket card are pending, so `'pending'` binds 18 of 65 elements and saves 33–40%. In absolute terms, though, that's under 0.1 ms. For a single page, hydration is already cheap either way.
- **The company profile is the clearest case.** Only 6 of its 129 elements are bound, but the saving is "only" about half. The other half is the **adoption walk itself**, which `'pending'` can't skip.
- **The saving matters at scale:** 5–14 ms on a 13,000-element page. That's real on a slow phone (multiply by 4–6) and on a page with many profiles.
- **A surprise:** `adopt: true` costs about **the same CPU as a client render from scratch** (11.4 ms vs 11.0 ms in Chromium). Adoption's value so far is not rebuilding: no flash, focus and scroll kept, and no DOM churn. It isn't saving script time.

  A Chromium profile names the biggest single cost of the walk: `slotsOf`, iterating each container's `childNodes` (whitespace text nodes included), at 9–13%. Then come `adoptNode` and `normalize`. So making the walk cheaper, e.g. walking `firstElementChild` / `nextElementSibling` and checking only comments for switch placeholders, would help **both** modes. It could make `adopt: true` cheaper than a client render.

### On be-intl

**Agreed: it removes most of the risk.**
- **What changes:** if the server emits raw values (e.g. `<data value="549054">`) and [be-intl](https://github.com/bahrus/be-intl) formats them on the client, Tree's patterns no longer produce locale- or time-zone-dependent text. Then the server's text and the client's agree by construction.
- **The skip doesn't interfere:** be-intl attaches on its own (via its enhancement), not through Tree's bind, so it works on skipped elements.
- **What remains:** data freshness, i.e. the client's data being newer than the server's. With `'pending'`, an unmarked element keeps the server's version until a later run reaches it. For the company page, the only fast-changing value is the quote, which is a manager and so pending anyway.

### Implementation

`adopt: 'pending'`, in `handlers/tree.ts`:
- **Before the walk,** Tree collects the marked elements in the region and their ancestors (`pendingScope`). The walk adds nested trees' hosts to that set, so nested trees still get adopted (`bindWithAncestors`).
- **On the first run,** `syncNode` returns early for an adopted element that isn't in that set and isn't inside a mark. Its records exist from the walk, so later runs and `ctx.rebind()` work as usual. Its first full bind just happens on the next run.
- **After the run,** the scope goes inactive, because nodes keep their options. The marks are removed as before.

### Tests

**Test 6 in `tests/tree-adopt.html`** checks that `'pending'`:
- reuses every element;
- leaves unmarked elements unbound on the first run (stale server text stays, where `adopt: true` corrects it);
- binds the marked manager, its events and `ctx.rebind()`;
- removes the marks;
- binds everything on the next run, adopting a skipped nested tree in place.

**The two Firefox flakes from earlier are fixed:** Test 1 in tree-adopt.html and three cases in scope.html wait with `whenEventsBound(button)` instead of fixed delays.

**Full suite** (scratch copy, three browsers): 165 passed and 6 skipped.

### Recommendation

**Keep `adopt: 'pending'` (still experimental).** It halves hydration's script time, which pays at scale, and be-intl answers the formatting concern.

**Next, if you agree:** speed up the adoption walk itself (`slotsOf` and friends). That benefits `adopt: true` too, and it's now the larger half of `'pending'`.

### Questions

1. **Keep `adopt: 'pending'`** as is (experimental), or rename it before it settles (e.g. `trustServer`)?
2. **Go ahead with the walk optimization,** measured with the same benchmark?

## Bruce's Response - Yes to both

Yes to both


## Claude's Implementation Notes III

**`adopt: 'pending'` stays** as it is, experimental.

### The walk, faster (`handlers/tree.ts`)

- **`slotsOf`** walks siblings directly (`firstChild` / `nextSibling`, up to an optional end node) instead of iterating a `childNodes` NodeList. For the tree's own region, it no longer copies the nodes between the markers into an array first.
- **`adoptNode`** resolves `root` and `fastPathAllowed` only where they're used (switches and repeats), rather than for every element.

### Results

Same benchmark, medians of 31 samples; before → after:

| Scenario | | Chromium | Firefox | WebKit |
|---|---|---|---|---|
| Company directory (12,901 elements) | `adopt: true` | 11.4 → 8.2 ms | 21 → 19 ms | 17 → 14 ms |
| | `adopt: 'pending'` | 5.9 → 3.6 ms | 7 → 6 ms | 9 → 7 ms |
| | client render (unchanged code, for noise) | 11.0 → 10.2 ms | 20 → 20 ms | 19 → 17 ms |
| Company profile (129) | `true` → `'pending'` | 0.100 → 0.050 ms | 0.15 → 0.10 ms | 0.15 → 0.05 ms |
| Rocket (65) | `true` → `'pending'` | 0.130 → 0.075 ms | 0.30 → 0.15 ms | 0.20 → 0.15 ms |

The client render's code didn't change, so its drift (up to about 10%) is the noise level. Beyond that:

- **Chromium gained the most:** `'pending'` is about 40% faster than before, and `adopt: true` about 25%.
- **`adopt: true` now beats a client render** in all three browsers on the large page (8.2 vs 10.2 ms in Chromium). Before, the two cost the same.
- **`adopt: 'pending'` costs a third of a client render** on the large page in Chromium and Firefox, and about 40% in WebKit.

In the Chromium profile, `slotsOf` went from 9–13% of the time to 2–4%. What's left of the walk is spread thin: `adoptNode` itself at 5–6%, and `normalize` at 1–2.5%. Most of the remaining time is native: parsing, DOM calls and GC. I stopped there, since further gains in the walk would be small.

### Tests

- **assign-gingerly** (scratch copy, three browsers): 165 passed and 6 skipped.
- **o2h:** 9 passed and 6 skipped.
