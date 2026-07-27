---
inclusion: auto
---

# Destructuring Style Rule

When an `options`, `config`, or any parameter/object is accessed 2+ times in the same scope, destructure the needed fields at the top of that scope.

## Rules

- **Destructure early** — if you'll reference `options.withMethods`, `options.aka`, `options.protocols`, etc. more than once in a function or block, pull them into local variables via destructuring at the top.
- **Prefer local variables** — repeated property access (`obj.prop`) is both more verbose and slightly slower than a local variable. Destructuring reduces footprint and improves readability.
- **Apply to loops especially** — in hot paths (iteration over many items), local variables eliminate repeated property lookups.
- **Don't destructure if used only once** — a single `options.from` access doesn't need destructuring.

## Example

```JS
// Good — destructured at top of scope
const { withMethods, aka, protocols, from } = options;
const resolved = getValues(pattern, from, { withMethods, aka, protocols });
assignGingerly(target, resolved, { withMethods, aka });

// Avoid — repeated options.X access
const resolved = getValues(pattern, options.from, { withMethods: options.withMethods, aka: options.aka, protocols: options.protocols });
assignGingerly(target, resolved, { withMethods: options.withMethods, aka: options.aka });
```
