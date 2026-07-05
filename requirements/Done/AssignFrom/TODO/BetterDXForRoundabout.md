# Better DX For Roundabout

---
## Human Ask

AssignFrom is used in the [roundabout-lib package](https://github.com/bahrus/roundabout#going-fully-declarative-with-merges-and-compacts) with the merges feature.  Here's an example of what that looks like:

```JS
const raConfig = {
    weakRef: {
        properties: ['incrementButton', 'decrementButton', 'resetButton'],
        logIfCollected: 'warn'
    },
    actions: {
        // The only action left — contains branching logic that can't be JSON-serialized
        updateStatus: { ifKeyIn: ['count'] },
    },
    compacts: {
        // Button clicks directly modify count — no methods needed
        on_click_of_incrementButton_inc_count_by: 1,
        on_click_of_decrementButton_inc_count_by: -1,
        on_click_of_resetButton_set_count_to: 0,
    },
    merges: [
        // Clone the template when it becomes available
        { ifAllOf: ['template'], assign: { clone: '?.template?.content?.cloneNode?.true' } },
        // Extract button references from the clone
        {
            ifAllOf: ['clone'],
            assign: {
                incrementButton: '?.clone?.q?..increment',
                decrementButton: '?.clone?.q?..decrement',
                resetButton: '?.clone?.q?..reset',
            }
        },
        // Push username into the DOM
        { ifKeyIn: ['username'], ifAllOf: ['clone'], assign: { '?.clone?.q?..username?.textContent': '?.username' } },
        // Push status into the DOM
        {
            ifKeyIn: ['statusClassName', 'statusMessageText'],
            ifAllOf: ['clone'],
            assign: {
                '?.clone?.q?..status?.className': '?.statusClassName',
                '?.clone?.q?..status-text?.textContent': '?.statusMessageText',
            }
        },
        // Push count into the DOM and trigger render
        { ifKeyIn: ['count'], ifAllOf: ['clone'], assign: { '?.clone?.q?..count-value?.textContent': '?.count', renderCount: 1 } },
        // Append clone to the element
        { ifAllOf: ['renderCount'], assign: { '?.appendChild': '?.clone', clone: '?.' } },
    ],
    assignGingerlyOptions: {
        withMethods: ['querySelector', 'appendChild', 'add', 'cloneNode'],
        aka: { q: 'querySelector' }
    },
};
```

Can you suggest, similar to sp and md, some utilities this package could provide to make managing the assign portion of these configurations easier?

---

## Feedback / Suggestions

### The Pain Points

Looking at the `merges` config, the DX friction comes from:

1. **Manually writing `?.` path strings** — error-prone, no autocomplete:
   ```js
   '?.clone?.q?..username?.textContent': '?.username'
   ```

2. **Repeating `aka` and `withMethods` knowledge** in the path strings (you must remember that `q` = `querySelector`), with no type-checking that the alias actually exists.

3. **LHS and RHS are both strings** — it's hard to visually distinguish "target path" from "source path" in:
   ```js
   assign: { '?.clone?.q?..status?.className': '?.statusClassName' }
   ```

4. **No way to express "this value comes from the VM" vs "this is a literal"** without reading character-by-character for the `?.` prefix.

### Suggested Utilities

#### 1. Typed Proxy for Both LHS and RHS — `paths<T>()`

You already have `paths<T>()`. The key insight is that in `roundabout` merges, the **source and target are the same object** (the VM itself). So one proxy serves both sides:

```ts
import { paths } from 'assign-gingerly/paths.js';

interface MyVM {
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

const $ = paths<MyVM>();
```

Now `$.username.path` gives `'?.username'`, `$.clone.path` gives `'?.clone'`, etc. — with full autocomplete.

#### 2. An `assign` Helper — `a(lhs, rhs)`

A tiny helper that produces the `{ [lhsPath]: rhsPath }` entries from proxy objects:

```ts
function a<T>(lhs: any, rhs: any): Record<string, string> {
    const lhsStr = typeof lhs === 'object' && PATH_SYMBOL in lhs ? lhs[PATH_SYMBOL] : String(lhs);
    const rhsStr = typeof rhs === 'object' && PATH_SYMBOL in rhs ? rhs[PATH_SYMBOL] : rhs;
    return { [lhsStr]: rhsStr };
}
```

Usage:

```ts
// Before:
assign: { '?.clone?.q?..username?.textContent': '?.username' }

// After:
assign: a($.clone.q['.username'].textContent, $.username)
// { '?.clone?.q?..username?.textContent': '?.username' }
```

Hmm — but this doesn't work well because LHS paths often use `withMethods` + `aka` (like `q` for querySelector), and those aren't on the typed proxy.

#### 3. A Better Approach: `lhs` and `rhs` Separate Proxies

Since LHS paths navigate the *target element* (with methods/aliases) while RHS paths navigate the *VM*, they're conceptually different:

```ts
import { paths } from 'assign-gingerly/paths.js';

// RHS proxy — navigates the VM
const $ = paths<MyVM>();

// LHS proxy — navigates the target (with aliases baked in)
// This would need a way to represent method calls + aliases...
```

The problem: LHS paths include method calls (`querySelector`, `appendChild`) and CSS selectors (`.username`), which don't map to typed interfaces. They're inherently dynamic/stringly-typed.

**Conclusion: the RHS (source) benefits from typed proxies. The LHS (target) is too dynamic for type safety in most cases.**

#### 4. `merge` Helper — Object Spread with Proxy RHS

A more practical helper: leave LHS as strings (since they're dynamic), but make RHS type-safe:

```ts
function merge(entries: Record<string, any>): Record<string, string> {
    const result: Record<string, any> = {};
    for (const [key, val] of Object.entries(entries)) {
        result[key] = val && typeof val === 'object' && PATH_SYMBOL in val ? val[PATH_SYMBOL] : val;
    }
    return result;
}
```

Usage:

```ts
const $ = paths<MyVM>();

merges: [
    { ifAllOf: ['clone'], assign: merge({
        incrementButton: $.clone.q['.increment'],  // Hmm, still same issue with methods
    })},
]
```

Still awkward because the LHS proxy chaining goes through querySelector which isn't typed.

#### 5. The Pragmatic Suggestion: `from()` Helper

The simplest win is a function that makes RHS values type-safe while leaving LHS as-is:

```ts
// from(proxy) → extracts the path string
function from(proxy: any): string {
    if (proxy && typeof proxy === 'object' && PATH_SYMBOL in proxy) {
        return proxy[PATH_SYMBOL];
    }
    return proxy;
}
```

This is essentially just `.path` with a function name that reads better in context:

```ts
const $ = paths<MyVM>();

merges: [
    { ifAllOf: ['template'], assign: { clone: '?.template?.content?.cloneNode?.true' } },
    {
        ifAllOf: ['clone'],
        assign: {
            incrementButton: from($.clone) + '?.q?..increment',  // concatenation still ugly
        }
    },
    { ifKeyIn: ['username'], ifAllOf: ['clone'], assign: { '?.clone?.q?..username?.textContent': from($.username) } },
    { ifKeyIn: ['count'], ifAllOf: ['clone'], assign: { '?.clone?.q?..count-value?.textContent': from($.count) } },
]
```

The RHS is type-safe (`from($.username)` catches typos), but the LHS stays as manual strings.

#### 6. My Actual Recommendation: `kv()` — Key-Value Pairs

After thinking through all the options, here's what I think actually helps for this specific pattern:

```ts
import { paths } from 'assign-gingerly/paths.js';

interface MyVM { username: string; count: number; statusClassName: string; statusMessageText: string; clone: any; renderCount: number; }
const $ = paths<MyVM>();

// kv takes an LHS string and a proxy RHS, returns { [lhs]: rhs.path }
function kv(lhs: string, rhs: any): Record<string, string> {
    const rhsStr = rhs && typeof rhs === 'object' && PATH_SYMBOL in rhs ? rhs[PATH_SYMBOL] : rhs;
    return { [lhs]: rhsStr };
}

// Spread multiple kv pairs:
merges: [
    {
        ifKeyIn: ['username'],
        ifAllOf: ['clone'],
        assign: kv('?.clone?.q?..username?.textContent', $.username)
    },
    {
        ifKeyIn: ['statusClassName', 'statusMessageText'],
        ifAllOf: ['clone'],
        assign: {
            ...kv('?.clone?.q?..status?.className', $.statusClassName),
            ...kv('?.clone?.q?..status-text?.textContent', $.statusMessageText),
        }
    },
    {
        ifKeyIn: ['count'],
        ifAllOf: ['clone'],
        assign: {
            ...kv('?.clone?.q?..count-value?.textContent', $.count),
            renderCount: 1
        }
    },
]
```

**What this gives you:**
- ✅ RHS is type-checked — `$.usernam` would be a TS error
- ✅ LHS stays as a string (because it's inherently dynamic — methods, aliases, CSS selectors)
- ✅ Reads clearly: `kv(target, source)`
- ✅ Spreadable into larger objects
- ✅ Tiny implementation (~3 lines)

### What This Package Could Export

From `assign-gingerly/paths.js`:

```ts
export { paths, sp, md, kv };
```

Where `kv` is:

```ts
export function kv(lhs: string, rhs: any): Record<string, any> {
    const rhsStr = rhs && typeof rhs === 'object' && PATH_SYMBOL in rhs ? rhs[PATH_SYMBOL] : rhs;
    return { [lhs]: rhsStr };
}
```

### The Full Roundabout Example Rewritten

```ts
import { paths, kv } from 'assign-gingerly/paths.js';

interface CounterVM {
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

const $ = paths<CounterVM>();

const raConfig = {
    // ... weakRef, actions, compacts unchanged ...
    merges: [
        { ifAllOf: ['template'], assign: { clone: '?.template?.content?.cloneNode?.true' } },
        {
            ifAllOf: ['clone'],
            assign: {
                ...kv('?.clone?.q?..increment', $.incrementButton),  // wait, this is backwards
            }
        },
    ],
};
```

Hmm — actually I realize the roundabout `assign` pattern has the LHS as target and RHS as source, but sometimes the *assignments go into VM properties* (like `incrementButton: '?.clone?.q?..increment'`). In those cases:
- LHS = VM property name (simple string like `'incrementButton'`)
- RHS = path to navigate (complex string like `'?.clone?.q?..increment'`)

So the roles flip! Sometimes the complex path is on the left, sometimes on the right. `kv` still works — just reverse the mental model for those cases.

### Summary

| Utility | Purpose | Helps With |
|---------|---------|-----------|
| `paths<T>()` | Typed proxy for property names | RHS source paths (autocomplete + typo detection) |
| `kv(lhs, rhs)` | Pair a string key with a proxy value | Building `assign` objects with type-safe RHS |
| `sp` / `md` | Template literal → array | `join` / `microDataJoin` templates |

### Questions

1. **Is `kv` worth adding, or is `.path` sufficient?** `kv('?.target', $.source)` vs `{ '?.target': $.source.path }` — the latter is already fine, just slightly more verbose.
2. **Would a batch helper (multiple kv pairs at once) be useful?** e.g., `kvs({ lhs1: $.rhs1, lhs2: $.rhs2 })`.
3. **Is there an appetite for a LHS helper that validates against `assignGingerlyOptions.aka`?** This would catch alias typos at compile time, but requires passing the aka map to the proxy factory.

---

## Human Response I

Would it be possible to do:

```JS
interface MyVM extends HTMLElement{
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
const $ = paths<MyVM>(
    {
        aka,
        withMethods 
    }
);
const raConfig = {
    weakRef: {
        properties: ['incrementButton', 'decrementButton', 'resetButton'],
        logIfCollected: 'warn'
    },
    actions: {
        // The only action left — contains branching logic that can't be JSON-serialized
        updateStatus: { ifKeyIn: ['count'] },
    },
    compacts: {
        // Button clicks directly modify count — no methods needed
        on_click_of_incrementButton_inc_count_by: 1,
        on_click_of_decrementButton_inc_count_by: -1,
        on_click_of_resetButton_set_count_to: 0,
    },
    merges: [
        // Clone the template when it becomes available
        { ifAllOf: ['template'], assign: { clone: $.template.content.cloneNode(true) } },
        // Extract button references from the clone
        {
            ifAllOf: ['clone'],
            assign: {
                incrementButton: $.clone.querySelector('.increment'),
                decrementButton: $.clone.querySelector('.decrement'),
                resetButton: '?.clone?.q?..reset',
            }
        },
        // Push username into the DOM
        { 
            ifKeyIn: ['username'], 
            ifAllOf: ['clone'], 
            assign: {
                tbd(set = $.clone.querySelector('.username').textContent, to = $.username) 
            } 
        },
        // Push status into the DOM
        {
            ifKeyIn: ['statusClassName', 'statusMessageText'],
            ifAllOf: ['clone'],
            assign: {
                tbd(set = $.clone.querySelector('.status').textContent, to = $.statusClassName),
                tbd(set = $.clone.querySelector('status-text').textContent, to = $.statusMessageText)
            }
        },
        // Push count into the DOM and trigger render
        { 
            ifKeyIn: ['count'], 
            ifAllOf: ['clone'], 
            assign: { 
                tbd(set = $.clone.querySelector('.count-value').textContent, to = $.count), 
                renderCount: 1 
            } 
        },
        // Append clone to the element
        { 
            ifAllOf: ['renderCount'], 
            assign: { 
                //this could be a tough one!
                tbd($.appendChild($.clone)),
                clone: $ 
            }
        },
    ],
    assignGingerlyOptions: {
        withMethods
        aka
    },
};
```

which would result in the same exact JSON as at the top of this document?
