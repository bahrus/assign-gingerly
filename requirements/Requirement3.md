## !toggle command

If the lefthand side begins with an exclamation point, followed by a word followed by a space it is likely to be a command.

Planned commands are:

- !inc
- !toggle
- !delete 

This requirement is focused on toggle


```TypeScript
const obj = {
    a: {
        b: {
            c: true
        }
    }
};
assignGingerly(obj, {
    '!toggle ?.a?.b?.c': 0,
    '!toggle ?.a?.d?.e': 20
});
console.log(obj);
// {
//   a: {b: {c: false}},
// }

setTimeout(() => {
    console.log(obj);
    // {
    //  a: {b: {c: false}, d: {e: true}}
    // }
}, 40)
```

If the rhs of the toggle command is 0, do the toggle immediately.  Otherwise, do it after a setTimeout of the rhs.  If the rhs isn't a proper positive number, just allow the error to happen with no validation.

The entire operation should happen after the setTimeout, including creating nested paths if necessary.

The rhs of a toggle command is always used for purposes of setTimeout an no other purpose.  If it is 0, do immediately with no setTimeout.

## Initial value handling for non-existent paths

Question:

'!toggle ?.a?.d?.e': 20 - What should happen when ?.a?.d?.e doesn't exist?

Answer:

Directly set it to true.  If the path doesn't exist, just set it to the value directly.  We also see in this example it continues to create intermediate nested object structures structures with the same logic as setting values.

Question:

What if the current value of the pointed to nested path is a non boolean?

Answer:

The code should just do new value = !(old value) and allow the JavaScript engine to throw whatever error it would naturally throw, and processing will stop if it does throw an error, and that's okay.

Likewise, if the rhs is anything other than a positive integer, do no validation, just use whatever it is as the argument of setTimeout, and allow the browser or JS engine to throw whatever error it wants to throw.

Question:

Is !toggle case sensitive?

Answer:

Yes, and only one space after !toggle is allowed.


