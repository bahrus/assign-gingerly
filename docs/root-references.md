# `$root` and `$parent` References

When a pattern is applied to a **nested** value (a Tree key's value, a list item, …), `?.` paths resolve against that nested value. `$root` and `$parent` reach the **enclosing** values instead:

| Reference | Resolves against | In a top-level call (no stack) |
|---|---|---|
| `?.x` | the current `from` | the current `from` |
| `$parent?.x` | the enclosing `from` | `undefined` |
| `$root?.x` | the outermost `from` | the current `from` (at the top, `from` *is* the root) |

Not to be confused with **`$0`**, which refers to the **target** (the first argument to `assignFrom`), not to any `from`.

## Example

```JavaScript
const vm = { upcoming: false, success: true };

await assignFromAsync(badgeContainer, {
    '?. =>': {
        do: 'builtIns.tree',
        map: {
            // `?.` is vm.success; `$parent?.upcoming` reads its sibling
            success: ['span', {
                'textContent ?=': ['$parent?.upcoming', 'Upcoming', ['?.', 'Success', 'Failure']],
            }],
        }
    }
}, { from: vm });
```

## The `fromStack` Option

Behind the references is the `fromStack` option: the enclosing `from`s, **outermost first**, not including the current one. `$root` reads `fromStack[0]`, and `$parent` reads `fromStack.at(-1)`.

Call sites that switch to a nested value push the outer `from`:

| Call site | Nested `from` | Pushes |
|---|---|---|
| `builtIns.tree` | each key's value | the VM. Static children share their parent's value, so they don't push again. |
| `builtIns.manageTemplateList` | each item (`fromEachItem` / `configs`) | the host `from`. `fromHost` patterns stay at the host's level. |

The stack follows **data nesting, not DOM nesting**, and nested handlers compose. For example, a `manageTemplateList` inside a Tree pattern gives each item `$parent` = the Tree key's value and `$root` = the VM.

Code that nests its own `assignFrom` calls (for example inside an itemscope manager's `onAssigned`) can join in:

```JavaScript
assignFrom(el, pattern, { ...options, from: inner, fromStack: [...(options.fromStack ?? []), options.from] });
```

## Where the References Work

Anywhere a `?.` path works in an RHS value:
- plain values, arrays and nested objects;
- `!` / `!!` negation and coercion: `'!!$parent?.flag'`;
- `aka` aliases and `withMethods` in the rest of the path;
- ` ?=` ternaries, both as conditions/comparison operands and as the first element of nested ternaries;
- handler `get` / `resolve` maps;
- `getValue` / `getValues` / `resolveValues` called directly with `{ fromStack }`.

Inside **substitution paths** they're disabled, like `$0`: `$root` resolves against `from`, and `$parent` resolves to `undefined`.

Only the exact tokens count. `'$rootless'` and `'$parental'` stay literal strings.
