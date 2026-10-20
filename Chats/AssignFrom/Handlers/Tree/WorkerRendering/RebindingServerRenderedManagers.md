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
