# Support for Merging in Repeated Template Instantiation

This idea is very sketchy at this point.  Hear me out.

I would like to enhance the asynchronous assignFrom so that:

1.  If the lhs points to a DOM Node that has an itemscope attribute that specifies the name of an itemscope manager
2.  Maybe the lhs ends with a special operator
3.  The rhs points to an object that provides the following configuration information:
    1.  A name of (usually) another itemscope manager
    2.  A list of objects (or softer, an iterable)
    3.  


```html
<body>
    ...
    <table itemscope=WorldRankingList>
        <thead>
            <tr>
                <th>Rank</th>
                <th>NOC</th>
                <th>Gold</th>
                <th>Silver</th>
                <th>Bronze</th>
                <th>Total</th>
        </thead>
        <tbody>

            <tr 
                per-each="Country of WorldRankingList">
                <td itemprop=rank></td>
                <td itemprop=noc></td>
                <td itemprop=gold></td>
                <td itemprop=silver></td>
                <td itemprop=bronze></td>
                <td itemprop=total><span itemprop=total></span> of <span -o=totalMedalCount></span></td>
            </tr>
        </tbody>
    </table>
</body>
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
const html = String.raw;
assignFrom(document.body, {
    '?.querySelector?.tbody =>': {
        do: 'builtIns.manageTemplateList',
        forEach: "?.rankings",
        itemscopeMgr: 'CountryMedalsCount'
        withTemplate: html `
            <tr>
                <td itemprop=rank></td>
                <td itemprop=noc></td>
                <td itemprop=gold></td>
                <td itemprop=silver></td>
                <td itemprop=bronze></td>
                <td itemprop=total><span itemprop=total></span> of <span -o=totalMedalCount></span></td>
            </tr>
        `
    }
}, {
    withMethods: ['querySelector'],
    from: olympics2024Summary
})
```

What this would do:

1.  Convert the string to an HTMLTemplateElement if it hasn't already been set that way
2.  If there are no child elements with itemscope = CountryMedalCount, clone the template 10 times (based on the sample data). 
3.  Set the itemscope manager to CountryMedalsCount
4.  Pass the cloned template and the item from the list to a standard method (name tbd) of the CountryMedalsCount manager instance.
5.  Combine each cloned template into one document fragment and append to the tbody element.
6.  If there are already itemscope = CountryMedalCount, assume it came from the template clone, and just pass the list item to a(nother?) standard method
7.  If the count of existing itemscope = CountryMedalCount exceeds the total count, delete the nodes that are no longer needed (or hide them)


---

## Kiro's High-Level Comments

### Does this feel out of place?

Slightly — but not in a bad way. Let me explain:

assign-gingerly's identity has been "assign properties carefully between objects." This proposal extends it to "assign *DOM structure* based on data." That's a meaningful step from property assignment into rendering territory. But the package has already crossed adjacent boundaries (itemscope managers, `@eachTime` reactive iteration, method calls via `withMethods`), so it's not unprecedented.

The key question: is this "assigning data into a structure" (fits) or "rendering a template from data" (framework territory)?

I think it fits if you frame it as: "the `=>` operator assigns a list of data items into a DOM container, using itemscope managers as the binding mechanism." The template is just the shape of each item. The actual rendering logic lives in the itemscope manager. assign-gingerly orchestrates but doesn't own the rendering.

### No show-stoppers

I don't see any fundamental blockers. The pieces are already in place:
- `withMethods` handles the `querySelector` navigation
- `assignFrom` handles the `from` source resolution
- Itemscope managers already know how to bind data to DOM fragments
- The `=>` operator is a new command (like `+=`, `=!`, `-=`) — precedented

### Things that need careful thought (not blockers)

1. **The `do: 'builtIns.manageTemplateList'` pattern** — this is essentially a named strategy/plugin. Where does `builtIns` live? Is it a registry? A global? Something on the options? This feels like it could get complex.

2. **Reconciliation (step 6-7)** — updating existing items vs creating new ones is the classic virtual DOM / list diffing problem. Keeping it simple (positional matching, no key-based reordering) is fine for v1, but the scope could creep.

3. **Async or sync?** — Template cloning and DOM appending is synchronous, but the `assignFrom` call is async. The actual DOM mutation should probably be batched (one append of a DocumentFragment), which it sounds like you're planning (step 5).

4. **Where does `totalMedalCount` come from?** — The template references `<span -o=totalMedalCount>` which isn't in the data. Presumably computed by the itemscope manager? That's fine — just noting it's a concern for the manager, not for assign-gingerly.

### Is this the right abstraction level?

I think the `=>` operator + itemscope manager delegation is the right split. assign-gingerly says "for each item, create a managed fragment." The itemscope manager says "here's how I bind data to a fragment." assign-gingerly doesn't need to know about itemprop, microdata, or DOM binding internals.

The one thing I'd push back on gently: the `withTemplate` inline HTML string. It works, but it means the template lives in JavaScript rather than in the markup. For server-rendered progressive enhancement scenarios, you'd want the template to already be in the DOM (which step 6 handles — it reuses existing elements). So maybe `withTemplate` is a fallback for client-only rendering, and the primary path is "the template is already there as a child element."

### Bottom line

Not out of place. It's a natural extension of what assignFrom + itemscope managers already do, just applied to lists. The `=>` operator as a "manage this container" command is clean. Worth prototyping.
