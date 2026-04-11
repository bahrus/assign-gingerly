# Support for pipe expressions

Setting properties, which both Object.assign and assignGingerly, do, theoretically shouldn't have any other side effects, so it is considered a "declarative operation".  But the code inside the setters can do things "on the side", plus assignGingerly allows, via the registry, instantiating enhancement classes, so there's that.

This requirement stretches the meaning of declarative syntax a bit further, to account for a significant number of use cases.


## Example 1 Adding to the classlist and the part token lists

```JavaScript
oElement.assignGingerly({
    '?.classlist?.add|myClass': 0,
    '?.part?.add|myPart': 0,
});
```

The vertical pipe means: what comes before it is expected to be a method, and the pipe means "open parenthesis, and close parenthesis whenever we encounter another ?. or  when the expression finishes. If there's anything to the right of the pipe, before the next ?., that is passed in as a string into the method.  In this case, the rhs of each expression is not used, because the add method doesn't return anything to merge the rhs into.

## Example 2 Relevant rhs

```JavaScript
oElement.assignGingerly({
    '?.deref|?.querySelector|my-custom-element?.myProp': 14 
})
```

does the equivalent of:

```JavaScript
const lhs = oElement.deref().querySelectory('my-custom-element');
lhs['myProp'] = 14;
```
