# assignTentatively

assignTentatively should be coded completely separately from assignGingerly, even if some of the code looks exactly the same.

assignTentatively should support everything that assignGingerly does except:

1.  No support for setTimeouts.  All commands are done immediately regardless of the rhs.  !toggle, !inc are done immediately with no delay.
2. No support for passing in a registry with dependency injections and symbols.  Just ignore it if it is passed in.

What assignTentatively can do that assignGingerly cannot do is be reversed.

```TypeScript
const obj = {f: {g: 'hello'}};
const reversal = {};
assignTentatively(obj, {
    '?.style?.height': '15px',
    '?.a?.b?.c': {
        d: 'hello',
        e: 'world'
    },
    '?.f?.g': 'bye' 
}, {reversal});
console.log({obj, reversal});
// {
//   obj: {
//      a: {b: c: {d: 'hello', e: 'world'}},
//      style: {height: '15px'}
//   },
//   reversal: {
//     '!delete ?.a': 0,
//     '!delete ?.style': 0,
//     '?.f?.g': 'hello'
//   }
// }

```

Only if assignTentatively created a nested path, should the corresponding delete appear in the reversal.  It should only have to delete the shallowest path created.  The first call to assignTentatively created path a, so the reversal needs to delete that path.

The fundamental thing we want to guarantee is that:

```JavaScript
const reversal = {};
const obj = {...};
const string1 = JSON.stringify(obj);
assignTentatively(obj, {...}, {reversal});
assignTentatively(obj, reversal);
const string2 = JSON.stringify(obj);
console.log(string1 === string2);
//true
```

All properties that existed before the first assignTentatively should be restored to their original values.

