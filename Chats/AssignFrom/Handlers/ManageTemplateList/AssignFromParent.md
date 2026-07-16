# Assign From Parent

---

## Human Ask

The ManageTemplateList handler has been implemented.  

One aspect we pushed to phase II is support for accessing the parent vm. 

## Kiro's suggestions

### Preliminary Thoughts on Parent-to-Fragment Assignment (Phase II)

The question: how does `totalMedalCount` from the *parent VM* get into each cloned row?

Current model: `fromEachItem` uses each array item as `from`. But some values come from the parent scope (e.g., aggregate totals, shared config).

**Options I can see:**

1. **Explicit `fromParent` block** — a second assignment pass that uses the outer `from` (the full VM):
   ```js
   fromEachItem: {
       assignToFragment: { ... },  // from = each item
       assignFromParent: {          // from = outer vm
           '?.querySelector?.[part~="totalMedalCount"]?.textContent': '?.totalMedalCount'
       }
   }
   ```

2. **Merge contexts** — the item inherits/shadows the parent VM. Each item's `from` is `{ ...parentVM, ...item }`. This means `'?.totalMedalCount'` resolves from the parent when not on the item. Simple but implicit.

3. **Protocol-based** — a `parent://totalMedalCount` protocol that resolves against the outer VM from within the inner context.

I'd lean toward option 1 (explicit `fromParent` block) for clarity — you see exactly what comes from where. But this is Phase II territory.

## Human Ask, continued

I'd like to propose a variation on Option 1:

```JavaScript
const olympics2024Summary = {
    rankings: [
        { rank: 1, noc: 'United States', gold: 40, silver: 44, bronze: 42, total: 126 },
        { rank: 2, noc: 'China', gold: 40, silver: 27, bronze: 24, total: 91 },
        { rank: 3, noc: 'Great Britain', gold: 14, silver: 22, bronze: 29, total: 65 },
        { rank: 4, noc: 'France', gold: 16, silver: 26, bronze: 22, total: 64 },
        { rank: 5, noc: 'Australia', gold: 18, silver: 19, bronze: 16, total: 53 },
        { rank: 6, noc: 'Japan', gold: 20, silver: 12, bronze: 13, total: 45 },
        { rank: 7, noc: 'South Korea', gold: 13, silver: 9, bronze: 10, total: 32 },
        { rank: 8, noc: 'Italy', gold: 12, silver: 13, bronze: 15, total: 40 },
        { rank: 9, noc: 'Netherlands', gold: 15, silver: 7, bronze: 12, total: 34 },
        { rank: 10, noc: 'Germany', gold: 12, silver: 13, bronze: 8, total: 33 },
    ],
    totalMedalCount: 583
};
assignFrom(document.body, {
    '?.querySelector?.tbody =>': {
        do: 'builtIns.manageTemplateList',
        resolve: {
            //must support iterables, not just arrays
            forEach: "?.rankings",
            instantiate: 'globalThis://country-ranking',
            //same meaning as with lazyLoad
            forget: false, // default
            /** Override auto-derived marker name */
            /** Pseudo code, just specifying what is supported: **/

            /** Insert method: 'appendChild' (default), 'prepend', or 'after' (sibling after target) */
            method?: string,
            
            /** Optional async callback invoked after cloning, resolved from the VM */
            onInstantiated?: string,
            
            /** Override auto-derived marker name */
            markerName?: string,


        },
        
        //uses assignFrom where from is each ranking item from the vm
        fromEachItem: {
            assignToFragment:{
                '?.querySelector?.tr?.ish': '?.'
            },
            withOptions: {
                withMethods: ['querySelector'],
                inferredAssignments: true
            },
            //optional?
            resolve: {
                key: '?.rank'
            }
        },

        fromFrom: {
            assignToFragment: {
                '?.querySelector?.[part~="totalMedalCount"]?.textContent': '?.totalMedalCount'
            },
            withOptions: {
                withMethods: ['querySelector'],
            }
        }


    }
}, {
    withMethods: ['querySelector'],
    from: olympics2024Summary,
    protocols: { 
        globalThis: k => globalThis[k] 
    }
});
```

Can you suggest a better name than fromFrom, which is admittedly a bit silly sounding?  






---

## Response

### The Concept is Clear

A second assignment pass on each cloned fragment, but sourced from the *outer* VM (the `from` object passed to `assignFrom`) rather than from the individual array item. This gives each row access to aggregate/shared data (like `totalMedalCount`) that doesn't live on the item itself.

