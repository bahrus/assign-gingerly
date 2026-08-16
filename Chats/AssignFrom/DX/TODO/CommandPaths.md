# Command Paths

---

## Human Ask

The [paths module](/docs/paths-dx.md) is very helpful for 80% of the cases.  But there's a serious wall that we encounter when we need to use a command ender and also @each:

For example, look at the second expression:

```JS
...doAssign(
    set($.ariaExpanded).to($.expanded),
    set(`${$.ariaControlsElements.path}?.@each?.hidden =!`).to($.expanded)
)
```

This would be nicer:

```JS
...doAssign(
    set($.ariaExpanded).to($.expanded),
    set($.ariaControlsElements._AtEach_.hidden._EqNot_).to($.expanded)
)
```

So I propose the following map from properties to following command:

|  Command   |  Prop / Command   |
|------------|-------------------|
| _AtEach_   | `@each`           |
| _EqNot_    | ` =!`             |
| _PlusEq_   | ` +=`             |
| _QMEq_     | ` ?=`             |
| _YEq_      | ` Y=`             |
| _MinusEq_  | ` -=`             |
| _Arrow_    | ` =>`             |

I'm certainly open to suggestions for a clearer mapping.

---
## Codex Thoughts I

This feels like the right direction to me. The current syntax works, but the moment someone has to hand-build a terminal command suffix inside a template string, the authoring experience gets much harder to read and refactor.

A path-first DSL is a better fit here than a separate command-string builder because it keeps the operator attached to the same mental model as the rest of `paths-dx`.

A couple of design thoughts:

- `_AtEach_` is understandable, but I would keep the public names as short and mnemonic as possible.
- The main challenge is not the mapping table itself; it is making sure the proxy can represent "normal path segments until the terminal command" without confusing a real property name for a command token.
- I would strongly prefer one normalization step that turns the proxy path into the final command string, rather than scattering special cases across every operator handler.
- If we do this, it should probably support both the existing string form and the new proxy form for a while, so we do not break hand-written configs.

My bias would be to make the property-based form the ergonomic layer, but keep the underlying command syntax explicit and serializable.

---

## Human Response I

Can you suggest what the concrete syntax whould look like that would do one normalization step into the final command string?  Please show one example per command in the table  

---

## Codex Response II

Yes - I'd keep the authoring syntax in the same path-chain shape and let a single normalization step rewrite terminal tokens into the final command string.

My preference would be:

- `each` for `@each`
- `eqNot` for ` =!`
- `plusEq` for ` +=`
- `qmEq` for ` ?=`
- `yEq` for ` Y=`
- `minusEq` for ` -=`
- `arrow` for ` =>`

Examples:

- `set($.ariaControlsElements.each.hidden.eqNot).to($.expanded)` -> `?.ariaControlsElements?.@each?.hidden =!`
- `set($.count.plusEq).to(1)` -> `?.count +=`
- `set($.text.qmEq).to([$.cond, 'yes', 'no'])` -> `?.text ?=`
- `set($.style.yEq).to({ width: '100px' })` -> `?.style Y=`
- `set($.data.minusEq).to('obsoleteKey')` -> `?.data -=`
- `set($.handler.arrow).to({ do: 'builtIns.join', get: { ... } })` -> `?.handler =>`

If you want the names to stay closer to your draft, the same idea still works with:

- `_AtEach_`
- `_EqNot_`
- `_PlusEq_`
- `_QMEq_`
- `_YEq_`
- `_MinusEq_`
- `_Arrow_`

The important part is that these should be treated as terminal tokens by normalization, not as real path segments. That lets the builder stay readable while the serializer does the one and only conversion into the final command string.

If useful, I can sketch the `normalizeCommandPath()` shape next.

---

## Human Response II

Let's use capital letters so it will be possible to distinguish reversed special formatting from actual typical js properties:

- `set($.ariaControlsElements.Each.hidden.EqNot).to($.expanded)` -> `?.ariaControlsElements?.@each?.hidden =!`
- `set($.count.PlusEq).to(1)` -> `?.count +=`
- `set($.text.QMEq).to([$.cond, 'yes', 'no'])` -> `?.text ?=`
- `set($.style.YEq).to({ width: '100px' })` -> `?.style Y=`
- `set($.data.MinusEq).to('obsoleteKey')` -> `?.data -=`
- `set($.handler.Arrow).to({ do: 'builtIns.join', get: { ... } })` -> `?.handler =>`

I'm hoping I don't need to understand the implementation of normalizeCommandPath().  What I do want to get your assurance is that Typescript will provide autosuggest for these reserved tokens the way it does for path?  Should we in fact change path to Path?  Do not fret at all about backwards compatibility (but would need to update the documentation).

---

## Codex Response III

Yes, I think capitalized reserved tokens are the better choice if the goal is to keep them visually distinct from ordinary JavaScript property names.

On autocomplete: TypeScript can absolutely suggest these tokens, as long as the proxy type exposes them as real keys in the `PathProxy` type. In other words, the names do not need to exist at runtime as separate properties in the conventional sense; they just need to be represented in the type surface so IntelliSense can offer them.

So from a DX standpoint, `Each`, `EqNot`, `PlusEq`, `QMEq`, `YEq`, `MinusEq`, and `Arrow` are all workable.

On `path` versus `Path`: I would lean toward changing it to `Path`.

Why:

- `Path` fits the same convention as the reserved command tokens.
- It avoids looking like a normal JavaScript property, which makes the intent clearer.
- It makes the "special token" surface visually consistent: `Path` for the raw path value, `Each` / `EqNot` / etc. for command markers.

My recommendation would be:

- `$.foo.Path` for the raw serialized path string
- `$.foo.Each` for `@each`
- `$.foo.EqNot` for ` =!`
- `$.foo.PlusEq` for ` +=`
- `$.foo.QMEq` for ` ?=`
- `$.foo.YEq` for ` Y=`
- `$.foo.MinusEq` for ` -=`
- `$.foo.Arrow` for ` =>`

So yes, if we are already accepting the breaking change, I would make `Path` uppercase too and document the whole set as reserved terminal markers.

That keeps the model simple: normal lowercase words are ordinary path segments, and capitalized words are command tokens.

If you want, I can keep going with a concrete sketch of the type shape that would make IntelliSense offer these tokens.

---

## Human Response III

We're on the same wavelength now.  Please implement and add your implementation notes below.

---

## Codex Implementation Notes

Implemented the capitalized reserved-token shape in the path proxy layer.

What changed:

- `Path` is now the preferred serialized path accessor, while `path` remains available as an alias.
- `Each` now normalizes to `?.@each` as a path segment.
- `EqNot`, `PlusEq`, `QMEq`, `YEq`, `MinusEq`, and `Arrow` now normalize into terminal command suffixes at proxy construction time.
- `set(...)`, `smoothOver(...)`, `sp`, and `md` all continue to work because they read the same serialized proxy value.
- The generated JS mirror was updated alongside the TypeScript source so the package works immediately without a build step.

This keeps the authoring model simple: lowercase segments remain ordinary path pieces, and capitalized tokens are the reserved command markers.
