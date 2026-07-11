# Be Vigilant

---

## Human Ask

The document that led to [inferred assignments](../SubObjectDistributing.md) mentioned a phase 2+ requirement (slightly revised below):

```ts
assignFrom(outerDiv, {
    // other assignments...
}, {
    from: vm,
    inferredAssignments: {
      byItemprop: ['user'] // or true for all matching keys,
      //byName: // phase II
      beVigilant: false, //phase II -- add a mutation observer for new matching 
    },
    elements.  
});
```

This document is the formal request for the beVigilant feature.

I don't know if this could share any code with the @eachTime feature that this package supports.

I would definitely want this extra logic to be conditionally loaded on demand.