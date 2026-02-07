# assignTentatively

assignTentatively does the same thing as assignGingerly, but it is reversible.

```TypeScript
const obj = {a: 'hello'};
const reversal = {};
await assignTentatively(obj, {
    '?.style?.height': '15px',
    '?.a?.b?.c': {
        d: 'hello',
        e: 'world'
    }
}, {reversal});
console.log(obj);
// {
//   a: {b: c: {d: 'hello', e: 'world'}},
//   style: {height: '15px'}
// }

```