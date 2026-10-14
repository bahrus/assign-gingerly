# Step 2: `compileTree(spec)`, a Pure Compiler

*Outline; to be detailed after Step 1.*

**Goal:** a pure function, with no DOM required, that turns an element specification into:

- **templates:** HTML strings, **flat** (one per top-level key, plus one per repeat `each` / `empty`). No template contains another.
- **a plan:** the spec nodes in preorder, each with its **dynamic** pattern keys only, its `ish`, its event bindings, and its repeat references (by template id).
- **a signature:** the structural fingerprint (preorder tag / `ish` / repeat shape), used later to validate cached or server-rendered templates.

**Key questions to settle then:**
- **The static-key allowlist.** Which literal keys can be baked into HTML (`className` → `class`, `textContent` → text, `id`, `title`, `hidden`, `aria*`, `dataset.*`, …) versus applied per instance.
- **`aka` at compile time.** Aliases must be applied when classifying keys, and templates keyed by config + `aka`.
- **Escaping rules** for baked text and attributes.
- **The walk contract:** a clone's elements in document order ↔ plan nodes in preorder. Repeat containers are empty in their template; `template`-tag children are reached through `.content`.

**Tests:** equivalence. `compileTree` HTML parsed + plan applied ≡ today's `createNode` output, for every scenario in `tests/tree.html`.
