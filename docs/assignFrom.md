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
assignFrom(target, pattern, options): any
```

- **target** — Object to merge resolved values into
- **pattern** — Object whose RHS values may contain `?.` path strings
- **options** — Extends `IAssignGingerlyOptions` with a required `from` property

```TypeScript
interface AssignFromOptions extends IAssignGingerlyOptions {
  from: any;  // Source object to resolve RHS paths against
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
| `'literal'` | Passes through as-is (no `?.` prefix) |
| `42` | Passes through as-is (not a string) |
| `null` | Passes through as-is |
