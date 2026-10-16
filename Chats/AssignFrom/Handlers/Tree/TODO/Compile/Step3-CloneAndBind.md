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

## Bruce's Feedback

Can you please now flesh out more details, including your recommendations for the key questions?

## Claude's Design

### Summary

- **API:** `compile: true`. A string name is accepted, but it only matters in Step 5.
- **Cache:** compiled trees are cached in a module-level `WeakMap` keyed by the config's `map` object, with one variant per `aka` and permission processor.
- **Staleness:** each compiled node records the spec it came from. Tree uses the template **only while `compiledNode.spec === spec`**, otherwise it falls back to `createElement`. That identity check makes stale templates impossible without any signature work on the client.
- **Instances:** `document.importNode(template.content, true)`, then **two passes**:
  1. pair each element of the clone with its compiled node;
  2. bind in preorder, as today.
- **Rebinding is untouched.**

### API

```js
{ do: 'builtIns.tree', compile: true, map: { … } }
```

- **`compile: true`** turns on clone-and-bind for this tree.
- **`compile: 'launch-card'`** (a string) does the same. In Step 5 the name will also be used to look up server-rendered `<template id="tree:launch-card">`s, so I'd accept it now but give it no other meaning yet.
- **Default: off,** until Step 4's go / no-go.

`TreeConfig` gains `compile?: boolean | string`, documented as experimental.

### Key question 1: where the template registry lives → a module-level `WeakMap`, keyed by `map`

What a compiled tree depends on:
- **the spec:** the `map` object and everything it references;
- **the effective `aka`:** it decides which keys are text;
- **the permission processor:** via `canBake`;
- **the sample VM and `pipes`:** these only choose `microJoin` shells, and a wrong guess is safe, so they're **not** part of the key. The first call's VM is the sample.

How it's stored:
- **The cache is `WeakMap<map, Variant[]>`.** Each variant holds `{ akaKey, permissionProcessor, compiled, built }`:
  - `akaKey` is the merged `aka`, serialized;
  - `built` holds the `<template>` elements, built lazily per template id with `buildTemplate`.
- **Specs normally live in module scope,** so this is one compile per spec per page. If a config's `map` is an **inline literal** recreated on every call, the cache misses and Tree compiles on every call. Compiling costs about as much as creating one instance, so this only matters for trees with very few nodes, and Step 4 will measure it. The docs will say: "define the map once".
- **Not per document, `ShadowRoot` or scoped registry.** The templates live in their own inert document, and `importNode` brings them into whichever document the target is in (`target.ownerDocument`). Custom-element definitions are looked up at import time, as at `createElement` time today. Today's Tree also creates elements with `document.createElement`, i.e. against the global registry, even inside shadow roots, so this changes nothing. Managers (`ish`) still resolve through the target's registry, per instance, exactly as now.

### Key question 2: `importNode` vs. `cloneNode` → `importNode` into the target's document

|  | `cloneNode` (in the template's inert document) | `importNode` (into the target's document) |
|---|---|---|
| Custom elements | **Not upgraded** until inserted into a document. Tree's per-instance properties would be set on plain `HTMLElement`s and **shadow the class's setters** (the classic "lazy property" bug). | **Upgraded before `importNode` returns** (it runs custom-element reactions on return), so properties go through the class's setters, as with `createElement` today. |
| Cost | Possibly a little cheaper | Step 4 measures it. B4's benchmarks used `importNode`-equivalent clones. |

**Differences from today** (to document):
- All constructors in an instance run *before* any pattern is applied. Today, a parent's pattern runs before its children are created.
- Baked attributes are present at construction, so they arrive through `attributeChangedCallback` during the upgrade, rather than after.

Both match how server-rendered HTML behaves, which is where Step 6 goes anyway.

### Key question 3: invalidation → node-level spec identity on the client; signatures only for Step 5

- **Every `CompiledNode` already records `spec`,** the exact object it was compiled from. `createNode` uses the template only when the spec it's given *is* that object.
  - A changed or rebuilt spec (a new `map`, a new child array, a manager swap) **falls back to today's `createElement` path** for that subtree.
  - Rebinding is unchanged, so the existing structure checks (tag, `ish`, child count) still decide what's rebuilt.
