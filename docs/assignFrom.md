# assignFrom — Resolve and Assign in One Step

`assignFrom` combines [`resolveValues`](#resolvevalues) with `assignGingerly` into a single call. It resolves `?.`-prefixed RHS path strings against a source object, then assigns the resolved values into a target.

## Import

```TypeScript
import { assignFrom } from 'assign-gingerly/assignFrom.js';
// or
import { assignFrom } from 'assign-gingerly';
```

## Signature

```TypeScript
assignFrom(target, pattern, options): Promise<any>
```

- **target** — Object to merge resolved values into
- **pattern** — Object whose RHS values may contain `?.` path strings
- **options** — Extends `IAssignGingerlyOptions` with a required `from` property

```TypeScript
interface AssignFromOptions extends IAssignGingerlyOptions {
  from: any;              // Source object to resolve RHS paths against
  where_x_in?: string[]; // Loop variable bindings — expand entries containing ${x}
  where_y_in?: string[]; // Loop variable bindings — expand entries containing ${y}
  where_z_in?: string[]; // Loop variable bindings — expand entries containing ${z}
}
```

## Basic Usage

```TypeScript
const source = {
  myPropContainer: { stringProp: 'Venus' },
  myFooString: 'bar'
};

const target = { hello: 'world' };

assignFrom(target, {
  hello: '?.myPropContainer?.stringProp',
  foo: '?.myFooString'
}, { from: source });

// target is now { hello: 'Venus', foo: 'bar' }
```

## How RHS Resolution Works

- RHS values starting with `?.` are resolved as paths against the `from` object
- All other values (numbers, booleans, non-`?.` strings, objects, arrays) pass through as literals
- Paths use `?.` as the delimiter, same as assignGingerly's LHS paths
- Unresolvable paths resolve to `undefined`

## Self-Reference with `?.`

Use `?.` (with nothing after it) as a RHS value to reference the entire `from` object itself:

```TypeScript
const source = { name: 'Alice', clone: someDocumentFragment };

assignFrom(target, {
  '?.appendChild': '?..clone',  // resolve source.clone (note: . is part of the value)
  ref: '?.'                     // the source object itself
}, { from: source, withMethods: ['appendChild'] });
```

This is useful when you need to pass the source object as a value alongside resolved properties from it.

## Real-World Example

Replacing imperative DOM manipulation with declarative configuration:

```TypeScript
// Before (imperative):
const { username, clone } = self;
const usernameSpan = clone.querySelector('.username');
if (usernameSpan) {
  usernameSpan.textContent = username;
}
target.appendChild(clone);

// After (declarative with assignFrom):
assignFrom(target, {
  '?.appendChild': '?..clone',
  '?.clone?.q?..username?.textContent': '?.username'
}, {
  from: self,
  withMethods: ['appendChild'],
  aka: { 'q': 'querySelector' }
});
```

## Mixing Resolved and Literal Values

```TypeScript
assignFrom(target, {
  color: '?.theme?.primary',   // resolved from source
  size: '16px',                // literal string (no ?. prefix)
  count: 5,                    // literal number
  active: true                 // literal boolean
}, { from: source });
```

## Inherits All assignGingerly Options

`assignFrom` passes all options through to `assignGingerly`, so you can use:

- **withMethods** — call methods instead of assigning
- **aka** — alias shortcuts
- **signal** — AbortSignal for @eachTime
- **registry** — enhancement registry

```TypeScript
assignFrom(element, {
  '?.classList?.add': '?.cssClass'
}, {
  from: viewModel,
  withMethods: ['add']
});
```

## Standalone resolveValues

If you only need the resolution step without assignment, use `resolveValues` directly:

```TypeScript
import { resolveValues } from 'assign-gingerly/resolveValues.js';

const pattern = {
  hello: '?.myPropContainer?.stringProp',
  foo: '?.myFooString',
  literal: 42
};

const resolved = resolveValues(pattern, source);
// { hello: 'Venus', foo: 'bar', literal: 42 }

// Then use with assignGingerly or anything else
target.assignGingerly(resolved);
```

## RHS Path Reference

| RHS Value | Behavior |
|-----------|----------|
| `'?.prop'` | Resolves `source.prop` |
| `'?.a?.b?.c'` | Resolves `source.a.b.c` |
| `'?..className'` | Resolves `source['.className']` (preserves leading dot) |
| `'?.'` | Resolves to the `source` object itself |
| `'?.count?.toLocaleString'` | Calls `source.count.toLocaleString()` when `toLocaleString` is in `withMethods` (a method as the last segment is invoked with zero args) |
| `'?.count?.toLocaleString?.en'` | Calls `source.count.toLocaleString('en')` — the segment after a method is passed as a string argument |
| `'?.wrap?.deref\|?.count'` | A trailing `\|` forces a zero-arg call (`wrap.deref()`) even when a segment follows; then the chain continues (`.count`). Works on the last segment too (`'?.count?.toLocaleString\|'`). Only applies when the name (minus `\|`) is in `withMethods`; otherwise `\|` is part of a literal key. |
| `'literal'` | Passes through as-is (no `?.` prefix) |
| `42` | Passes through as-is (not a string) |
| `null` | Passes through as-is |


## Looped Substitution

`assignFrom` supports expanding template patterns into multiple concrete assignments. Placeholders `${x}`, `${y}`, and `${z}` in pattern keys and string values are replaced with each value from the corresponding option array.

```TypeScript
const vm = { firstName: 'Monkey', lastName: 'Luffy' };

await assignFrom(myForm, {
    '?.[name="${x}"]': '?.${x}'
}, {
    from: vm,
    withMethods: ['querySelector'],
    where_x_in: ['firstName', 'lastName']
});
```

This expands into two concrete entries before resolution:
- `'?.[name="firstName"]': '?.firstName'`
- `'?.[name="lastName"]': '?.lastName'`

### Multiple Variables (Cartesian)

Multiple variables produce a cartesian product. Variables are expanded in order: x first, then y, then z.

```TypeScript
await assignFrom(grid, {
    '?.querySelector?.[data-row="${x}"][data-col="${y}"]?.textContent': '${x}-${y}'
}, {
    from: {},
    withMethods: ['querySelector'],
    where_x_in: ['1', '2'],
    where_y_in: ['A', 'B']
});
// Produces 4 entries (2 × 2)
```

### Substitution in Handler Configs

Placeholders are substituted inside handler `resolve` maps too:

```TypeScript
await assignFrom(container, {
    '?.querySelector?..${x}View =>': {
        do: 'builtIns.lazyLoad',
        resolve: {
            if: '?.${x}Visible',
            instantiate: 'globalThis://${x}Template'
        }
    }
}, {
    from: vm,
    withMethods: ['querySelector'],
    protocols: { globalThis: k => globalThis[k] },
    where_x_in: ['home', 'settings', 'profile']
});
```

### Edge Cases

| Scenario | Behavior |
|----------|----------|
| Empty array (`where_x_in: []`) | Template entries produce nothing (no-op) |
| Missing option | Literal `${x}` remains in the string |
| Entries without placeholders | Passed through unchanged |
| Non-string RHS values | Passed through unchanged |

## Multiple Handlers

When the RHS of a ` =>` key is an array, each element is treated as a separate handler config. They execute sequentially, each awaited before the next. All handlers share the same resolved LHS target.

```TypeScript
await assignFrom(document.body, {
    '?.querySelector?..mainView =>': [
        {
            do: 'builtIns.lazyLoad',
            resolve: { if: '?.isVisible', instantiate: 'globalThis://viewTemplate' }
        },
        {
            do: 'applyTheme',
            resolve: { theme: '?.currentTheme' }
        }
    ]
}, { withMethods: ['querySelector'], from: myVM, protocols: { globalThis: k => globalThis[k] } });
```

### Behavior

- Empty array — silent no-op
- Single-element array — identical to passing the object directly
- Nested arrays — throws (not supported)
- Mixed `do` values — fully supported
- Errors — fail-fast (remaining handlers skipped)
