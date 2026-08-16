# Path Authoring Utilities

`assign-gingerly/paths.js` exports utilities for type-safe, ergonomic authoring of `assignFrom` and `assignGingerly` configurations — particularly useful for roundabout merge configs.

## Import

```ts
import { paths, set, doAssign, smoothOver, sp, md } from 'assign-gingerly/paths.js';
```

## `paths<T>(options?)`

Creates a typed proxy where every property access and method call records the path. The proxy produces serialized `?.` path strings used by `assignFrom` / `assignGingerly`, and it exposes reserved terminal markers like `Each`, `EqNot`, and `Path` for command-style authoring.

```ts
interface MyVM extends HTMLElement {
    clone: DocumentFragment;
    username: string;
    count: number;
    statusClassName: string;
}

const aka = { q: 'querySelector' };
const withMethods = ['querySelector', 'appendChild', 'cloneNode'];
const $ = paths<MyVM>({ aka, withMethods });
```

### Property access

```ts
$.username.Path            // '?.username'
$.clone.Path               // '?.clone'
```

### Command tokens

Use capitalized terminal markers to build command suffixes in a path-chain shape:

```ts
$.ariaControlsElements.Each.hidden.EqNot.Path   // '?.ariaControlsElements?.@each?.hidden =!'
$.count.PlusEq.Path                             // '?.count +='
$.text.QMEq.Path                                // '?.text ?='
$.style.YEq.Path                                // '?.style Y='
$.data.MinusEq.Path                             // '?.data -='
$.handler.Arrow.Path                            // '?.handler =>'
```

### Method call syntax

Method arguments are appended to the path. Aliases are reversed automatically (`querySelector` ? `q`):

```ts
$.querySelector('.user').Path                    // '?.q?..user'
$.clone.querySelector('.status').className.Path  // '?.clone?.q?..status?.className'
$.template.content.cloneNode(true).Path          // '?.template?.content?.cloneNode?.true'
```

### Bare proxy = self-reference

```ts
$.Path   // '?.' (the source object itself)
```

### Options

| Option | Effect |
|--------|--------|
| `aka` | Reverse aliases: `querySelector` in code ? `q` in output path |
| `withMethods` | Declares method names (for future disambiguation use) |

---

## `set(lhs).to(rhs)`

Produces a single assignment pair `{ [lhsPath]: rhsPath }`. Both arguments can be proxies (auto-extracted) or plain values. Reserved terminal tokens are preserved in the serialized path, so command-style chains like `$.ariaControlsElements.Each.hidden.EqNot` can be passed directly.

```ts
set($.clone.querySelector('.username').textContent).to($.username)
// { '?.clone?.q?..username?.textContent': '?.username' }

set($.appendChild).to($.clone)
// { '?.appendChild': '?.clone' }
```

Spreadable into larger objects:

```ts
assign: {
    ...set($.clone.querySelector('.status').className).to($.statusClassName),
    ...set($.clone.querySelector('.count').textContent).to($.count),
    renderCount: 1
}
```

---

## `doAssign(...pairs)`

Merges multiple `set(...).to(...)` results (and/or plain objects) into `{ assign: { ... } }`. Spread the result into a merge config to avoid repeated `...` per entry.

```ts
{
    ifKeyIn: ['statusClassName', 'statusMessageText'],
    ifAllOf: ['clone'],
    ...doAssign(
        set($.clone.querySelector('.status').className).to($.statusClassName),
        set($.clone.querySelector('.status-text').textContent).to($.statusMessageText),
    )
}
```

Mix with literal values:

```ts
...doAssign(
    set($.clone.querySelector('.count-value').textContent).to($.count),
    { renderCount: 1 },
)
```

---

## `smoothOver(value)`

Recursively walks any structure (objects, arrays, nested) and converts all proxy values to their serialized `?.` path strings. This includes reserved command tokens, so a terminal marker stays attached to the final output. Wrap an entire config to handle all proxies in one pass.

