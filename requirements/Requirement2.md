## inc property

If the lefthand side begins with an exclamation point, followed by a word followed by a space it is likely to be a command.

Planned commands are:

- !inc
- !toggle
- !delete
- !concat 

This requirement is focused on inc


```TypeScript
const obj = {
    a: {
        b: {
            c: 2
        }
    }
};
assignGingerly(obj, {
    '!inc ?.a?.b?.c': 3,
    '!inc ?.a?.d?.e': -2
});
console.log(obj);
// {
//   a: {b: {c: 5}, d: {e: -2}},
// }
```

## Initial value handling for non-existent paths

Question:

'!inc ?.a?.d?.e': -2 - What should happen when ?.a?.d?.e doesn't exist?

Answer:

Directly set it to -2?  We also see in this example it continues to create nested structures with the same logic as setting values.

Question:

What if the current value of the pointed to nested path is a non numeric value?

Answer:

The code should just do += rhs and allow the JavaScript engine to throw whatever error it would naturally throw, and processing will stop.

Likewise, if the value to increment by is non numeric -- don't do any validation, just do += rhs


