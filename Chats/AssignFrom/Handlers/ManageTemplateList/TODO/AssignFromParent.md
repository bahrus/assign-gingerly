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





