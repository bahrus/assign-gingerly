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
                inferredAssignments: { byItemprop: true }
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
            inferredAssignments: { byItemprop: true }
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

## Insertion Methods

| `method` | Behavior |
|----------|----------|
| `'appendChild'` (default) | Markers + content appended inside target |
| `'prepend'` | Markers + content prepended inside target |
| `'after'` | Markers + content as siblings after target |

## Combining with Other Features

The handler works with all `assignFrom` features inside `withOptions`:
- `inferredAssignments` — auto-distribute item properties by itemprop
- `withMethods` — call methods during path evaluation
- `withIds` — cached element references within each clone
- `enhance` — bulk-apply enhancements to cloned elements
