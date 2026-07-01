# Multiple Handlers

---

## Human Ask

If the rhs of a lhs ending with => is an array, then the array is ecpected to be an array of handlers, and they should be executed sequetially, awaitinf one before proceeding to the next.

---

## Feedback / Questions

### Clarifications Needed

1. **Same LHS target for all handlers in the array?**  
   The LHS path (everything before ` =>`) resolves to a single target. Should each handler in the array receive that same `lhsTarget`, or can individual entries override the target?

2. **Shared resolved state between sequential handlers?**  
   If handler A mutates the `lhsTarget` (e.g., inserts DOM nodes), should handler B see those mutations? Since they share the same target reference and run sequentially with `await`, the answer is likely "yes" by default — but worth confirming this is intentional.

3. **Error semantics — fail-fast or run all?**  
   If handler 2 of 4 throws, should the remaining handlers still execute? The natural behavior of sequential `await` is fail-fast (propagate the error, skip the rest). If partial execution is acceptable, that should be explicit.

4. **Mixed `do` values allowed?**  
   Can the array contain different handler types (e.g., `[{ do: 'builtIns.lazyLoad', ... }, { do: 'myCustomHandler', ... }]`)? The wording implies yes, but worth confirming.

### Implementation Notes

- Currently `processHandlerCommands.ts` validates `config.do` on the RHS object directly. This check (`!config || typeof config !== 'object' || !config.do`) will need branching: if the RHS is an array, iterate and validate each element individually.
- Each array element should still support its own `resolve` map, resolved independently before calling `handler.assign()`.
- The existing single-object form should remain valid (non-breaking change).

### Suggested Example

```ts
assignFrom(document.body, {
    '?.querySelector?..mainView =>': [
        {
            do: 'builtIns.lazyLoad',
            resolve: {
                if: '?.isVisible',
                instantiate: 'globalThis://viewTemplate',
            }
        },
        {
            do: 'builtIns.applyTheme',
            resolve: {
                theme: '?.currentTheme'
            }
        }
    ]
}, { withMethods: ['querySelector'], from: myVM });
```

### Edge Cases to Consider

- **Empty array** — no-op (skip silently), or warn?
- **Array with one element** — should behave identically to the current single-object form.
- **Nested arrays** — disallow (throw), or flatten?

---

## Human Response I

> The LHS path (everything before ` =>`) resolves to a single target. Should each handler in the array receive that same `lhsTarget`, or can individual entries override the target?

Ideally, yes, same lhsTarget.  Of course one handler could delete it, or wreak havoc in some other way, but I don't think we should worry about that.

>    If handler A mutates the `lhsTarget` (e.g., inserts DOM nodes), should handler B see those mutations? Since they share the same target reference and run sequentially with `await`, the answer is likely "yes" by default — but worth confirming this is intentional.

I agree, yes.

>    If handler 2 of 4 throws, should the remaining handlers still execute? The natural behavior of sequential `await` is fail-fast (propagate the error, skip the rest). If partial execution is acceptable, that should be explicit.

I agree, fail fast.  I wouldn't even do a try catch, just let the js fail naturally.

>    Can the array contain different handler types (e.g., `[{ do: 'builtIns.lazyLoad', ... }, { do: 'myCustomHandler', ... }]`)? The wording implies yes, but worth confirming.

I agree, yes, definitely.

> **Empty array** — no-op (skip silently), or warn?

Skip silently.

> **Array with one element** — should behave identically to the current single-object form.

Agreed.

- **Nested arrays** — disallow (throw), or flatten?

Throw for now.