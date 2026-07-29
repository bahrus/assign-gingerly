# Project Guidance

This file carries over the coding guidance previously maintained in `.kiro/steering/`.
Kimi Code reads these `AGENTS.md` instructions when working in this repository.

## Destructuring Style

When an `options`, `config`, or any parameter/object is accessed 2+ times in the same scope, destructure the needed fields at the top of that scope.

- **Destructure early** — if you'll reference `options.withMethods`, `options.aka`, `options.protocols`, etc. more than once in a function or block, pull them into local variables via destructuring at the top.
- **Prefer local variables** — repeated property access (`obj.prop`) is both more verbose and slightly slower than a local variable. Destructuring reduces footprint and improves readability.
- **Apply to loops especially** — in hot paths (iteration over many items), local variables eliminate repeated property lookups.
- **Don't destructure if used only once** — a single `options.from` access doesn't need destructuring.

```typescript
// Good — destructured at top of scope
const { withMethods, aka, protocols, from } = options;
const resolved = getValues(pattern, from, { withMethods, aka, protocols });
assignGingerly(target, resolved, { withMethods, aka });

// Avoid — repeated options.X access
const resolved = getValues(pattern, options.from, { withMethods: options.withMethods, aka: options.aka, protocols: options.protocols });
assignGingerly(target, resolved, { withMethods: options.withMethods, aka: options.aka });
```

## Types Location

All exported TypeScript interfaces and types must be defined in `types/assign-gingerly/types.d.ts`.

- **Exported interfaces and types** go in `types/assign-gingerly/types.d.ts` — not inline in the module files.
- Module files (`.ts`) should **import types** from `types/assign-gingerly/types.d.ts` (or `types.js` for the path) rather than defining them locally.
- **Type-only exports** (`export type { ... }`) from module files are acceptable as re-exports for consumer convenience, but the definition lives in `types.d.ts`.
- **Internal/private types** (not exported from the package) may remain in their module file if they're only used locally.

## Coding Best Practices

### Element Tag Name Comparison

When comparing element tag names, use `element.localName` instead of `element.tagName.toLowerCase()`.

- `localName` is already lowercase (returns the local part of the qualified name).
- More efficient (no string conversion needed).
- Cleaner and more readable code.
- Standard practice in modern web development.

```typescript
// Avoid
const tagName = element.tagName.toLowerCase();
if (tagName === 'input') { /* ... */ }

// Prefer
const tagName = element.localName;
if (tagName === 'input') { /* ... */ }
```

For XML/XHTML documents with namespaced elements, `localName` returns just the local part (e.g., `'div'` from `'html:div'`), while `tagName` returns the full qualified name. For HTML documents, they're functionally equivalent except for the casing.

### When to Use Each Property

- **`localName`**: Use for tag name comparisons in HTML documents (recommended).
- **`tagName`**: Use when you need the original casing (rare) or working with XML namespaces.
- **`nodeName`**: Use when working with any node type (not just elements).

### Implementation Example

From `parseWithAttrs.ts`:

```typescript
const { localName } = element;
const isCustomElement = localName.includes('-');

switch (localName) {
    case 'input':
        // Handle input elements
        break;
    case 'textarea':
        // Handle textarea elements
        break;
    // ... more cases
}
```

## Markdown-Only Changes

When changes are made exclusively to markdown files (`*.md`), there is no need to:

- Recompile TypeScript (`npx tsc`).
- Run tests (`npm test`).

Markdown files are documentation only and do not affect the compiled code or test results.

This applies to:

- `README.md`
- `TESTING.md`
- `TEST_SUMMARY.md`
- Files in `requirements/`.
- Files in `bugs/`.
- Any other `*.md` files.

If changes include both markdown files **and** code files (`*.ts`, `*.js`), then compilation and testing are still required.
