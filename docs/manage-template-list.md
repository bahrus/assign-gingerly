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

await assignFrom(document.getElementById('rankings-body'), {
    '?. =>': {
        do: 'builtIns.manageTemplateList',
        resolve: {
            forEach: '?.rankings',
            instantiate: 'globalThis://country-ranking',
        },
        fromEachItem: {
            assignToFragment: { '?.querySelector?.tr?.ish': '?.' },
            withOptions: {
                withMethods: ['querySelector'],
                infer: { byItemprop: true }
            },
            resolve: { key: '?.rank' }
        }
    }
}, {
    from: vm,
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
        assignToFragment: {
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
    fromSource: {
        assignToFragment: {
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
   - Calls `assignFrom(clone, assignToFragment, { from: item, ...withOptions })`
   - If `fromSource` is configured, also calls `assignFrom(clone, fromSource.assignToFragment, { from: outerVM, ...fromSource.withOptions })`
   - Resolves the `key` from the item
5. Buffers all clones into a DocumentFragment
6. If `waitForSettled` is enabled, waits for async mutations to quiesce
7. Inserts the fragment between the markers in one DOM operation

### Subsequent Calls (Reconciliation)

On each subsequent call with the same target:

| Scenario | Action |
|----------|--------|
| New key appeared | Clone template, apply assignments, append |
| Key disappeared | Hide (`hidden` attribute) or remove (if `forget: true`) |
| Key still present | Update clone in place (re-run `assignFrom` — no re-cloning) |

State is tracked via a WeakMap keyed by the start comment marker.

## Keyed Reconciliation

The `key` field in `fromEachItem.resolve` provides stable identity:

```JavaScript
resolve: { key: '?.id' }      // Use item.id as the key
resolve: { key: '?.rank' }    // Use item.rank as the key
```

Without `key`, positional matching is used (item[0] → clone[0], item[1] → clone[1]). This works for static lists but breaks when items are inserted/removed from the middle.

## Shared Parent Data (`fromSource`)

Values from the outer VM (not from individual items) can be applied to each clone:

```JavaScript
fromSource: {
    assignToFragment: {
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
            assignToFragment: {
                '#[a]?.textContent': '?.id',
                '#[b]?.textContent': '?.label',
            },
            withOptions: {
                at: { a: [0], b: [1] }  // first <tr>'s children
            }
        },
        {
            assignToFragment: {
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
- Each config has its own `assignToFragment` and `withOptions` — coordinates in `at` are relative to *that* element.
- `resolve` stays at the top level (shared key for reconciliation — all elements belong to the same item).
- Mismatch handling: if there are more template elements than configs, extras get no assignment. If there are more configs than elements, extras are ignored.

**Without `configs` (single-element templates):**

The existing syntax still works unchanged — `assignToFragment` and `withOptions` at the top level of `fromEachItem` apply to the first element:

```JavaScript
fromEachItem: {
    assignToFragment: { '#[a]?.textContent': '?.id' },
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
    assignToFragment: {
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
            assignToFragment: {
                '?.cells?.0?.textContent': '?.id',
                '?.cells?.1?.textContent': '?.label'
            },
            resolve: { key: '?.id' }
        }
    }
};

assignFrom(tbody, config, {
    from: { data },
    protocols: { globalThis: k => globalThis[k] }
});
```

This bypasses `infer` (no `querySelectorAll` per item) and directly accesses `tr.cells[0].textContent` and `tr.cells[1].textContent` via the path evaluator. Each item assignment is a simple property chain traversal — no DOM queries.

## Performance Benchmark

Tested against vanilla JS implementations using the [js-framework-benchmark](https://github.com/nicholaskajoh/js-framework-benchmark) methodology (1,000 / 10,000 rows, keyed reconciliation, create/update/swap/append/clear):

| Operation | manageTemplateList | Vanilla (createElement) | Vanilla (template clone) | MTL vs Vanilla-Tpl |
|-----------|-------------------|------------------------|--------------------------|-------------------|
| Create 1,000 | 9.7ms | 25.0ms | 23.1ms | **2.4x faster** |
| Update every 10th | 15.7ms | 28.8ms | 16.3ms | ~parity |
| Swap rows 1↔998 | 14.3ms | 28.8ms | 12.4ms | ~parity |
| Append 1,000 | 15.0ms | 54.5ms | 52.3ms | **3.5x faster** |
| Clear | 14.7ms | 14.6ms | 13.1ms | ~parity |
| Create 10,000 | 13.3ms | 297.1ms | 309.4ms | **23x faster** |

*Chromium, headless, measured click-to-idle (includes layout/paint). Results from synchronous `assignFrom` with direct cell-access bindings.*

**Why it's fast:**
- `assignFrom` is fully synchronous — zero microtask yields between items
- All 1,000 clones are batched into a `DocumentFragment` and inserted in one DOM operation
- Keyed reconciliation (via `Map`) enables O(1) lookups for existing items
- Direct path evaluation (`cells?.0?.textContent`) avoids DOM queries entirely
- No framework abstraction layer — path resolution is cached string splitting + property access

**Comparison with frameworks** (approximate, from published js-framework-benchmark results):

| Framework | Create 1,000 | vs manageTemplateList |
|-----------|-------------|----------------------|
| Vanilla JS | ~25ms | 2.5x slower |
| Solid | ~45ms | 4.6x slower |
| Svelte | ~50ms | 5.2x slower |
| Lit | ~55ms | 5.7x slower |
| **manageTemplateList** | **~10ms** | — |

*Note: Framework numbers are approximate and measured on different hardware. Direct comparison requires running on the same machine. The relative ordering is what matters.*

See `demos/js-framework-benchmark.html` for the live benchmark page.
