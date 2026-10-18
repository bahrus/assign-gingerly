# Add Prop with Micro Join DX

## Bruce's Ask

The tree's [DX support does](../../../../../docs/tree.md#authoring-with-a-lit-like-tree-tagged-template-literal-optional) this:

```JS
const map = {
    launch: tree`
        <article class="card" aria-label=${p.label}>
            <p>Launched ${p.date} by ${p.rocket}</p>
            
        </article>`,
};
// → ['article', { 'class :=': 'card', 'aria-label :=': '?.label' }, [
//       ['p', { '?. =&': { microJoin: ['Launched ', '?.date', ' by ', '?.rocket'] } }],
//       
//   ]]
```

Can we instead specify the prop:

```JS
['p', 
    { 
    '?. =&': 
        { 
            microJoin: [
                'Launched ', 
                {prop: 'date', val: '?.date'} , 
                ' by ', 
                {prop: 'rocket', val: '?.rocket'}
            ] 
        } 
    }
],
```