- **What it can't catch:** a spec or pattern object **mutated in place** after compiling (e.g. `pattern.textContent = 'new literal'`). Tree's literal-skip on rebind (Step 1b) already assumes patterns aren't mutated, so this is the same rule, now documented for creation too: *treat specs as immutable; to change one, replace the object.*
- **Signatures** aren't checked on the client in Step 3, because the client always compiles what it uses. They're for Step 5, where templates come from the server.

### Key question 4: wildcard keys, and keys that appear or disappear

- **Keys appearing / disappearing:** no change. A new key goes through `syncNode` → `createNode`, which now clones. A removed key's element is removed as today. `keepNullish` stamps the template with a null `from`, and dynamic keys resolve to `undefined`, as today.
- **`'*'`:** compiled once, as template `'*'`, and every unmatched key stamps it.
  - **One fix is needed:** `getEntries` currently synthesizes a *new* spec array (`[header, pattern, children]`) for each wildcard key on every call. That breaks the identity check, and also needlessly defeats `syncNode`'s cheap paths.
  - That synthesized spec doesn't depend on the key, so I'll build it **once per wildcard spec** (cached in a `WeakMap`) and share it between Tree and the compiler.

### Creating a node from a template

`createNode(spec, value, options, permissionProcessor)` checks `options[TREE_COMPILED]?.nodeFor(spec)` (see below). When there's a match:

1. **Clone:** `const root = target.ownerDocument.importNode(built(id).content, true).firstElementChild`.
2. **Pair (pass 1):** walk the compiled node tree and the clone together:
   - the element children of each element (or of `.content` for a `template`) match `children` in order;
   - this builds every `TreeNode` (`tag`, `ish`, `element`, `spec`, `container`, `children`, `compiled`);
   - nothing runs yet. Pairing first means a manager, a custom element or a pattern can't disturb the walk.
3. **Bind (pass 2, preorder,** as in `createNode` today**):** for each node:
   - **attach the manager** (`ish`), which sees baked attributes already present;
   - **apply the node's `dynamic` keys** through the usual `applyPattern` (fast path, events with their default dedup keys, ops), skipping nothing;
   - **set `appliedPattern` to the node's *full* `pattern`,** so the next rebind skips its literals, which were baked;
   - **recurse into its children;**
   - **re-append if needed:** if a dynamic `textContent` / `innerHTML` replaced the element's content, re-append its children. `bindContent` already does this on rebind, and it gives the same result as today: the text, then the children.
4. **Repeats:** `bindRepeat` is unchanged, except that `syncNode` / `createNode` for items and `empty` receive the compiled `each` / `empty` templates, through the node's `compiled.repeat` ids.

**How the compiled tree reaches nested calls:** `TreeHandler.assign` puts the variant into the nested options under a symbol (`TREE_COMPILED`), as it already does for `TREE_TARGET`. Repeats and managers' `ctx.rebind()` pass options along already.

**`TreeNode` gains `compiled?: CompiledNode`.** That's all the structure that changes.

### Permissions (`canBake`)

When the tree has a permission processor, `canBake = (name, text) => !pp.checkRestrictedAttributeCall('setAttribute', [name, text]).blocked`. I checked: that method's only side effect is a **once-per-attribute warning**. Calling it at compile time just moves that one warning earlier. The refused key stays per instance, where the runtime check is then silent, since it has already warned. So it's the same single warning as today, and no new API is needed.

### Tests

