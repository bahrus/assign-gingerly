# Support For Root Reference

## Bruce's Ask

This came up with the implementation of a demo for the new [Tree handler](../Handlers/Tree/TreePhaseI.md#rough-edges-the-demo-exposed):

> 3. **Children can't see the root VM.** The status badge needs `upcoming` and `success` from the root, so the adapter has to build a synthetic `status` key. That's fine with an adapter, but a root reference in patterns (for example a `$root` prefix) would make Tree usable without one.

I placed this TODO item higher in the folder structure, because this seems like a feature we want to support any time there is nested assigns, which seems like quite a few places.

I'm a bit surprised we haven't had to deal with this issue yet, but I cannot recall us dealing with, and a search for $root in the root README.md does indeed come up empty.

I'm wondering if while implementing support for this feature, we do a little forward-thinking and actually support a "stack" of from's, in case we encounter strong cases for something like $parentFrom.

Please either add your implementation notes below, or, just as welcome, mention clarifications needed below first before proceeding.

---

## Claude's Proposal + Clarifications

This is a new piece of resolver syntax that every nested call site will inherit, so I'd like you to confirm the decisions below before I implement. Each one has a recommended default, so "go with the recommendations" is enough to proceed.

### Why it hasn't come up yet

It has, but it was solved a different way: with **separate pattern blocks** rather than an inline reference.
- `manageTemplateList` has `fromHost`, a second `toClone` pattern resolved against the outer `from`.
- `addEventListener` has `fromHost` / `fromTarget` / `fromEvent`.
- itemscope managers get `ctx.from`.

Each of those is a one-off per handler, and you can't mix sources in one pattern. Tree has no such block, which is why it showed up there first.

There's also a naming neighbor: **`$0` already exists**, but it means the **target** (the first argument, after DevTools' `$0`), not a `from`. It goes through `options.root`, and it's disabled inside substitution paths.

### Proposal: a stack of `from`s

- **A new option, `fromStack?: any[]`,** on `AssignFromOptions` / `GetValuesOptions`. It holds the *ancestor* `from`s, outermost first, and doesn't include the current one.
- **A nested call site pushes when it changes `from`:**

  ```ts
  { ...options, from: value, fromStack: [...(options.fromStack ?? []), options.from] }
  ```

- **The stack tracks data nesting, not DOM nesting.** Tree's static children share their parent's value, so they don't push. Inside `rocket`'s children, `$parent` is the VM, the same as for the `rocket` element itself.
- **Two new references** (all names are subject to Q1):

  | Reference | Resolves to | With no stack (top-level call) |
  |---|---|---|
  | `$root?.upcoming` | `fromStack[0]` | `from` (at the top, `from` *is* the root) |
  | `$parent?.upcoming` | `fromStack.at(-1)` | `undefined` (there is no parent) |

  Both work everywhere a `?.` path or `$0` works today: inside `!`/`!!` negation, with `aka`, with `withMethods`, and with substitutions applied to the rest of the path. Like `$0`, they're disabled *inside* substitution paths.
- **The stack is general**, so a later `$up(n)`-style reference only needs syntax, not new plumbing. I wouldn't add anything beyond `$root` and `$parent` until a real case appears.

### Call sites that would push

| Site | Change |
|---|---|
| `builtIns.tree` | Push the VM when applying each key's pattern. The demo's badge could then hang off the real `success` key and read its sibling: `'textContent ?=': ['$parent?.upcoming', 'Upcoming', …]`. (A key missing from the VM, like `status`, is still skipped by Tree unless `keepNullish`, so the badge needs a real key to attach to.) |
| `builtIns.manageTemplateList` | Push the host `from` for each item. **See Q3**: today the per-item call uses *only* `withOptions`, so it inherits nothing from the outer options. |
| `builtIns.itemscopeTree` | Push for the `ish` assignment context, so managers that call `assignFrom` themselves can forward it (`ctx.options.fromStack`). |
| User code | Can pass `fromStack` explicitly, since it's a public option. |

Changes on the resolver side are limited to `resolve/getValues.ts`: `looksLikeReference`, `resolveReferenceString`, `getValue`'s negation check, and `resolveSubstitutions`. `resolveValues` (async) needs the same treatment, and the types go in `types.d.ts`.

### Decisions needed

1. **What syntax?**
   - **Recommended:** `$root` / `$parent`. They're readable, sit next to `$0`, and are easy to search for.
   - Alternative: `^?.x` for parent, `^^?.x` for grandparent, `$root?.x` for root. That's terser and mirrors the `!` / `!!` style, but `^^^` is hard to read.
   - Avoid DevTools' `$1`…`$4`. In DevTools they mean "previously selected elements", which would clash with `$0` meaning the target.
