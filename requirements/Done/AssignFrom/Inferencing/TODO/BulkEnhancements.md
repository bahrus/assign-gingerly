# Bulk Enhancements

---

## Human Ask

First of all, I'm not sure the documentation in README.md provides sufficient guidance on using assignGingerly to apply an enhancement with parameters, that don't use symbols (and the symbols make it difficult to use with JSON).  The README.md does showcase:

```JavaScript
const result = assignGingerly({}, {
    "[Symbol.for('TFWsx0YH5E6eSfhE7zfLxA')]": true,
    "[Symbol.for('BqnnTPWRHkWdVGWcGQoAiw')]": true,
    style: {
      height: '40px'
    }
    enh: {
      mellowYellow?.madAboutFourteen': true
    }
}, {
    registry: EnhancementRegistry
});
```

I guess the demonstration of mellowYellow?.madAboutFourteen': true is fairly clear.  Maybe it is sufficient, not sure.

Regardless, all the examples provided work best with assignGingerly when there's one or more values that need to be passed to the enhancement.  But what if we just want to do a bulk, parameterless enhancement of multiple elements?

Additionally, it does require a separate step to register the mellowYellow enhancement.

## Support for phase II distributing property values by name

I was considering the "Phase II" item that was left standing in the phase I [inferred assignments](../SubObjectDistributing.md):

```ts
inferredAssignments: {
    byItemprop: ['user'],  // or true
    byName: ['firstName', 'lastName'],  // phase II
}
```

The thing is, I'm not sure one way downward assignment of values from the host to input elements has enough use cases to warrant carving out a whole convenience approach to it, not nearly as much as for itemprop, especially with support for ish/itemscope managers.

Don't get me wrong -- I'm not that opposed -- even if it is used infrequently, since the code would be loaded on demand, I think maybe the benefits outweigh the negiglible harms.  In fact, one scenario where I think it would be quite useful is for readonly / disabled inputs with type=checkbox.

So I will likely create a separate document for this phase II requirement, now that I think about it.  Let me know your thoughts.

Instead, what I'm thinking about is a more common requirement -- things like two-way bindings.  Two-way bindings are kind of out of scope for something that is assigning in one direction, which the term "assign" strongly implies.  Except that we are providing paths for "assigning" enhancements.

One "parameterless" enhancement I'm thinking we would want to assign in bulk would be [be-bound](https://raw.githubusercontent.com/bahrus/be-bound/refs/heads/baseline/README.md).  Note the many examples where no specific instructions are provided.  It infers what to do, and in fact is using the inferencer library which has since been ported into this package. 

So this requirement is searching for a convenient way to enhance a bulk number of elements with one or more parameterless enhancements.  These could not only be applied to editable input or form-associated custom elements, but also things like span's with itemprop attributes but also with contenteditable attributes.

This would **not** benefit from any caching for rapid updates with subsequent changes to the vm.  It might in fact make sense to support this beyond assignFrom, even supporting it for assignGingerly.

I have some ideas for how I could see providing that convenience, but I wanted to get your ideas first, so I don't bias your thinking (if that is of concern?).