- **`tests/tree.html` runs twice:** as is, and with `?compile` in the URL. In compile mode, the page wraps `assignFrom` / `assignFromAsync` so every `{ do: 'builtIns.tree', … }` config gets `compile: true`. That's test-only, with no library hook. `tree.spec.ts` gets a second test that loads `tree.html?compile`.
- **No expected values change.** I checked: `tree.html` compares no `innerHTML` / `outerHTML` strings, so the attribute-order difference (baked attributes first) can't show up.
- **New, in `tests/compile-tree.html`:**
  - templates are cloned (the element isn't built by `createElement`, so baked attributes are present without a pattern run);
  - rebind skips baked literals;
  - a replaced spec falls back to `createElement`;
  - the wildcard's shared spec;
  - `microJoin` shells filled in place on the first stamp;
  - a custom element is upgraded before its properties are set;
  - `canBake` with a strict permission processor;
  - an inline map compiled on every call still renders correctly.
- **Equivalence harness:** the Step 2 test harness is replaced by the real thing. The equivalence tests then compare `compile: true` against `compile` off through Tree itself.

### Not in Step 3

- Server templates and signature checks (Step 5);
- sparse `TreeNode`s (Step 4, only if needed);
- making `compile` the default (Step 4).

### Questions for you

1. **`compile: true` now, with the name's meaning deferred to Step 5,** or require a name from the start?
2. **Is "treat specs as immutable" acceptable** as the documented rule? The alternative is re-validating specs per call, which costs about what compiling saves.
3. **The constructor-timing difference:** all constructors in an instance run before any pattern. Is documenting it enough, or should compile mode skip specs containing custom elements (tags with a `-`)? I recommend documenting it. It matches server-rendered markup, and properties still go through setters, because elements are upgraded before binding.

## Bruce's Response I

The answer to question 1 sounds good.

On question 2, can you construct a simple test page to prove that importNode upgrades before it returns?  That doesn't sound right, but you're probably right, I just want to confirm.  Part of my doubts stem from the existence of [upgrade](https://developer.mozilla.org/en-US/docs/Web/API/CustomElementRegistry/upgrade).


> 1. **`compile: true` now, with the name's meaning deferred to Step 5,** or require a name from the start?

I'm afraid I don't know what you are referring to as "name's meaning".  Which name?

> 2. **Is "treat specs as immutable" acceptable** 

Yes

> 3. **The constructor-timing difference:** 

Document it only.

## Claude's Response I

### `importNode` upgrades before it returns: confirmed

I added **[`tests/import-node-upgrade.html`](../../../../../../tests/import-node-upgrade.html)** (+ spec). **13 / 13 checks pass in Chromium, Firefox and WebKit.**

**Setup:**
- a custom element `x-probe` with a logged constructor, an `attributeChangedCallback`, and a `label` setter;
- a template built the way `buildTemplate` builds one: `<x-probe data-baked="yes">` created in the template's inert document.

| Copy made with | Upgraded before Tree sets properties? | What happened |
|---|---|---|
| `document.importNode(template.content, true)` | **Yes.** | Upgraded by the time `importNode` returns, while still disconnected. The constructor and `attributeChangedCallback(data-baked)` have already run, and a property set right afterwards goes through the class's setter. |
| `template.content.cloneNode(true)` | **No.** | The clone stays in the inert document, which has no custom-element registry. A property set now becomes an **own property**. When the element is later inserted into the page and upgraded, that own property **shadows the setter, which never runs** (the "lazy property" bug). |
| `cloneNode` + `customElements.upgrade(clone)` | **Still no.** | `upgrade()` looks up definitions in the element's own document, and that's the inert one. |
| `document.createElement('x-probe')` (Tree today) | Yes, immediately. | For comparison. |

**Why `importNode` works:**
- It copies the nodes **into the page's document**, and the page's document has the definitions.
- It's one of the DOM methods that run pending custom-element reactions just before returning, upgrades included.

**Where `customElements.upgrade()` fits** (the page shows this too): it's for elements that already belong to a document with the definition but were **created before `define()`** and aren't connected yet. Connecting would upgrade them anyway, and `upgrade()` lets you do it earlier. `importNode` creates its copies *after* `define()`, in the page's document, so it doesn't need it.

**One caveat:** a custom element **defined later** than the instance is stamped behaves the same way under both approaches: it isn't upgraded until definition and connection. That's also what happens today with `createElement`, so it isn't a new issue.

### "Which name?"

Sorry, that was unclear. I meant the **value of the `compile` option**. My design allows either:
- `compile: true`: just "turn compiling on";
- `compile: 'launch-card'`: a string you choose.

**The string would only do something in Step 5.** There, the server writes the compiled templates into the page as `<template id="tree:launch-card">…`, and the client finds them by that string, so even the first instance is a clone.

In Step 3 there's nothing to look up yet, so the question was: should Step 3 already *require* a string, so configs are written once and work unchanged when Step 5 arrives? Or accept `true` now and add the string in Step 5?

My recommendation stands: **accept both now**, with a string behaving exactly like `true` until Step 5. Your answer to question 1 (registry) and your "yes" to immutable specs fit either way.

### Status

- Constructor timing: will be documented only, per your answer.
- Immutable specs: will be documented.

Unless you'd rather settle the `compile` value differently, I'm ready to implement Step 3 as designed.

## Bruce's Response II

Okay, I agree with all your recommendations.  Please proceed with implementing, and add your implementation notes below.