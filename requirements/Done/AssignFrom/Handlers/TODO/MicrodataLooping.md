# Microdata Looping

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