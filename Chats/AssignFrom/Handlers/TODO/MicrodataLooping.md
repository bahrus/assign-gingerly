# Microdata Looping

---

## Human Ask

```html
<template id=country-ranking>
    <tr 
        itemscope="CountryMedalsCount"
    >
        <td itemprop=rank></td>
        <td itemprop=noc></td>
        <td itemprop=gold></td>
        <td itemprop=silver></td>
        <td itemprop=bronze></td>
        <td><span itemprop=total></span> of <span -o=totalMedalCount></span></td>
    </tr>
</template>
...
<table id=table>
    <thead>
        <tr>
            <th>Rank</th>
            <th>NOC</th>
            <th>Gold</th>
            <th>Silver</th>
            <th>Bronze</th>
            <th>Total</th>
        </tr>
    </thead>
    <tbody>
    </tbody>
</table>
```

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
    ]
} ;
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
            markerName?: string;
        },
        forEachItem: {
            assign:{

            }
            withOptions: {
                inferredAssignments: true
            }
        },
        //itemscopeMgr: 'CountryMedalsCount',
        protocols: { 
            globalThis: k => globalThis[k] 
        }
    }
}, {
    withMethods: ['querySelector'],
    from: olympics2024Summary
})
```

---

## High-Level Feedback

### What I Understand the Goal to Be

A handler that:
1. Takes an iterable (`forEach`) and a template (`instantiate`)
2. Clones the template once per item in the iterable
3. For each cloned instance, distributes the item's properties into the clone using inferred assignments (itemprop matching)
4. Manages the list over time — add/remove/reorder clones as the iterable changes

This is the "repeater" pattern — the declarative equivalent of `for (const item of list) { clone template, fill in values, append }`.

### What Reads Clearly

- `forEach: '?.rankings'` — the source iterable (resolved path)
- `instantiate: 'globalThis://country-ranking'` — the template to clone
- `forget`, `method`, `markerName` — reuse of lazyLoad semantics for where/how content is placed
- `inferredAssignments: true` inside `forEachItem` — each cloned item's properties are distributed by itemprop automatically

### Questions / Areas of Uncertainty

1. **`forEachItem` vs `resolve`** — the config has both a `resolve` block (for the list-level params) and a `forEachItem` block (for per-item behavior). Is `forEachItem` processed once per cloned item? And does `forEachItem.assign` use `assignFrom` semantics (paths resolved against each array item as `from`)?

2. **Where does `protocols` live?** In your example it's a sibling of `resolve` and `forEachItem` inside the handler config. Currently, `protocols` lives in `AssignFromOptions` (the outer options), not in the handler config. Is this intentional — should the handler have its own protocol map, or should it inherit from the outer `assignFrom` options?

3. **The `withOptions` inside `forEachItem`** — is this the per-item `assignFrom` options? If so, `inferredAssignments: true` there would mean "for each cloned row, find `[itemprop]` elements and set values from the item object." That's elegant and leverages existing infrastructure.

4. **Update semantics** — when `assignFrom` is called again with a new/modified `rankings` array, what happens?
   - Items added → new clones appended
   - Items removed → clones hidden/removed (based on `forget`)
   - Items reordered → reorder clones? Or destroy + recreate?
   - Items modified (same position, different values) → update in place via inferredAssignments?

   This is the most complex part of a repeater. A keying strategy (like React's `key` prop) would help identify which items are the same across updates.

5. **The commented-out `itemscopeMgr: 'CountryMedalsCount'`** — is this an alternative to `inferredAssignments`? i.e., instead of distributing values via itemprop inference, route the whole item through the itemscope manager's `ish` property? If so, it's another mode: "clone template, set clone.ish = item" vs "clone template, infer-assign item properties."

### Suggestions

- **Keep the handler focused on cloning + list management.** Let `inferredAssignments` (or `ish`) handle the per-item value distribution. The handler's job: clone N times, track which clones map to which items, add/remove as needed.

- **Consider a `key` field** for stable identity across updates: `key: 'rank'` (or `key: '?.noc'`). Without it, the handler can only do positional matching (item[0] → clone[0]) which breaks on reordering.

- **The `-o=totalMedalCount` attribute in the template** — this looks like a different binding mechanism (maybe from a different enhancement?). Should the handler ignore attributes it doesn't understand and let other enhancements handle them?

### Summary

The concept is sound and builds naturally on the existing infrastructure (markers, inferredAssignments, templates, protocols). The main design decisions are around update semantics (keying, reorder, in-place update vs recreate) — but those can be phase II. A first pass that just clones N times and infer-assigns would already be useful.

---

## Human Response

>  Is forEachItem processed once per cloned item? And does forEachItem.assign use assignFrom semantics (paths resolved against each array item as from)

Yes to both.  Maybe a different name would make it clearer.  I will try below with a clearer now (probably too verbose).  Maybe we can find a way to make it more concise without loosing meaning.

> Where does protocols live?

I misplaced it unintentionally.  I will provide the corrected syntax below.

>  The withOptions inside forEachItem — is this the per-item assignFrom options?

Yes

>  Updated Semantics

This is an area where I will definitely want to lean the most on your expertise, especially on how libraries like lit and solidjs manage such things.  I think solidjs put a lot of effort into optimizing this, and may be one of the fast performing, so any lessons learned from those libraries could be beneficial.

One aspect I'm quite confident of is that we want to buffer / merge multiple cloned rows into a "buffering fragment", then append that fragment to the target.

And I think we may want an optional setting to allow the fragment to "settle" before adding to the live DOM tree, especially when asynchronous processing takes place.  Phase II. 

Syntax, take two, based on your feedback:


```JavaScript
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
            markerName?: string;
        },
        
        //uses assignFrom where from is each ranking item from the vm
        fromEachItem: {
            assignToFragment:{
                //I think we settled what this should be on the rhs, but
                //I can't remember if it should just be '.'.
                '?.tr?.ish': '?.' 
            },
            withOptions: {
                inferredAssignments: true
            },
            //optional?
            resolve: {
                key: '?.rank'
            }
        },
        //itemscopeMgr: 'CountryMedalsCount',

    }
}, {
    withMethods: ['querySelector'],
    from: olympics2024Summary,
    protocols: { 
        globalThis: k => globalThis[k] 
    }
});
```


---

## Response to Updated Proposal

### On the Key

`resolve: { key: '?.rank' }` inside `fromEachItem` — this makes sense. The key is resolved per-item (against each array element), producing a stable identity value. The handler uses it to match existing clones to items across updates.

**It reads well.** "From each item, resolve the key from `item.rank`." Clean.

**One thought on placement:** Since `key` is really a list-management concern (how to reconcile old vs new items), it could arguably live in the outer `resolve` block (alongside `forEach`, `instantiate`, `forget`) rather than inside `fromEachItem`. It's not something you "do to each item" — it's something the handler uses to *identify* each item.

Compare:
```js
// Option A: key in fromEachItem.resolve (your proposal)
fromEachItem: {
    resolve: { key: '?.rank' }
}

