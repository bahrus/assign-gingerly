# Tree Phase III

## Bruce's Ask

As laid out in the initial [scoping of Trees](./TreePhaseI.md#small-notes-on-treetypesdts) and [cited as a blocker for compiling](TODO/TreeThoughtExperiment.md):


- **The types have no notion of arrays yet** (`crew[]`). That's fine for bare bones, but worth reserving a slot. For example, a tuple whose value is an array could repeat its spec per item, keyed by index, which would be a natural place to delegate to `manageTemplateList` later.

I see some examples of integrating manageTemplateList in [tree-demo.html](../../../../demos/tree-demo.html) already.

My first concern is the idea of having a "fire and forget" handover to manageTemplateList, only because we don't know if the module has been already imported (basically), is not ideal.  I wonder if the tree handler can synchronously import the manageTemplateList at the top, so that no async fire and forget is necessary?