```ts
const raConfig = {
    merges: smoothOver([
        { ifAllOf: ['template'], assign: { clone: $.template.content.cloneNode(true) } },
        {
            ifAllOf: ['clone'],
            assign: {
                incrementButton: $.clone.querySelector('.increment'),
                decrementButton: $.clone.querySelector('.decrement'),
            }
        },
    ]),
};
// All proxy values → '?.clone?.q?..increment', etc.
```

Non-proxy values (numbers, booleans, plain strings) pass through unchanged.

---

## `sp` — Split into Parts (for `builtIns.join`)

Tagged template literal that produces an array of path strings + literal strings. Proxy objects are auto-extracted (no `.Path` needed inside the tag).

```ts
const value = sp`${$.lastName}, ${$.firstName}`;
// ['?.lastName', ', ', '?.firstName']
```

Optional segments via nested arrays:

```ts
sp`${$.lastName}${[', ', $.middleName]}, ${$.firstName}`
// ['?.lastName', [', ', '?.middleName'], ', ', '?.firstName']
```

---

## `md` — Microdata Template (for `builtIns.microDataJoin`)

Tagged template literal that produces `{prop, val}` objects for semantic DOM rendering.

```ts
const template = md`${$.firstName} ${$.lastName} is ${$.age} years old`;
// [{ prop: 'firstName', val: '?.firstName' }, ' ', { prop: 'lastName', val: '?.lastName' }, ' is ', { prop: 'age', val: '?.age' }, ' years old']
```

Custom property names or per-segment config via explicit objects:

```ts
md`${{ prop: 'birthDate', val: $.birthDT, format: 'long' }}`
```

---

## Full Roundabout Example

```ts
import { paths, set, doAssign, smoothOver } from 'assign-gingerly/paths.js';

interface CounterVM extends HTMLElement {
    template: HTMLTemplateElement;
    clone: DocumentFragment;
    username: string;
    count: number;
    statusClassName: string;
    statusMessageText: string;
    incrementButton: Element;
    decrementButton: Element;
    resetButton: Element;
    renderCount: number;
}

const aka = { q: 'querySelector' };
const withMethods = ['querySelector', 'appendChild', 'add', 'cloneNode'];
const $ = paths<CounterVM>({ aka, withMethods });

const raConfig = {
    weakRef: {
        properties: ['incrementButton', 'decrementButton', 'resetButton'],
        logIfCollected: 'warn'
    },
    actions: {
        updateStatus: { ifKeyIn: ['count'] },
    },
    compacts: {
        on_click_of_incrementButton_inc_count_by: 1,
        on_click_of_decrementButton_inc_count_by: -1,
        on_click_of_resetButton_set_count_to: 0,
    },
    merges: smoothOver([
        { ifAllOf: ['template'], assign: { clone: $.template.content.cloneNode(true) } },
        {
            ifAllOf: ['clone'],
            assign: {
                incrementButton: $.clone.querySelector('.increment'),
                decrementButton: $.clone.querySelector('.decrement'),
                resetButton: $.clone.querySelector('.reset'),
            }
        },
        {
            ifKeyIn: ['username'],
            ifAllOf: ['clone'],
            ...doAssign(
                set($.clone.querySelector('.username').textContent).to($.username),
            )
        },
        {
            ifKeyIn: ['statusClassName', 'statusMessageText'],
            ifAllOf: ['clone'],
            ...doAssign(
                set($.clone.querySelector('.status').className).to($.statusClassName),
                set($.clone.querySelector('.status-text').textContent).to($.statusMessageText),
            )
        },
        {
            ifKeyIn: ['count'],
            ifAllOf: ['clone'],
            ...doAssign(
                set($.clone.querySelector('.count-value').textContent).to($.count),
                { renderCount: 1 },
            )
        },
        {
            ifAllOf: ['renderCount'],
            assign: {
                ...set($.appendChild).to($.clone),
                clone: smoothOver($),
            }
        },
    ]),
    assignGingerlyOptions: { withMethods, aka },
};
```

### What you get

- Full IDE autocomplete on all VM property names
- Compile-time errors for typos (`$.usernam` → TS error)
- Method call syntax reads like real code (`$.querySelector('.user')`)
- Aliases applied automatically (`querySelector` → `q` in output)
- No manual `?.` string construction
- Output is the same JSON as hand-written configs