// Option B: key in the outer resolve
resolve: {
    forEach: '?.rankings',
    instantiate: 'globalThis://country-ranking',
    key: '?.rank',  // resolved per-item, but declared at the list level
}
```

Option B reads as "the key for this list is `rank`" which is how most frameworks express it (React's `key`, Lit's `repeat(items, item => item.rank, ...)`). Option A reads as "for each item, resolve a key" — more explicit but slightly unusual.

I could go either way. If you prefer A (keeps `resolve` blocks self-contained per scope), that works.

### On `assignToFragment`

The name `assignToFragment` communicates that assignments target the buffered fragment (not the live DOM). That's good — it sets the expectation that work happens off-screen.

The `'?.tr?.ish': '?.'` pattern — this navigates into the cloned fragment's `<tr>` element and sets its `ish` to the entire item object. Combined with `inferredAssignments: true` in `withOptions`, the itemscope manager (or direct inference) handles distributing the item's properties.

**Quick note on `'?.'`:** Yes, we settled that `'?.'` resolves to the source object itself (the item in this case). That's the right RHS.

### On `fromEachItem` as the Name

I think `fromEachItem` reads clearly — "from each item in the iterable, do this." It's more explicit than the previous `forEachItem`. The "from" prefix connects to the `assignFrom` semantics (each item becomes the `from` source).

### Remaining High-Level Thoughts

1. **Buffering into a fragment before appending** — good default. Clone all items into a `DocumentFragment`, then insert the fragment once. Minimizes reflows.

2. **The `key` enables** three operations on update:
   - New key appeared → clone + append
   - Key disappeared → hide/remove (based on `forget`)
   - Key still present → update in place (re-run `assignToFragment` on existing clone)
   - Key moved position → reorder DOM nodes (phase II — can skip initially and just update in place regardless of position)

3. **Without `key`** — positional matching (item[i] → clone[i]). Simpler but breaks on insert/remove in the middle.

4. **SolidJS lessons** (since you asked):
   - SolidJS's `<For>` uses keyed reconciliation by reference equality (or explicit key function)
   - It diffs the key list to produce a minimal set of DOM operations (move, insert, remove)
   - It avoids touching DOM nodes whose key+value haven't changed
   - The key insight: separate "which nodes exist" (structural diff) from "what values they show" (reactive update). Your architecture already does this — the handler manages structure, `inferredAssignments` manages values.

### Summary

The proposal is coherent. I'd say the main decision remaining is whether `key` lives in `fromEachItem.resolve` or the outer `resolve`. Both work — it's a readability preference. Everything else is clear enough to move toward implementation when you're ready.

---

## Human Response II

First, just to be clear, my previous example still had some mistakes:

```JS
//uses assignFrom where from is each ranking item from the vm
fromEachItem: {
    assignToFragment:{
        //I think we settled what this should be on the rhs, but
        //I can't remember if it should just be '.'.
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
...
```

I don't think the inner assign (assignToFragment) should inherit any options from the outer assign.

I think it would be confusing to include "?.key" in the outer assign, because I think the context of where resolve resolves from is from the vm, not from each item.

If anything, a more viable alternative in my mind, would be to make it a top level parameter of the outer assign.  But I think where I've placed it will make a bit more sense to developers.  I'm open to changing the name from "resolve" to something else, but nothing jumps out at me, and I think resolve sounds "warm and fuzzy" to my sensibility due to our previous use.

Don't worry about  -o=totalMedalCount for now.

But I do wonder how we can support assigning from the parent assign into the fragment.  Let's address that in Phase II.  Feel free to add your preliminary thoughts.






---

## Response to Human Response II

### All Clear — Ready to Implement

The corrected example makes sense:

```js
fromEachItem: {
    assignToFragment: {
        '?.querySelector?.tr?.ish': '?.'
    },
    withOptions: {
        withMethods: ['querySelector'],
        inferredAssignments: true
    },
    resolve: {
        key: '?.rank'
    }
}
```

Key decisions confirmed:
- **No option inheritance** from outer → inner. `fromEachItem.withOptions` is self-contained.
- **`key` stays in `fromEachItem.resolve`** — resolved per-item. Makes sense because the key *comes from* each item.
- **`resolve` as the name** — fine. It's the established pattern for "these paths get resolved against the source."
- **`assignToFragment`** — the pattern object where `from` = the current item, applied to the cloned fragment.

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

### Implementation Plan (Phase I)

What I'll build:

1. **`handlers/manageTemplateList.ts/.js`** — new built-in handler
2. **Core flow:**
   - Resolve `forEach` (iterable) and `instantiate` (template)
   - Find or create markers (reusing `markerUtils`)
   - On first call: clone template per item → fragment → insert between markers
   - On subsequent calls: reconcile by `key` (add new, remove missing, update existing in place)
   - For each item: call `assignFrom(clonedElement, assignToFragment, { from: item, ...withOptions })`
3. **Register in `BUILT_IN_MAP`**
4. **Fragment buffering** — batch all clones into a DocumentFragment before inserting

Shall I proceed?

## Human Response III

Yes, please

---

## Implementation Notes

Now register in `BUILT_IN_MAP`:

Add to `package.json` exports:

Let me verify diagnostics:

Run tests:

All passing. Here's what was implemented:

**`handlers/manageTemplateList.ts/.js`** — new built-in handler:

**Core flow:**
1. Resolves `forEach` (iterable) and `instantiate` (template) from the handler's `resolve` block
2. Finds or creates comment markers in the target using `markerUtils`
3. Resolves per-item `key` (from `fromEachItem.resolve.key`) using `resolveValue` — falls back to positional index if no key specified
4. **Reconciliation by key:**
   - Keys that disappeared → hide (or remove if `forget: true`)
   - Keys that already exist → update in place via `assignFrom(existingClone, assignToFragment, { from: item, ...withOptions })`
   - New keys → clone template, apply `assignFrom`, buffer into fragment
5. **Fragment buffering** — all new clones are batched into a `DocumentFragment` before a single DOM insertion
6. Tracks state via `WeakMap<startMarker, { keyToNodes, keyOrder }>` for efficient subsequent updates

**Config structure:**
```js
{
    do: 'builtIns.manageTemplateList',
    resolve: {
        forEach: '?.rankings',
        instantiate: 'globalThis://country-ranking',
        method: 'appendChild',
        forget: false,
        markerName: 'rankings',
    },
    fromEachItem: {
        assignToFragment: { '?.querySelector?.tr?.ish': '?.' },
        withOptions: { withMethods: ['querySelector'], inferredAssignments: true },
        resolve: { key: '?.rank' }
    }
}
```

**Registered in `BUILT_IN_MAP`** and `package.json` exports.


