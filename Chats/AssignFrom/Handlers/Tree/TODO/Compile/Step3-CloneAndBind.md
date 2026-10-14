# Step 3: Clone-and-Bind Instantiation (`compile` option)

*Outline; to be detailed after Step 2.*

**Goal:** `{ do: 'builtIns.tree', compile: 'launch-card', map }` creates nodes by cloning compiled templates instead of `createElement`:

1. On first use, compile the spec (Step 2) and register its flat templates under the `compile` name, with a signature check.
2. `createNode` for a top-level key or a repeat item: clone that key's or item's template, walk the clone's elements in preorder alongside the plan, build the usual `TreeNode`s, and apply only the dynamic keys. Managers, events and nested repeats are handled per plan entry.
3. Rebinding stays unchanged (it's the existing lockstep walk).

**Key questions to settle then:**
- **Where the template registry lives** (per document? per scoped registry? per `ShadowRoot`?).
- **`importNode` vs. `cloneNode`** (custom-element upgrade timing).
- **Invalidation** when the signature doesn't match.
- **Wildcard (`'*'`) keys** and keys that appear or disappear.

**Tests:** the whole `tests/tree.html` suite passes with `compile` turned on (parameterized), with no expected values changed.
