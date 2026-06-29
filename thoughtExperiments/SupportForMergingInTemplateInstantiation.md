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