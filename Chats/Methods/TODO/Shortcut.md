# Method / Aliasing Shortcut

---

## Human Ask

This pattern will appear frequently:

```JS
{
    from: this, /* this is the Source */
    withMethods: ['querySelector'],
    aka: {'🔍', 'querySelector'}
}
```

It would be nice to reduce the verbosity:

```JS
{
    from: this, /* this is the Source */
    akaMethods: {'🔍', 'querySelector'},
}
```

This is additive, not replacing anything.

---

## Git-committable note from GitHub Copilot

I like this shorthand. It feels like a good additive convenience layer that can be implemented by expanding `akaMethods` into the existing `withMethods` + `aka` behavior rather than introducing a separate execution path.

Proposed semantics:
- `akaMethods` should be treated as a shorthand for "bind these methods from the source and expose them under these aliases".
- The most natural form is a mapping from alias to method name, for example `akaMethods: { '🔍': 'querySelector' }`.
- It should remain fully additive: existing `withMethods` and `aka` continue to work unchanged, and `akaMethods` simply provides a more compact spelling.

Suggested implementation direction:
- Normalize `akaMethods` into the existing internal representation during option processing.
- Keep the public API backward-compatible and avoid any behavior change for callers using the current verbose form.