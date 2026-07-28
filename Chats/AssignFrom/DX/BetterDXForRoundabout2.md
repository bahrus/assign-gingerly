# Better DX For Roundabout II

---

## Human Ask

I think [the efforts we've made so far](../RoundaboutDX/BetterDXForRoundabout.md) are good, but I still wonder if this could be made easier:

```ts
import { paths, set, smoothOver } from 'assign-gingerly/DX/paths.js';

interface MyVM extends HTMLElement { /* ... */ }
const aka = { q: 'querySelector' };
const withMethods = ['querySelector', 'appendChild', 'add', 'cloneNode'];
const $ = paths<MyVM>({ aka, withMethods });
const raConfig = {
    merges: smoothOver([
        {
            ifKeyIn: ['statusClassName', 'statusMessageText'],
            ifAllOf: ['clone'],
            assign: {
                ...set($.clone.querySelector('.status').className).to($.statusClassName),
                ...set($.clone.querySelector('.status-text').textContent).to($.statusMessageText),
            }
        }
    ]),
};
```

In particular, the ... is a bit jarring.

I wonder if, with the help of smoothOver, we can make it read more intuitively, something like:

```ts
import { paths, set, smoothOver } from 'assign-gingerly/DX/paths.js';

interface MyVM extends HTMLElement { /* ... */ }
const aka = { q: 'querySelector' };
const withMethods = ['querySelector', 'appendChild', 'add', 'cloneNode'];
const $ = paths<MyVM>({ aka, withMethods });
const raConfig = {
    merges: smoothOver([
        {
            ifKeyIn: ['statusClassName', 'statusMessageText'],
            ifAllOf: ['clone'],
            ...doAssign(
                set($.clone.querySelector('.status').className).to($.statusClassName),
                set($.clone.querySelector('.status-text').textContent).to($.statusMessageText),
            )
        }
    ]),
};
```

One possible disadvantage is I'm not sure trailing commas like I have would be allowed inside a method call.

Somehow it feels more intuitive to me.  But maybe it's just me.  Another suggestions?


---

## Feedback

### On Trailing Commas

Good news — trailing commas in function arguments are fully valid in JavaScript since ES2017. So this is fine:

```ts
doAssign(
    set($.clone.querySelector('.status').className).to($.statusClassName),
    set($.clone.querySelector('.status-text').textContent).to($.statusMessageText),  // ← trailing comma OK
)
```

No issue there.

### What `doAssign` Would Do

It takes N `set(...).to(...)` results (each is `{ [lhsPath]: rhsPath }`) and merges them into `{ assign: { ...all } }`:

```ts
function doAssign(...pairs: Record<string, any>[]): { assign: Record<string, any> } {
    return { assign: Object.assign({}, ...pairs) };
}
```

Then you spread it into the merge config:

```ts
{
    ifKeyIn: ['statusClassName'],
    ifAllOf: ['clone'],
    ...doAssign(
        set($.clone.querySelector('.status').className).to($.statusClassName),
    )
}
// Becomes: { ifKeyIn: [...], ifAllOf: [...], assign: { '?.clone?.q?..status?.className': '?.statusClassName' } }
```

This is clean — the `...` moves from inside `assign` to the top level, and there's only one of them. Reads better.

### Comparison

```ts
// Current (spread inside assign):
{
    ifKeyIn: ['statusClassName', 'statusMessageText'],
    ifAllOf: ['clone'],
    assign: {
        ...set($.clone.querySelector('.status').className).to($.statusClassName),
        ...set($.clone.querySelector('.status-text').textContent).to($.statusMessageText),
    }
}

// Proposed (doAssign):
{
    ifKeyIn: ['statusClassName', 'statusMessageText'],
    ifAllOf: ['clone'],
    ...doAssign(
        set($.clone.querySelector('.status').className).to($.statusClassName),
        set($.clone.querySelector('.status-text').textContent).to($.statusMessageText),
    )
}
```

The difference is small but real:
- No `assign: { ... }` wrapper — `doAssign` generates it
- No `...` per line — just one `...doAssign(...)` at the top
- Each `set(...).to(...)` is a clean line, no spread prefix

### The Trade-Off

**Pro:** Less visual noise — no repeated `...` per entry, no `assign: { }` wrapper.

**Con:** When you need to mix `set(...).to(...)` pairs with literal values (like `renderCount: 1`), you'd need to pass them in too:

```ts
// With doAssign, how do you mix?
...doAssign(
    set($.clone.querySelector('.count-value').textContent).to($.count),
    { renderCount: 1 },  // literal — still works, doAssign just merges it
)
```

That works fine — `Object.assign({}, ...pairs)` handles plain objects too. So `doAssign` is really just "merge all these into an `assign` property."

### Alternative: Just Accept Arrays in `set`

What if `set` itself accepted multiple targets?

```ts
assign: set(
    [$.clone.querySelector('.status').className, $.statusClassName],
    [$.clone.querySelector('.status-text').textContent, $.statusMessageText],
)
// Returns: { '?.clone?.q?..status?.className': '?.statusClassName', '?.clone?.q?..status-text?.textContent': '?.statusMessageText' }
```

This eliminates both the `...` and the `.to()`:

```ts
{
    ifKeyIn: ['statusClassName', 'statusMessageText'],
    ifAllOf: ['clone'],
    assign: set(
        [$.clone.querySelector('.status').className, $.statusClassName],
        [$.clone.querySelector('.status-text').textContent, $.statusMessageText],
    )
}
```

But this overloads `set` to mean both "single pair with `.to()`" and "batch pairs from tuples." Could be confusing.

### My Recommendation

**Go with `doAssign`** — it's simple, composable, and the implementation is one line. It pairs naturally with `set(...).to(...)` and handles mixed literal values.

```ts
export function doAssign(...pairs: Record<string, any>[]): { assign: Record<string, any> } {
    return { assign: Object.assign({}, ...pairs) };
}
```

Shall I add this to `paths.ts` now, or park it?

---

## Human Response I

Yes, please
