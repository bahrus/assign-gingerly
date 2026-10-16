# builtIns.manageTemplateList

A handler that clones a template once per item in an iterable, distributes each item's data into its clone, and manages the list over time with keyed reconciliation.

## Import

Auto-loaded — no explicit import needed. Just use `do: 'builtIns.manageTemplateList'` in a handler config.

## Basic Example

```html
<template id="country-ranking">
    <tr itemscope="CountryMedalsCount">
        <td itemprop="rank"></td>
        <td itemprop="noc"></td>
        <td itemprop="gold"></td>
        <td itemprop="silver"></td>
        <td itemprop="bronze"></td>
        <td itemprop="total"></td>
    </tr>
</template>

<table>
    <thead><tr><th>Rank</th><th>NOC</th><th>Gold</th><th>Silver</th><th>Bronze</th><th>Total</th></tr></thead>
    <tbody id="rankings-body"></tbody>
</table>
```

```JavaScript
const vm = {
    rankings: [
        { rank: 1, noc: 'United States', gold: 40, silver: 44, bronze: 42, total: 126 },
        { rank: 2, noc: 'China', gold: 40, silver: 27, bronze: 24, total: 91 },
        // ...
    ]
};

await assignFromAsync(document.getElementById('rankings-body') /** this is the target **/, {
    '?. =>': {
        do: 'builtIns.manageTemplateList',
        resolve: {
            forEach: '?.rankings',
            instantiate: 'globalThis://country-ranking',
        },
        fromEachItem: {
            toClone: { '?.querySelector?.tr?.ish': '?.' },
            withOptions: {
                withMethods: ['querySelector'],
                infer: { byItemprop: true }
            },
            resolve: { key: '?.rank' }
        }
    }
}, {
    from: vm, /** this is the host **/
    protocols: { globalThis: k => globalThis[k] }
});
```

## Config Structure

```JavaScript
{
    do: 'builtIns.manageTemplateList',
    
    // List-level parameters (resolved against options.from)
    resolve: {
        forEach: '?.path.to.iterable',     // The iterable to loop over
        instantiate: 'globalThis://templateId',  // Template to clone
        method: 'appendChild',              // 'appendChild' | 'prepend' | 'after'
        forget: false,                      // Remove (true) or hide (false) deleted items
        markerName: 'myList',              // Override auto-derived marker name
        waitForSettled: false,             // Wait for async rendering before DOM commit
    },

    // Per-item configuration
    fromEachItem: {
        // Pattern applied to each clone (from = current array item)
        toClone: {
            '?.querySelector?.tr?.ish': '?.'   // e.g., set ish to the whole item
        },
        // Options for the per-item assignFrom call
        withOptions: {
            withMethods: ['querySelector'],
            infer: { byItemprop: true }
        },
        // Per-item resolved values (key is required for reconciliation)
        resolve: {
            key: '?.rank'   // Stable identity for reconciliation
        }
    },

    // Shared data from the outer source (optional)
    fromHost: {
        toClone: {
            '?.querySelector?.[part~="total"]?.textContent': '?.totalMedalCount'
        },
        withOptions: {
            withMethods: ['querySelector']
        }
    }
}
```

## How It Works

### First Call (Initial Render)

1. Resolves `forEach` → gets the iterable (array, Set, NodeList, etc.)
2. Resolves `instantiate` → gets the HTMLTemplateElement or DocumentFragment
3. Creates comment markers in the target (`<!--?start name="..."-->` / `<!--?end-->`)
4. For each item in the iterable:
   - Clones the template
   - Calls `assignFrom(clone, toClone, { from: item, ...withOptions })`
   - If `fromHost` is configured, also calls `assignFrom(clone, fromHost.toClone, { from: outerVM, ...fromHost.withOptions })`
   - Resolves the `key` from the item
5. Buffers all clones into a DocumentFragment
6. If `waitForSettled` is enabled, waits for async mutations to quiesce
7. Inserts the fragment between the markers in one DOM operation

