# Attribute Operator: ` :=`

## Background

This came out of the compile roadmap ([Step 2](../Handlers/Tree/TODO/Compile/Step2-CompileTree.md)). Benchmarks showed that baking static values into a template makes construction **~1.7–2.3× faster** than applying them after cloning. Rather than guess which properties have an equivalent attribute (an allowlist), we let developers set attributes explicitly. A literal `:=` is then unambiguously bakeable, and attributes with no property equivalent (`itemprop`, `part`, `for`-style token lists, custom `data-*`) become directly settable.

This is a **core feature**: it lives in `assignGingerly`, so it works everywhere (`assignGingerly`, `assignFrom` / `assignFromAsync`, Tree, event vectors, `manageTemplateList` items).

## Decisions (settled in Step 2, "Bruce's Response II")

| # | Decision |
|---|---|
| 1 | The operator is **` :=`** (a suffix, like ` +=` / ` =&`) |
| 2 | Values: string / number → `setAttribute(name, String(v))`; `true` → `''`; `false` / `null` / `undefined` → `removeAttribute(name)`; **arrays → space-joined tokens** (e.g. `aria-describedby`, `for`, `part`) |
| 3 | **`on*` attribute names are always refused**, even without a permission processor (the error points to ` +=` event binding) |
| 4 | **No `className` exception:** `class :=` is the way to set (and, in compiled Trees, bake) classes |
| 5 | Tracked here, as its own step, before resuming Step 2 |

## Proposed spec

### Syntax

```js
assignGingerly(input, { 'type :=': 'number', 'aria-label :=': 'Quantity', 'required :=': true });
assignFrom(form, { '?.querySelector?.input?.aria-describedby :=': ['?.hintId', '?.errorId'] }, { from: vm, withMethods: ['querySelector'] });
```

- **The LHS:** the **last segment is the attribute name**. Everything before it is a normal path to the element (with `withMethods`, `aka`, `@each`, and method-argument segments: `'?.querySelector?.input?.type :='`). A bare `'type :='` targets the target itself.
- **Attribute names** may contain `-`, `:` and `.` (no `?.` inside a name). `aka` applies to path segments as usual. **Should it apply to the attribute name itself?** (Open question 1.)

### Semantics

| RHS (after resolution) | Effect |
|---|---|
| string | `setAttribute(name, value)` |
| number / bigint | `setAttribute(name, String(value))` |
| `true` | `setAttribute(name, '')` |
| `false`, `null`, `undefined` | `removeAttribute(name)` |
| array | Filter out `null` / `undefined` / `false`, then `setAttribute(name, items.join(' '))`. An empty result → `removeAttribute(name)` (open question 2) |
| object / function / symbol | Not assigned; dev-mode `console.warn` |

- **Non-`Element` targets:** the path resolves to something that isn't an `Element` → skipped, with a dev warning (no throw, consistent with how other operators treat missing targets).
- **The `on*` guard:** any name matching `/^on/i` throws `assignGingerly: ' :=' refuses event-handler attribute "onclick"; use ' +=' with { on: 'click', … }`.
- **Permissions:** before setting *or removing*, `permissionProcessor?.checkRestrictedAttributeCall('setAttribute', [name, value])` is consulted (the attribute-specific check that already guards `setAttribute` method calls; *corrected during implementation*, it was `redirectRestrictedProp` in the draft). So `strictDefaultPermissions` (`xssSensitiveAttrs`, the URL checks) covers `:=` with no new configuration.

### Where it's handled

| Entry point | How |
|---|---|
| `assignGingerly` | A new branch next to ` +=` / ` -=` / ` =!` (`isAttrCommand` / `parseAttrCommand`) |
| `assignFrom` / `assignFromAsync` | ` :=` keys are "normal" keys: RHS paths resolve via `getValues` / `resolveValues`, then `assignGingerly` applies them. **Arrays resolve element by element** (they already do in `getValues`). |
| `@each` paths | Via `applyCommandToEach`, like other operators |
| Tree's fast path (`handlers/tree.ts`) | Extend `compileFastPattern` to accept ` :=` keys with literal / `?.`-path values (or arrays of those), so attribute keys don't fall back to the slow path |
| Compiled Trees (Step 2) | A literal ` :=` value is **baked** into the template; dynamic values are applied per instance |

### Docs

- **README:** add ` :=` to the operator table, plus a short section.
- **A new `docs/attribute-operator.md`:** syntax, semantics table, security (the `on*` guard, permissions), and **performance guidance**: in compiled Trees, statics written as `:=` (and text) are free at creation; statics written as properties cost per instance.
- **`docs/tree.md`:** mention ` :=` in patterns.

### Tests (a new `tests/attribute-operator.html` + spec)

- Each value type (string, number, `true`, `false` / `null` / `undefined` removal, array join including nullish filtering and empty → remove)
- Bare LHS; nested path; method-argument path (`'?.querySelector?.input?.type :='`); `@each`
- The `on*` guard throws (including mixed case `onClick`)
- With a permission processor (`strictDefaultPermissions`): a restricted attribute is redirected / blocked
- Through `assignFrom` (paths in the value and inside arrays), `assignFromAsync`, Tree (literal and bound; rebind updates; `false` removes), and an event vector (`toLHS: { 'aria-pressed :=': true }`)

