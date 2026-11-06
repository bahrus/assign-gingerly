# Ambiguity with =!

## Bruce's Ask

[Example 5](/assign-gingerly/README.md#example-5---toggling-boolean-values-and-negating) raises a possible ambiguity:

```TypeScript
const obj = {
    a: {
        b: {
            c: true
        }
    }
};
assignGingerly(obj, {
    '?.a?.b?.c =!': '.',      // Toggle itself
    // Negates another property.  
    // The RHS doesn't spawn new objects
    // and evaluates to true if it doesn't exist
    '?.a?.d?.c =!': '?.a?.d?.e'       
});
```

In particular, if we use the same expression with assignFrom, is the right hand side '?.a?.d?.e' referring to obj, or to the "from" passed in to the third argument?

Is there a conflict here?  If not, somehow we should stress this in the documentation, and how would we set the lhs equal to the negation of the right hand side.  If so, how should we resolve the conflict?

Please provide your thoughts below.

## Claude's Response

**There's no conflict over which object is read, but there is a bug, and the docs need fixing.** In `assignFrom`, `'?.a?.d?.e'` reads `from`. The bug is that if that value is a string, `=!` then treats the string as a path or key on the target, and can give the wrong answer.

I ran everything below against the current build, and I haven't changed any code or docs.

### Which object the right hand side reads

| Right hand side | `assignGingerly` | `assignFrom` |
|---|---|---|
| `'.'` | the left hand side itself | the left hand side itself, on the target |
| `'?.x'` | the target | `from` |
| `'$0?.x'` | not a reference | the target |
| `'x'` (plain key) | the target | the target, because `assignFrom` leaves it alone |

So this:

```TypeScript
assignFrom({ e: false }, { '?.r =!': '?.e' }, { from: { e: true } });
// { e: false, r: false }: it negated from.e, not target.e
```

That's the same rule as every other `assignFrom` value: `?.` means `from`, and `$0` means the target. **The rule to stress is: "the right hand side reads the source, and `assignGingerly` has no source but the target."** `'.'` is the exception, because it always means "myself".

The same pattern does change meaning between the two functions, and they sit side by side in event bindings. A top-level `'?.x =!': '?.y'` runs through `assignGingerly` and reads the host, while the same line inside `fromLHS` runs through `assignFrom` and reads the element.

### How to set the left side to the negation of the right

Both of these work today, and the `!` marker is the one I'd show first, because it can't be mistaken for a toggle:

```TypeScript
assignFrom(target, { '?.r': '!?.e' },    { from });   // negates from.e
assignFrom(target, { '?.r =!': '?.e' },  { from });   // the same, for boolean values
assignFrom(target, { '?.r': '!$0?.e' },  { from });   // negates target.e
assignFrom(target, { '?.r =!': '.' },    { from });   // toggles target.r
```

### The bug: a resolved string is read a second time

`assignFrom` resolves `'?.s'`, then hands the result to `assignGingerly`. There, `resolveValueToNegate` can't tell a resolved value from a path, so any string gets looked up on the target:

| `from.s` | Target | Result | Should be |
|---|---|---|---|
| `''` | `{}` | `r: false` | `r: true` |
| `'x'` | `{ x: false }` | `r: true` | `r: false` |
| `'?.x'` | `{ x: false }` | `r: true` | `r: false` |
| `'.'` | `{ r: false }` | `r: true` | `r: false` |

So the source's data decides what gets read on the target. Booleans, numbers and `null` are fine, and `'hi'` only comes out right by luck, unless the target has a `hi`. `assignFromAsync` does the same, `@each` too, and a `$0?.x` that holds a string. Nothing in o2h, o2h-edge or navigate-gingerly uses `=!` with anything but `'.'`, as far as a search shows, so this is safe to fix now.

**Suggested fix:** in `assignFrom`, turn each reference on the right side of a `=!` into a boolean before it reaches `assignGingerly`, so `'?.s'` is treated as `'!!?.s'`. Then `resolveValueToNegate` gets a boolean, and uses it as it is. `categorizeKeys` is shared with `assignFromAsync`, so one change covers both. I tried this by writing `'!!?.s'` by hand: all four rows above came out right, `@each` too, and a missing value was unchanged. A `#[x]` right side is resolved earlier by a separate step, so that case needs its own check when this is implemented.

### Two smaller problems

**A missing right hand side gives opposite answers.**

| Call | Result |
|---|---|
| `assignGingerly({}, { '?.r =!': '?.nope' })` | `r: false`, since missing counts as true |
| `assignFrom({}, { '?.r =!': '?.nope' }, { from: {} })` | `r: true`, as `!undefined` |
| `assignGingerly({}, { '?.r =!': '.' })` | `r: true`, as `!undefined` |

So `assignGingerly` disagrees with itself as well. I'd drop the "true if it doesn't exist" rule, so that `=!` is always `!value`. That changes documented behavior and at least one test, so it's your call. `assignTentatively` has its own copy of this code, which would need to change too.

**Example 5's output is wrong.** It says `d` doesn't exist yet, but the left side creates it:

```TypeScript
// README:   { a: { b: { c: false } } }
// Actual:   { a: { b: { c: false }, d: { c: false } } }
```

That looks like a leftover from when `=!` took a delay. "The RHS doesn't spawn new objects" is still true, but the left side does.

### What I'd put in the docs

- **Example 5:** correct the output, and add a short `assignFrom` example with the rule above.
- **The operator table:** change `=!` from "Toggle" to "Toggle or negate", with `'.'` for toggling.
- **The `!` marker:** add a line saying it's the clearest way to negate a value from `from`.

The plain key case is the one quirk I'd leave in the code, with a line in the docs: in `assignFrom`, `'x'` reads the target while `'?.x'` reads `from`. Nothing here depends on it, but changing it gains little, so the docs should just recommend `?.x` or `$0?.x`.

### Decisions for you

1. Should I make the fix, and the doc changes above? I recommend yes.
2. Should a missing right hand side count as `!undefined` (`true`) everywhere? I recommend yes.