The handler is asynchronous (it resolves `forEach` / `instantiate` with `resolve`, and may wait or yield), so **await it with `assignFromAsync`**. With the synchronous `assignFrom`, the call returns before the clones are in the DOM.

### Subsequent Calls (Reconciliation)

On each subsequent call with the same target:

| Scenario | Action |
|----------|--------|
| New key appeared | Clone template, apply assignments, insert at the item's position |
| Key disappeared | Hide (`hidden` attribute) or remove (if `forget: true`) |
| Key still present | Update clone in place (re-run `assignFrom`, no re-cloning) |
| Order changed | Move items into key order with as few DOM moves as possible |

**Ordering.** The clones always end up in the iterable's order:
- **Appending or updating** (kept items in their old order, new items only at the end) is still a single fragment insertion.
- **Reordering, or new items among existing ones,** keeps the longest run of items already in order and moves only the rest (`utils/placeNodes.ts`, shared with `builtIns.tree`). Swapping two of 1,000 rows is 2 moves.
- **Multi-node items move as a unit.**

(Before this, existing clones were never moved, so reorders and mid-list insertions weren't reflected in the DOM.)

State is tracked via a WeakMap keyed by the start comment marker.

## Keyed Reconciliation

The `key` field in `fromEachItem.resolve` provides stable identity:

```JavaScript
resolve: { key: '?.id' }      // Use item.id as the key
resolve: { key: '?.rank' }    // Use item.rank as the key
```

Without `key`, positional matching is used (item[0] → clone[0], item[1] → clone[1]). This works for static lists but breaks when items are inserted/removed from the middle.

## Shared Parent Data (`fromHost`)

Values from the outer VM (not from individual items) can be applied to each clone:

```JavaScript
fromHost: {
    toClone: {
        '?.querySelector?.[part~="totalMedalCount"]?.textContent': '?.totalMedalCount'
    },
    withOptions: { withMethods: ['querySelector'] }
}
```

This runs after `fromEachItem` assignments on each clone (both new and existing).

## Wait for Settled (`waitForSettled`)

When clones trigger async work (itemscope managers, enhancements, features), you can wait for the fragment to settle before inserting into the live DOM:

```JavaScript
resolve: {
    forEach: '?.items',
    instantiate: 'globalThis://myTemplate',
    waitForSettled: true,                    // Default: 100ms idle, no timeout
    // Or:
    waitForSettled: { idleMs: 50, timeout: 2000 }
}
```

- `idleMs` — debounce window (default: 100ms). Resolves when no mutations for this duration.
- `timeout` — maximum wait. If exceeded, inserts fragment anyway with a console warning.

## Yielding for Large Lists (`yieldEvery`)

For very large lists, synchronous processing of all items can freeze the browser. Use `yieldEvery` to periodically yield to the event loop, allowing the browser to paint and handle input:

```JavaScript
resolve: {
    forEach: '?.data',
    instantiate: 'globalThis://row-tpl',
    yieldEvery: 1000,  // yield to browser every 1000 items
}
```

- Items 0 through 999 are processed synchronously (no yield before the first batch)
- At every Nth item (1000th, 2000th, etc.), the handler yields via `setTimeout(0)` before continuing
- Default: `undefined` (no yielding — all items processed in one synchronous block)

This prevents jank for lists with tens of thousands of items while maintaining near-optimal performance for typical list sizes.

## Insertion Methods

| `method` | Behavior |
|----------|----------|
| `'appendChild'` (default) | Markers + content appended inside target |
| `'prepend'` | Markers + content prepended inside target |
| `'after'` | Markers + content as siblings after target |

## Multi-Element Templates (`configs`)

When a template contains multiple top-level elements (e.g., two `<tr>` rows per item), use the `configs` array to assign to each element separately:

```html
<template id="item-tpl">
    <tr class="header-row">
        <td class="id-cell"></td>
        <td class="label-cell"></td>
    </tr>
    <tr>
        <td class="desc-cell"></td>
        <td class="status-cell"></td>
    </tr>
</template>
```

```JavaScript
fromEachItem: {
    configs: [
        {
            toClone: {
                '#[a]?.textContent': '?.id',
                '#[b]?.textContent': '?.label',
            },
            withOptions: {
                at: { a: [0], b: [1] }  // first <tr>'s children
            }
        },
        {
            toClone: {
                '#[c]?.textContent': '?.description',
                '#[d]?.textContent': '?.status'
            },
            withOptions: {
                at: { c: [0], d: [1] }  // second <tr>'s children
            }
        }
    ],
    resolve: { key: '?.id' }
}
```

**How it works:**

- Each entry in `configs` is zipped with the corresponding top-level element in the cloned template (config[0] → first element, config[1] → second element).
- Each config has its own `toClone` and `withOptions` — coordinates in `at` are relative to *that* element.
- `resolve` stays at the top level (shared key for reconciliation — all elements belong to the same item).
- Mismatch handling: if there are more template elements than configs, extras get no assignment. If there are more configs than elements, extras are ignored.

**Without `configs` (single-element templates):**

The existing syntax still works unchanged — `toClone` and `withOptions` at the top level of `fromEachItem` apply to the first element:

```JavaScript
fromEachItem: {
    toClone: { '#[a]?.textContent': '?.id' },
    withOptions: { at: { a: [0] } },
    resolve: { key: '?.id' }
}
```

## Combining with Other Features

The handler works with all `assignFrom` features inside `withOptions`:
- `infer` — auto-distribute item properties by itemprop or name
- `withMethods` — call methods during path evaluation
- `pin` — stable element references with auto-assigned IDs (resilient to DOM mutations)
- `at` — lightweight positional references by child index (no IDs, no DOM pollution — ideal for repeated templates)
- `enhance` — bulk-apply enhancements to cloned elements

**Using `at` for per-row element access (recommended for template lists):**

```TypeScript
fromEachItem: {
    toClone: {
        '#[a]?.textContent': '?.id',
        '#[b]?.textContent': '?.label'
    },
    withOptions: {
        at: {
            a: [0],    // tr.children[0] — first <td>
            b: [1],    // tr.children[1] — second <td>
        }
    },
    get: { key: '?.id' }
}
```

`at` resolves elements by child index (~2-4ns) without assigning IDs — keeping the DOM clean when rendering thousands of rows. Use `pin` with `{ path: [...] }` instead if you need stability against future DOM structural changes (at the cost of adding ID attributes to each element).

## Optimized Binding (Direct Cell Access)

For maximum performance, use direct property path indexing instead of `infer`. Numeric segments in paths are treated as array/collection indexes:

```html
<template id="row-tpl">
    <tr>
        <td></td>
        <td></td>
        <td><button class="remove">×</button></td>
    </tr>
</template>
```

```JavaScript
const config = {
    '?. =>': {
        do: 'builtIns.manageTemplateList',
        resolve: {
            forEach: '?.data',
            instantiate: 'globalThis://row-tpl',
            forget: true,
        },
        fromEachItem: {
            toClone: {
                '?.cells?.0?.textContent': '?.id',
                '?.cells?.1?.textContent': '?.label'
            },
            resolve: { key: '?.id' }
        }
    }
};

await assignFromAsync(tbody, config, {
    from: { data },
    protocols: { globalThis: k => globalThis[k] }
});
```

This bypasses `infer` (no `querySelectorAll` per item) and directly accesses `tr.cells[0].textContent` and `tr.cells[1].textContent` via the path evaluator. Each item assignment is a simple property chain traversal — no DOM queries.

## Performance Benchmark

**A correction first.** Earlier versions of this section reported, e.g., *Create 10,000 in 13.3 ms, 23× faster than vanilla*, and a faster-than-Solid/Svelte/Lit comparison built on those numbers. **Those numbers were wrong:**
- The benchmark page called the synchronous `assignFrom`, which returns before this (async) handler has inserted the rows. So in Chromium the timer stopped **before any rows existed**: at the moment "Create 10,000 … 10.4 ms" was recorded, 0 of the 10,000 rows were in the DOM.
- "Swap rows" was also a no-op, because existing clones were never reordered.

The page now awaits `assignFromAsync`, and swaps really swap (see *Subsequent Calls*).

**Current results.** Measured on [`demos/js-framework-benchmark.html`](../demos/js-framework-benchmark.html) and its siblings, which share one harness:
- the same rows, data and operations as [js-framework-benchmark](https://github.com/krausest/js-framework-benchmark);
- ms from click until the next frame is rendered (so including the browser's layout and paint);
- medians of 9 samples (3 fresh page loads × 3 runs), one machine.

| Operation | manageTemplateList | builtIns.tree | Vanilla (createElement) | Vanilla (template clone) |
|---|---|---|---|---|
| **Chromium** | | | | |
| Create 1,000 | 29.3 | 24.0 | 22.2 | 24.0 |
| Append 1,000 | 57.5 | 46.7 | 44.9 | 48.0 |
| Update every 10th | 48.6 | 33.0 | 45.6 | 33.5 |
| Swap rows 1↔998 | 41.7 | 15.3 | 45.5 | 19.8 |
| Clear | 23.6 | 16.4 | 18.9 | 17.6 |
| Create 10,000 | 299.8 | 296.9 | 259.9 | 292.8 |
| **Firefox** | | | | |
| Create 1,000 | 31 | 23 | 22 | 23 |
| Append 1,000 | 50 | 34 | 49 | 47 |
| Update every 10th | 40 | 26 | 46 | 28 |
| Swap rows 1↔998 | 39 | 12 | 47 | 21 |
| Clear | 56 | 44 | 46 | 45 |
| Create 10,000 | 336 | 259 | 221 | 255 |

**Reading the numbers:**
- **Rendering dominates.** For 10,000 rows, the browser's style, layout and paint is most of each total.
- **The pages split the time.** Each result line also shows a **script** time: until the rows are in the DOM and handed to the browser, which is the part the library controls. A **`?cv`** option lays the table out as a grid with `content-visibility: auto` on each row, so off-screen rows skip layout and paint. That roughly halves the totals.
- **Script time, from single samples (Chromium, Create 10,000):**
  - `manageTemplateList` ~90–150 ms;
  - `builtIns.tree` ~80 ms;
  - vanilla `createElement` ~30 ms.
- **`manageTemplateList` is close to vanilla on totals,** but it's the slowest of the four on most operations here. Its per-item work goes through the general `assignFrom` path; this page uses `pin` bindings.
- WebKit was measured too, but its timings varied too much between runs on the benchmark machine to tabulate.

The vanilla template-clone page was measured before two fixes to that page, which may lower its numbers somewhat: a per-row `await` was removed, and its template is now written on one line, without whitespace text nodes.

## manageTemplateList and builtIns.tree

[`builtIns.tree`](./tree.md) also renders keyed lists (a repeat: `{ each, of, key, empty }`). For lists whose markup is defined in JavaScript, it's currently the faster choice on these benchmarks. Its extras:
- nesting, `empty`, itemscope managers as view models;
- an opt-in template `compile` mode.

**`manageTemplateList` is the choice when the markup already exists as HTML.** It clones a `<template>` (or fragment) authored in the page, or derived from server-rendered markup, as `three-peat` does. Its other features have no Tree equivalent yet:
- `infer` / `itemprop` distribution;
- hiding removed items instead of removing them (`forget: false`);
- `method: 'prepend' | 'after'` placement;
- multi-element items (`configs`);
- `fromHost`;
- `waitForSettled`;
- `yieldEvery`.