2. **Fallbacks.** I recommend `$root` → `from` when there's no stack, and `$parent` → `undefined` when there's none. The alternative is for both to throw, which is stricter but makes patterns that run both nested and standalone harder to reuse.
3. **Should `manageTemplateList` carry the stack through `withOptions`?** I recommend **yes**. `withOptions` isolates *capabilities* (`withMethods`, `infer`), and the stack is *data* that `fromHost` already exposes, so there's no new exposure. `fromHost` would stay, since it's still useful for a whole block. If you'd prefer per-item patterns to stay sealed off from the outer data, I'd add an opt-in instead.
4. **Should `fromStack` be public?** I recommend **yes, documented**, because user code that nests `assignFrom` calls (for example inside an `onAssigned`) otherwise can't take part. If you'd rather keep it internal, I'd name it `__fromStack` and leave it out of the docs.
5. **Scope of the first PR.** I recommend the resolver + types + docs, plus the Tree and `manageTemplateList` call sites with tests, and updating the Tree demo to drop its synthetic `status` key, which proves the feature works. The `itemscopeTree` call site and `addEventListener` (where `fromHost` has different semantics) would come later.

## Bruce's Response

Please proceed with all your recommendations, and add implementation notes below.

---

## Claude's Implementation Notes

Implemented as recommended: `$root` / `$parent`, backed by a public `fromStack` option. Both fall back when there's no stack (`$root` → `from`, `$parent` → `undefined`). Tree and `manageTemplateList` push; itemscopeTree and `addEventListener` are deferred.

### Files

| File | Change |
|---|---|
| `resolve/getValues.ts` | `$root` / `$parent` tokens, in `resolveRootReference` (which now takes `options`), `looksLikeReference`, `resolveReferenceString`, `getValue`'s `!` check, and substitution paths (where they're disabled). Exports `isFromStackReference`. |
| `assignFrom.ts` | ` ?=` ternaries accept the references (see below) |
| `processHandlerCommands.ts` | Handler `get` / `resolve` maps receive `fromStack` |
| `handlers/tree.ts` | Pushes the VM for each key's pattern |
| `handlers/manageTemplateList.ts` | Per-item patterns push the host `from`; `fromHost` keeps the host's stack |
| `types/assign-gingerly/types.d.ts` | `fromStack` on `AssignFromOptions`, `GetValuesOptions` and `ResolveValuesOptions` |
| `assignFromAsync.ts` | `fromStack` on its own `AssignFromOptions` (see "Found along the way") |
| `tests/root-reference.html`, `.spec.ts` | **New**: 14 scenarios, 32 assertions |
| `docs/root-references.md` | **New**. Also linked from the README feature list (item 10) and `docs/tree.md`. |
| `demos/tree-demo.html` | Synthetic `status` key removed (see below) |

`resolveValues` needed no change, because it delegates every non-protocol string to `getValue`.

### Behavior

- **Only exact tokens count:** `$root` / `$parent` must be the whole string or be followed by `?.`. `'$rootless'` stays a literal (tested).
- **They work everywhere `?.` does:** arrays, nested objects, `!` / `!!`, `aka` and `withMethods` in the rest of the path, `getValue` / `getValues` / `resolveValues` with `{ fromStack }`, and handler `resolve` maps.
- **Nested handlers compose.** A tree inside a tree's pattern sees `$root` = the outer VM and `$parent` = the enclosing key's value (tested). The same goes for a `manageTemplateList` inside a Tree `<ul>`, as in the demo.

### Found along the way

1. **` ?=` ternaries only recognized `?.` paths and protocols.** They didn't accept `$0` or `!` either; that's a pre-existing limitation. The demo's badge needs `$parent` in a ternary, so `resolveTernaryValue` and `isNestedTernary` now accept `$root` / `$parent` and pass `fromStack`, in conditions, comparison operands and nested-ternary heads (tested). I left `$0` and `!` in ternaries as they were. Say if you'd like those aligned too.
2. **`AssignFromOptions` is defined twice**: once in `types.d.ts`, and again in `assignFromAsync.ts`, which is the one `processHandlerCommands` imports. I added `fromStack` to both instead of consolidating them, to keep this change focused. Merging them into `types.d.ts` (per AGENTS.md) would be a good small follow-up.
3. **A key missing from the VM is still skipped by Tree.** So the demo's badge now hangs off the **real `success` key** and reads `$parent?.upcoming`:

   ```js
   success: ['span', {
       'textContent ?=': ['$parent?.upcoming', 'Upcoming', ['?.', 'Success', 'Failure']],
       'className ?=': ['$parent?.upcoming', 'badge pending', ['?.', 'badge ok', 'badge bad']],
   }],
   ```

   One behavioral difference from before: a launch with `success: null` now has no badge at all, where it used to show "Unknown". `keepNullish` would bring it back, but it applies to the whole config.

### Verified

- `tsc` is clean, in a scratch copy of the repo; I didn't touch any `.js`. Your `tsc --watch` has rebuilt the affected modules.
- New tests: **32/32** in Chromium, Firefox and WebKit.
- **Full suite: 120 passed, 0 failed** across all three browsers.
- Tree demo: re-checked in all three browsers against your dev server. The badge renders from `success` + `$parent?.upcoming`, every rerun still reuses 45 of 45 elements, and there are no console errors.