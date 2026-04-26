# Support For Generator Iterators Brainstorming

## Vague Human Query

We've added for @each assigning:

```JavaScript
// Apply to each element in the collection
assignGingerly(div, {
  '?.querySelectorAll?.my-element?.@each?.classList?.add': 'highlighted'
}, { withMethods: ['querySelectorAll', 'add'] });
```

Suppose an element enhancement is created using assign-gingerly, that returns an event target that issues an event "mount" any time another my-element appears within the div, using something like [mount-observer](https://github.com/bahrus/mount-observer).  Can we use a generator yield type each expression?  Kind of like RxJS I guess, but I still want it to be JSON serializable, and not have to fret over the details:  Something like:

```JavaScript
// Apply to each element in the collection
assignGingerly(div, {
  '?.querySelectorAll?.my-element?.@each?.classList?.add': 'highlighted'
}, { withMethods: ['querySelectorAll', 'add'] });
```

```JavaScript
// Apply to each element in the collection
assignGingerlyAndVigilantly(div, {
  '?.mountObserve?.my-element?.@eachTime?.classList?.add': 'highlighted'
}, { withMethods: ['querySelectorAll', 'add'] });
```

First what syntax would you suggest?  Is this requirement heavy enough that we should have a separate function as above to support it, as I suggest above, do you think?  If so, what name would you give it?  Is it implementable?

How would you go about this, in other words?