### On the Name `fromFrom`

Yeah, it's a bit recursive. The challenge is communicating "from the outer `from`" — which is inherently self-referential.

Here are some alternatives:

| Name | Reads as... | Feel |
|------|-------------|------|
| `fromFrom` | "From the from" | Silly but accurate |
| `fromParent` | "From the parent scope" | Clear, but "parent" could confuse with DOM parent |
| `fromSource` | "From the source object" | Neutral, avoids "parent" ambiguity |
| `fromContext` | "From the surrounding context" | Broad, slightly vague |
| `fromScope` | "From the enclosing scope" | JavaScript-y, clear to developers |
| `fromOuter` | "From the outer source" | Direct, no ambiguity |
| `withShared` | "With shared data" | Describes intent rather than mechanism |
| `sharedAssign` | "Shared assignment" | Clear intent |
| `perClone` | "Per clone from outer" | Hmm, doesn't say where from |
| `fromVM` | "From the view model" | Assumes the source is a VM (not always) |

### My Pick: `fromSource`

It reads naturally in context:

```js
fromEachItem: { ... },   // "from each item" — source is the array element
fromSource: { ... },      // "from source" — source is the outer `from` object
```

The word "source" maps directly to `options.from` — which is the source object. No ambiguity about DOM parents or scope chains.

Runner-up: `fromOuter` — more explicit about the "outer" relationship, but slightly more jargon-y.

### Alternative Framing

If the name should describe *what it does* rather than *where data comes from*:

| Name | Reads as... |
|------|-------------|
| `applyShared` | "Apply shared data to each clone" |
| `injectShared` | "Inject shared data" |

But these break the `from___` naming pattern established by `fromEachItem`.

### My Recommendation

**`fromSource`** — keeps the `from___` pattern, is descriptive, and reads well alongside `fromEachItem`.

```js
fromEachItem: {
    assignToFragment: { '?.querySelector?.tr?.ish': '?.' },
    withOptions: { withMethods: ['querySelector'], inferredAssignments: true },
    resolve: { key: '?.rank' }
},
fromSource: {
    assignToFragment: {
        '?.querySelector?.[part~="totalMedalCount"]?.textContent': '?.totalMedalCount'
    },
    withOptions: { withMethods: ['querySelector'] }
}
```

Does `fromSource` work for you?

## Human Response I

Yes, let's go with fromSource

## Implementation Notes

Let me implement `fromSource` in the `manageTemplateList` handler. The change: after processing each item's `fromEachItem` assignments, run a second `assignFrom` pass on each clone using the outer `from` (the parent VM) with `fromSource`'s config.

The handler's `assign` method receives `resolvedParams` and has access to `this.config`. The outer `from` is passed via the third parameter to `assign` — let me check:

Good — `options` (which contains `from`) is passed as the third argument. Let me update the handler to use it:

Now I need to add the `fromSource` assignment after each clone's `fromEachItem` assignment. Let me find where existing items are updated and new items are cloned:

I need to add `fromSource` assignment after both the existing-item update and the new-item clone:

Now update the JS file similarly:

Now update the reconciliation loop in the JS file:

Let me verify diagnostics:

Run tests:

All passing. Implemented:

**`fromSource` in `manageTemplateList.ts/.js`:**

- Reads `this.config.fromSource` config block (same shape as `fromEachItem`: `assignToFragment` + `withOptions`)
- After each clone's per-item assignment (`fromEachItem`), runs a second `assignFrom` pass using `options.from` (the outer parent VM) as the source
- Applied to both new clones and existing items being updated in place
- Only runs if `fromSource.assignToFragment` is defined and `options.from` exists
- Handler signature updated to accept the `options` third parameter

**Usage:**
```js
{
    do: 'builtIns.manageTemplateList',
    resolve: { forEach: '?.rankings', instantiate: 'globalThis://country-ranking' },
    fromEachItem: {
        assignToFragment: { '?.querySelector?.tr?.ish': '?.' },
        withOptions: { withMethods: ['querySelector'], inferredAssignments: true },
        resolve: { key: '?.rank' }
    },
    fromSource: {
        assignToFragment: {
            '?.querySelector?.[part~="totalMedalCount"]?.textContent': '?.totalMedalCount'
        },
        withOptions: { withMethods: ['querySelector'] }
    }
}
```

Each cloned row gets both its item data (via `fromEachItem`) AND shared parent data like `totalMedalCount` (via `fromSource`).