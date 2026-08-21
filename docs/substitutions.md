# Dynamic Substitutions

`substitutions` is an optional `assignFrom` / `assignFromAsync` feature that lets you inject dynamically resolved string values into RHS path segments. It is conceptually a **dynamic** companion to `aka`, which is **static**.

- `aka` maps a placeholder name to another hard-coded path segment.
- `substitutions` maps a placeholder name to a `?.`-delimited path. The path is resolved against `from` at runtime, and the resulting string replaces the placeholder wherever it appears as a whole path segment.

This is useful when a selector, key, or other path segment needs to come from the source object itself rather than being baked into the pattern.

## Import

`substitutions` is just an option on `assignFrom` or `assignFromAsync`:

```TypeScript
import { assignFrom } from 'assign-gingerly/assignFrom.js';
```

## Basic Usage

```TypeScript
const source = {
  targetSelector: '#main',
  ownerDocument: document
};

const target = {};

assignFrom(target, {
  mainElements: '?.ownerDocument?.querySelectorAll?.targetSelector'
}, {
  from: source,
  withMethods: ['querySelectorAll'],
  substitutions: {
    targetSelector: '?.targetSelector'
  }
});

// target.mainElements === document.querySelectorAll('#main')
```

## How It Works

1. Before any RHS path is evaluated, `substitutions` are resolved.
2. Each substitution value (a `?.` path) is resolved against `from` and must produce a string.
3. That string replaces every matching **whole path segment** in the RHS path.
4. The resulting path is then evaluated as usual, with `aka`, `withMethods`, `$0`, protocols, etc.

For example, with `substitutions: { targetSelector: '?.targetSelector' }` and `from.targetSelector` equal to `'#main'`:

```
?.ownerDocument?.querySelectorAll?.targetSelector
```

becomes

```
?.ownerDocument?.querySelectorAll?.#main
```

Because `#main` is not in `withMethods`, the parser passes it as the argument to `querySelectorAll`.

## Rules and Constraints

### Substitution values must be strings

If a substitution path resolves to anything other than a string, an error is thrown:

```TypeScript
const source = { count: 42 };

assignFrom(target, {
  value: '?.count'
}, {
  from: source,
  substitutions: {
    count: '?.count'          // ❌ throws: resolves to 42, not a string
  }
});
```

Use this for selectors, keys, identifiers, or other string path segments.

### Substitution values must not contain `?.`

This prevents a substituted value from accidentally (or maliciously) altering the structure of the path:

```TypeScript
const source = { bad: 'foo?.bar' };

assignFrom(target, {
  value: '?.bad'
}, {
  from: source,
  substitutions: {
    bad: '?.bad'               // ❌ throws: value contains '?.'
  }
});
```

If you need to compose a path dynamically, build the full path string in your own code and pass it directly.

### Only whole segments are replaced

A substitution name must match an entire segment between `?.` delimiters. It does not match partial segment names.

```TypeScript
const source = { sel: '#app' };

assignFrom(target, {
  a: '?.selector',     // 'sel' is not a whole segment, so it is not substituted
  b: '?.sel'           // 'sel' is a whole segment, so it is substituted
}, {
  from: source,
  substitutions: { sel: '?.sel' }
});

// target.a === source.selector (no substitution applied)
// target.b === '#app'
```

### Substitutions are applied before aliases

`substitutions` runs first, then `aka`. This means an alias can further transform a segment that came from a substitution.

```TypeScript
const source = { selector: '#main' };
const fakeDoc = {
  querySelectorAll: (sel) => ({ calledWith: sel })
};

const result = assignFrom({}, {
  elements: '?.q?.s'
}, {
  from: source,
  withMethods: ['querySelectorAll'],
  aka: { q: 'querySelectorAll' },
  substitutions: { s: '?.selector' }
});

// result.elements === { calledWith: '#main' }
```

## Comparison with `aka`

| Feature | `aka` | `substitutions` |
|---------|-------|-----------------|
| Value source | Hard-coded string | Resolved from `from` at runtime |
| Value type | Path segment string | Must resolve to a string |
| Use case | Rename methods/properties, shorthand aliases | Inject selectors, keys, or identifiers from the source object |
| Mental model | Static lookup table | Dynamic lookup table |

A simple way to remember the distinction: **`aka` renames; `substitutions` resolves.**

## Where Substitutions Apply

`substitutions` are honored anywhere `assignFrom` resolves RHS path strings:

- `?.`-prefixed RHS values
- `$0`-prefixed root-reference values
- Protocol-prefixed values (`proto://key?.path`)
- Nested arrays and plain objects
- Ternary RHS values (`?=` conditions and results)
- RHS `#[x]` references
- Handler `get` and `resolve` maps

They do **not** apply to object keys (the left-hand side). Use the existing `${x}` / `where_x_in` loop expansion for key templating.

## Error Messages

Common errors and their meanings:

| Error | Cause |
|-------|-------|
| `Substitution 'x' must resolve to a string, got ...` | The substitution path resolved to a non-string value. |
| `Substitution 'x' resolved to a string containing '?.', which would alter the path structure: '...'` | The resolved value contains `?.`, which would split the path. |

## Example: Dynamic Selector from a Custom Element Property

```TypeScript
class MyElement extends HTMLElement {
  inertTarget = '#main';

  connectedCallback() {
    assignFrom(this, {
      inertTargetElements: '?.ownerDocument?.querySelectorAll?.inertTarget'
    }, {
      from: this,
      withMethods: ['querySelectorAll'],
      substitutions: {
        inertTarget: '?.inertTarget'
      }
    });
  }
}
```

The value of `this.inertTarget` is resolved and inserted as the argument to `querySelectorAll`, making the selector configurable from a property.

## See Also

- [`assignFrom`](assignFrom.md) — resolve and assign in one step
- [Assign Permissions](assign-permissions.md) — opt-in permission layer
