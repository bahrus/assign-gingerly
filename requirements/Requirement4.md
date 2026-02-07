## !delete command

If the lhs begins with an exclamation point, followed by a word followed by a space it is likely to be a command.

Planned commands are:

- !inc
- !toggle
- !delete 

This requirement is focused on the delete command


```TypeScript
const obj = {
    a: {
        b: {
            c: true,
            d: 'hello'
        }
    }
};
assignGingerly(obj, {
    '!delete ?.a?.b?.c': 0,
    '!delete ?.a?.b': 20
});
console.log(obj);
// {
//   a: {b: {d: 'hello'}},
// }

setTimeout(() => {
    console.log(obj);
    // {
    //  a: {}
    // }
}, 40)
```



If the rhs of the delete command is 0, do the delete immediately.  Otherwise, do it after a setTimeout of the rhs.  If the rhs isn't a proper positive number, just allow the error to happen with no validation.

The !delete command only deletes the very last property.  '!delete ?.a?.b?.c': 0, should only delete the c property, nothing else.  The !delete command should not create any nested paths.  If the nested path doesn't already exist, just skip the command.

Question:

Is !delete case sensitive?

Answer:

Yes, and only one space after !delete is allowed.

