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
