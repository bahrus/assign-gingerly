# Support For RHSMerging

## Human Ask

An important use case this proposal is aiming to solve is to merge the dynamic values of a view model, for example the properties of hosting custom element, into another element or object, purely declaratively.

As things currently stand, the rhs each key value assignment must be explicitly provided.  

```JavaScript
const JSONSerializableMergeInfo = {hello: 'Venus', foo: 'bar'};
const objToMergeInto = {hello: 'world'};
objToMergeInto.assignGingerly(JSONSerializableMergeInfo);
```

But suppose we are passed in an object that we want to merge in, that uses other field names, or properties that are deeply nested in:

```TypeScript
sourceObjToMergeIn = {
    myPropContainer: {
        stringProp: 'Venus'
    }
    myFooString: 'bar'
}
```

We basically need to throw away the idea of pushing as much logic in JSON and just make it pure JS:

```JavaScript
const MergeObject = {
    hello: sourceObjToMergeIn.myPropContainer.stringProp,
    foo: sourceObjectToMergeIn.myFooString,
} 
```

## Minimal Requirement:  Useful Primitive function

Suppose we define our JSON to look as follows:

```JavaScript
const JSONSerializableMergePattern = {
    hello: '?.sourceObjToMergeIn?.myPropContainer?.stingProp', 
    foo: '?.sourceObjectToMergeIn?.myFooString'
};
```

This JSON could carry us to the finish line if we define an exportable function, substituteRHS:

```JavaScript
//maybe the order of the parameters should be reversed?
//is there a better name than substituteRHS?
const JSONSerializableMergeInfo = substituteRHS(JSONSerializableMergePattern, sourceObjToMergeIn);
objToMergeInto.assignGingerly(JSONSerializableMergeInfo);
```

How many lines of code would this take to write?

If it is small enough, maybe it could be baked into assignGingerly:

```JavaScript
const objToMergeInto = {hello: 'world'};
objToMergeInto.assignGingerly(JSONSerializableMergePattern, {
    // maybe there's a better name than sourceObj
    sourceObj: sourceObjToMergeIn
});
```





