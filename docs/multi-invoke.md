# Multi-invoke (`=*` operator)

The `=*` operator calls one `withMethods` method **once per argument-list** on the
right-hand side. It exists for the case where the same method has to run several times on
the same target with different arguments — the classic example being conditional class
lists, where `classList.toggle(token, force)` is the DOM primitive but you have several
tokens to drive from a view model.

Available in `assignFrom` and `assignFromAsync` (not `assignGingerly` — it resolves values
against `from`).

## Syntax

```JS
assignFrom(target, {
    '<basePath> =*': [ argList, argList, … ]
}, { from: source, withMethods: [<method>] });
```

- `<basePath>` is the path a `withMethods` method sits at (e.g. `?.classList?.toggle`).
- The RHS is an array. Each element is one **argument-list** — itself an array, spread as the
  arguments of one call. A non-array element is treated as a single positional argument.
- Each argument-list is resolved against `from` first, so `?.` paths, `$0` references,
  protocols, `!!` / `!` markers, and literals all work inside it.
- Calls run in array order. An empty list is a no-op. A non-array RHS throws.

## Example — conditional class list

```JS
const vm = { isOpen: true, isLoading: false, hasError: true };

assignFrom(panel, {
    '?.classList?.toggle =*': [
        ['isOpenCls',    '!!?.isOpen'],
        ['loadingCls',   '!!?.isLoading'],
        ['errorCls',     '!!?.hasError'],
    ]
}, { from: vm, withMethods: ['toggle'] });

// panel.classList.toggle('isOpenCls',  true)
// panel.classList.toggle('loadingCls', false)
// panel.classList.toggle('errorCls',   true)
```

The `!!` marker (see the README) coerces each force argument to a real boolean, so a missing
source value removes the class rather than flipping it — the whole call is idempotent.

## Example — call once per value

A non-array element is a single argument, which makes `=*` a shorthand for "run this method
for each of these":

```JS
assignFrom(el, {
    '?.classList?.add =*': ['a', 'b', 'c']
}, { from: vm, withMethods: ['add'] });

// el.classList.add('a'); el.classList.add('b'); el.classList.add('c');
```

## Interaction with `where_x_in`

Looped substitution expands a `=*` value the same way it expands any other, and the expanded
argument-lists are **concatenated** into one call-list — so an expanded pattern still invokes
the method once per expansion rather than the last expansion winning:

```JS
assignFrom(el, {
    '?.classList?.toggle =*': [ ['${x}Cls', '!!?.${x}'] ]
}, { from: { foo: 1, bar: 0 }, withMethods: ['toggle'], where_x_in: ['foo', 'bar'] });

// el.classList.toggle('fooCls', true)
// el.classList.toggle('barCls', false)
```

## Notes

- `=*` is intended for method calls. If `basePath` does not end at a `withMethods` method,
  each iteration falls back to a plain assignment of the (array) value and the last one wins —
  which is almost certainly not what you want.
- Under the hood each iteration delegates to `assignGingerly(target, { [basePath]: argList })`,
  reusing the normal "array value → spread as method arguments" path — so `withMethods`,
  `aka`, and `permissionProcessor` restrictions all apply per call.
- In `assignFromAsync`, argument-lists are resolved with `resolveValues`, so async protocol
  handlers work inside them.