## Open questions

1. **Should `aka` apply to the attribute name** (the last segment)? Consistency says yes. It allows `aka: { lbl: 'aria-label' }`.
2. **Should an empty array (after filtering) remove the attribute,** or set it to `''`? I'd say remove (it matches `false` / `null`).
3. **Does a dev-mode hint belong here or in Tree?** I.e. warning that a literal property like `className: 'card'` could be `'class :=': 'card'` and be baked. I'd put it in the compiled-Tree path (Step 2/3), where it actually matters.

## Status

Implemented. See the implementation notes at the end.

## Bruce's Response

Open questions

1.  I agree, yes.
2.  I agree, remove.
3.  I agree, the performance benefits seem to only matter in the context of turning into a template.

Please implement and add implementation notes below.

## Claude's Implementation Notes

Implemented as specified, with your three answers: `aka` applies to the attribute name; an empty array (after filtering) removes the attribute; the "bake-able attribute" hint is deferred to the compiled-Tree path.

### Changes

| File | Change |
|---|---|
| `assignGingerly.ts` | `isAttrCommand` / `parseAttrCommand`, a new **` :=` branch** in the first pass (before ` +=`), and an exported **`applyAttribute(element, name, value, permissionProcessor?)`** holding the value semantics, the `on*` guard and the permission check, so Tree's fast path can reuse it. `@each` goes through the existing `applyCommandToEach`. |
| `assignGingerly.ts` | A new **`getValueAtPath`** (navigate a path, return whatever is at its end; stops at `null` / `undefined`). `getIterableAtPath` is now a thin wrapper around it. **The reason:** `getIterableAtPath` returns `undefined` for anything that isn't iterable, so ` :=` paths to elements silently failed in testing. (A `<form>` only "worked" because forms are iterable.) **A side effect:** an `@each` path with a null *intermediate* segment used to throw a `TypeError` inside `getIterableAtPath`; it now just finds nothing to iterate. |
| `handlers/tree.ts` | **The fast path accepts ` :=` keys:** a plain attribute name (`/^[A-Za-z_:][\w:.-]* :=$/`) with a literal or `?.`-path value, **or an array** of those. They're applied through `applyAttribute`, so the semantics are identical to the slow path. Literal attribute entries (including all-literal arrays) are skipped on rebind like other literals. Tree's `aka` applies to attribute names. I also put the fast-path doc comment back on `applyFast` (an earlier edit had separated them). |
| `docs/attribute-operator.md` | **New:** syntax, values table, security, and performance guidance for Tree templates |
| `README.md` | An operator-table row, and feature-list item 12 |
| `docs/tree.md` | "Patterns set properties" now points to ` :=`, recommending literal ` :=` for statics |

**One correction to the spec during implementation:** the permission check uses `permissionProcessor.checkRestrictedAttributeCall('setAttribute', [name, value])`, not `redirectRestrictedProp`. That's the existing attribute-specific check (it already guards `setAttribute` method calls), and it reads the restriction map's *attribute* entries (`{ props: […], attr: true }`), which is what `strictDefaultPermissions` populates for URL attributes. It's applied to removals too, so a restricted attribute can't be stripped through ` :=` either.

### Behavior details worth knowing

- **Aliasing the attribute name:** `assignGingerly` aliases whole keys *before* parsing commands, so the last segment still carries the suffix (`'lbl :='`) and wouldn't match `aka: { lbl: … }`. The ` :=` branch therefore aliases the parsed name itself.
- **The `on*` guard** matches `/^on/i` and throws, suggesting the ` +=` equivalent (`{ on: 'click', … }`).
- **Non-element targets and unsupported values** (objects, functions, symbols) warn and skip, without throwing.

### Tests: a new `tests/attribute-operator.html` (+ spec), 12 scenarios, 36 assertions

1. Value semantics (string, number, `true`, `false` / `null` / `undefined` removal)
2. Arrays (joining, filtering, empty → removed)
3. Attributes with no property (`itemprop`, `part`)
4. Paths: nested property, method argument, `@each`
5. `aka` on the attribute name
6. The `on*` guard (`onclick`, `onClick`, through a path)
7. `strictDefaultPermissions`: `javascript:` blocked with a warning, same-domain allowed
8. A non-element target and an object value: warn, no throw
9. `assignFrom` (paths, paths inside arrays, `!` negation) and `assignFromAsync`
10. Tree's fast path: literal, bound, boolean and array attributes; rebind updates; `false` removes
11. Tree's slow path (forced by `withMethods`), with the tree's `aka` on the attribute name
12. An event vector (`toLHS: { 'aria-pressed :=': true }`)

**Results:** 36 / 36 in Chromium, Firefox and WebKit. **Full suite: 127 passed, 2 skipped, 0 failed.** `tsc` is clean, in a scratch copy; no `.js` touched (the repo's `.js` is stale until you rebuild).

### Next

Per the roadmap: **1d** ([JoinTextBaking.md](../Handlers/Tree/TODO/Compile/JoinTextBaking.md), benchmark then build or discard) and **1e** ([MicroJoin.md](./MicroJoin.md)), then back to Step 2, where literal ` :=` values become baked attributes.


