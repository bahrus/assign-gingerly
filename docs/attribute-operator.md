# Attribute Operator (` :=`)

Most keys in a pattern set **properties**. The ` :=` operator sets **attributes**:

```JavaScript
assignGingerly(input, {
    'type :=': 'number',
    'aria-label :=': 'Quantity',
    'required :=': true,
});
// <input type="number" aria-label="Quantity" required="">
```

Use it for attributes that have no property equivalent (`itemprop`, `part`, `slot` on non-slottable elements, custom `data-*`, token lists like `aria-describedby`), and for static values in [`builtIns.tree`](./tree.md) patterns, where it has a performance benefit (see below).

## Syntax

```JavaScript
'<path> :=': value
```

- **The last path segment is the attribute name.** Everything before it is a normal path to the element: `withMethods`, `aka`, method-argument segments and `@each` all work.
- **A bare name targets the target itself:** `'title :='`.
- **`aka` applies to the attribute name too:** `aka: { lbl: 'aria-label' }` makes `'lbl :='` set `aria-label`.

```JavaScript
assignFrom(form, {
    '?.querySelector?.input?.aria-describedby :=': ['?.hintId', '?.errorId'],
    '?.inputs?.@each?.autocomplete :=': 'off',
}, { from: vm, withMethods: ['querySelector'] });
```

## Values

| Value (after resolution) | Effect |
|---|---|
| string | `setAttribute(name, value)` |
| number / bigint | `setAttribute(name, String(value))` |
| `true` | `setAttribute(name, '')` (a boolean attribute) |
| `false`, `null`, `undefined` | `removeAttribute(name)` |
| array | `null` / `undefined` / `false` items dropped, the rest **space-joined**; an empty result → `removeAttribute(name)` |
| object, function, symbol | Not assigned; a console warning |

In `assignFrom` / `assignFromAsync`, `?.` paths resolve as usual, **including inside arrays**, and `!` / `!!` work for booleans:

```JavaScript
assignFrom(el, { 'aria-busy :=': '!!?.loading', 'aria-describedby :=': ['?.hint', '?.error'] }, { from: vm });
```

A ` :=` path that doesn't lead to an `Element` is skipped, with a warning.

## Security

- **Event-handler attributes are always refused.** A key whose attribute name starts with `on` (`'onclick :='`, `'onClick :='`) throws, regardless of permissions. Unlike assigning the `onclick` *property* a string (which is ignored), setting the *attribute* compiles the string into a live handler. Bind events with [` +=`](./event-binding.md) instead.
- **Restricted attributes are honored.** With a permission processor, ` :=` checks the processor's attribute restrictions before setting *or removing*, so [`strictDefaultPermissions`](./assign-permissions.md) also covers it. For example, `'href :='` with a `javascript:` URL is blocked, while a same-domain URL is allowed.

## Performance: attributes in Tree templates

In a [`builtIns.tree`](./tree.md) pattern, a ` :=` key with a **literal** value is unambiguously an attribute. That lets the planned compile step bake it directly into a cloned `<template>`, so it costs nothing per instance. Measured on a static-heavy card (`demos/compile-benchmark.html`), building with statics baked into the template was **~1.7–2.3× faster** than applying the same values after cloning. Literal **properties** (`className: 'card'`) can't be baked safely in general, so prefer the attribute form for statics:

```JavaScript
['article', { 'class :=': 'card', 'aria-label :=': 'Item card' }, [ … ]]   // bakeable
['article', { className: 'card', ariaLabel: 'Item card' }, [ … ]]           // applied per instance
```

Today, before compiling exists, both forms perform about the same. Tree's fast path handles ` :=` keys directly, and literal values (of either form) are skipped on rebind.
