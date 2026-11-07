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

## Bruce's Response

I think this is requirement too much nuance for a human at least to keep track of.

Here's what I'm thinking:

1.  We don't worry whatsoever about backwards compatibility.  I'm the only one using these packages, and I have the patience to make adjustments as needed (with your help).  Of course, unit tests would need to be removed / revised as appropriate.
2.  We keep things simple and simply say assignGingerly does not under any circumstances perform accessor evaluations of the RHS.

So assignGingerly only supports toggling itself:

```TypeScript
const obj = {
    a: {
        b: {
            c: true
        }
    }
};
assignGingerly(obj, {
    '?.a?.b?.c': '!.',      // Toggle itself
});
```

I think we already added support for the double negation on the right (!!), and if memory serves, single negation as well (!).

So maybe we remove all traces (no backwards compatibility technical debt) of the =! operator (maybe it could come back later and mean something entirely different).

We support rhs's like:

'!$0?.a?.d?.e'

Would this work?  Anything we would lose in the process / disadvantages?




## Claude's Response II

**Yes, this works, and it's simpler.** The rule "`assignGingerly` never reads the right hand side" removes all the nuance, including both decisions I asked you about. **I'd change one thing:** keep the toggle in the key, not in a `'!.'` value, because a magic value brings the bug back in a wider form.

No code has changed yet, and the checks below ran against the current build.

### What already works

Your memory is right: `!` and `!!` both exist, and work in front of `?.` paths and `$0`.

```TypeScript
assignFrom({ e: true }, { '?.r': '!$0?.e' }, { from: { e: false } });   // r: false, from target.e
assignFrom({ e: true }, { '?.r': '!?.e' },   { from: { e: true } });    // r: false, from from.e
assignFrom({ c: true }, { '?.c': '!$0?.c' }, { from: {} });             // c: false, toggles itself
```

Dropping the right hand side reads also settles the other two questions:

- **The string bug goes away,** because nothing reads a resolved value a second time.
- **A missing value has one answer,** `!undefined`, which is `true`.

`'!$0?.a?.d?.e'` only means something in `assignFrom`. In `assignGingerly` it's a plain string, which is exactly your rule.

### The problem with `'!.'`

Keys come from the pattern, but values can come from data. By the time a value reaches `assignGingerly`, the two can't be told apart:

```TypeScript
getValues({ a: '!.' },  { s: '!.' })   // { a: '!.' }, a toggle
getValues({ a: '?.s' }, { s: '!.' })   // { a: '!.' }, just someone's text
```

So if `assignGingerly` toggles on `'!.'`, then `{ title: '?.s' }` with `from.s = '!.'` would turn the title into `false` instead of writing the text. Today it writes the text. It's the same bug as before, where data decides what happens, except that it now applies to **every** assignment rather than only `=!` ones. `assignGingerly(obj, { title: userText })` would have it too.

`'!.'` is unlikely text, but it's an odd exception to a rule meant to have none: "`assignGingerly` doesn't evaluate the right hand side, except for this one string." `assignFrom` could catch `'!.'` before resolving, but that adds code, and doesn't help a direct `assignGingerly` call.

### What I'd do instead

Keep the operator, with one meaning:

```TypeScript
assignGingerly(obj, { '?.a?.b?.c =!': '.' });              // toggles itself: the only thing =! does
assignFrom(target, { '?.r': '!?.e' },   { from });         // negates a value from from
assignFrom(target, { '?.r': '!$0?.e' }, { from });         // negates a value from the target
```

| | `'!.'` value | `=!` key, toggling only |
|---|---|---|
| Data can trigger a toggle | Yes | No, data can't reach keys |
| `assignGingerly` never reads the right side | With one exception | Without exception |
| A toggle stands out in a pattern | It looks like a value | Yes, and the types know it |
| `=!` free for something else | Yes | No |
| Changes needed | Permissions, `@each`, `assignTentatively`, `EqNot` and the types all move | Remove the right side reads |

`=!` would throw on anything but `'.'`, so an old use fails loudly instead of quietly doing the wrong thing. If you want `=!` free for later, the same design works under another name. The important part is that it stays in the key.

### What we'd lose either way

- **Negating another property with `assignGingerly` alone.** It now takes `assignFrom`. For a static event binding, `'?.x =!': '?.y'` at the top level becomes `fromHost: { '?.x': '!?.y' }`.
- **Chains within one call.** `assignFrom` resolves all the values before writing any, so a value can't see an earlier write in the same call:

  ```TypeScript
  assignGingerly({ a: true }, { '?.b =!': '?.a', '?.c =!': '?.b' });      // today: b false, c true
  assignFrom({ a: true }, { '?.b': '!$0?.a', '?.c': '!$0?.b' }, { from: {} });   // c reads b before it's written
  ```

  There's a test for that first form, and nothing outside the tests uses it. Two calls do the same thing.
- **`@each` with `$0`.** `$0` means the whole target, not each item, so `'?.list?.@each?.h': '!$0?.h'` gave every item the same answer. Toggling each item needs `'?.list?.@each?.h =!': '.'`, which stays. So does negating one value into every item: `'?.list?.@each?.h': '!?.expanded'`.

### What would change

Only assign-gingerly uses `=!` at all, and only with `'.'` outside its tests and README.

- **`assignGingerly.ts`:** `resolveValueToNegate` goes, and `=!` throws unless the right side is `'.'`. `assignTentatively.ts` gets the same.
- **Tests:** 26 lines in [toggle-command.html](../../../../tests/toggle-command.html) use another right hand side, so those tests get removed or moved to the `!` marker. I'd add a test that a value of `'!.'` stays plain text.
- **Docs:** the README's Example 5 and operator table, with `!` as the way to negate.
- **Unchanged:** the tree fast path, permissions and `EqNot`.

### Decision for you

Should I keep the toggle as `'?.x =!': '.'`, and remove the rest? I recommend yes. If you'd rather free up `=!`, tell me the name you want, and I'll do the same under that.

## Bruce's Response II

Please proceed with your recommended approach:

Keep the toggle as `'?.x =!': '.'`, and remove the rest, and ensure that:

```JS
assignFrom(target, { '?.r': '!?.e' },   { from });         // negates a value from from
assignFrom(target, { '?.r': '!$0?.e' }, { from });         // negates a value from the target
```

works, and update the tests / documentation accordingly, and any usage within the root folder to reflect the change.




## Claude's Implementation Notes

**Done.** `=!` now only toggles itself, `assignGingerly` never reads its right hand side, and both of your examples work and have tests.

### The rule now

```JS
assignGingerly(obj, { '?.a?.b?.c =!': '.' });              // toggles itself
assignFrom(target, { '?.r': '!?.e' },   { from });         // negates a value from from
assignFrom(target, { '?.r': '!$0?.e' }, { from });         // negates a value from the target
```

Anything but `'.'` on the right of a `=!` throws, and the message says what to use instead. A missing value is `!undefined`, so `true`, everywhere.

### What changed

- **[assignGingerly.ts](../../../../assignGingerly.ts):** `resolveValueToNegate` is gone, and the toggle branch is much shorter. The new `assertTogglesItself` does the check.
- **[assignTentatively.ts](../../../../assignTentatively.ts):** the same, in its own copy of the branch.
- **[assignFrom.ts](../../../../assignFrom.ts):** `categorizeKeys` checks `=!` before anything is resolved. Without that, `'?.r =!': '?.s'` with `from.s = '.'` would have passed as a toggle, which is data deciding again. `assignFromAsync` shares this.
- **[toggle-command.html](../../../../tests/toggle-command.html):** tests for the old right hand sides are removed or moved to the `!` marker, including your two examples. New tests check:
  - every way of throwing, including `assignFromAsync` and `assignTentatively`;
  - a resolved string isn't read twice;
  - `'!.'` stays plain text.
- **Docs:** the [README](../../../../README.md)'s Example 5 (its output was wrong), the operator table and the `!` marker line, plus [event-binding.md](../../../../docs/event-binding.md).
- **`mapsTo` in `types.d.ts`:** I removed `` `${pathString} =!` ``. Its right hand side would be an attribute's value, which now throws, and nothing used it.
- **[o2h-sw.js](../../../../../o2h/o2h-sw.js):** rebuilt with `npm run build:worker`, since it bundles this code. Its diff is larger than this change, because it also picked up other changes since its last build.

Nothing else in the workspace used `=!` with anything but `'.'`, so no other repo's source changed.

### Checked

- **assign-gingerly:** the full suite in all three browsers, 180 passed, 18 skipped, none failed. `tsc` is clean. Your build produced the `.js`.
- **o2h:** 27 passed, 24 skipped by design, in the mirror with assign-gingerly's Playwright, including the rebuilt bundle. `tsc` is clean.
- **o2h-edge:** `npm test` 22 of 22, and `tsc` is clean.
- **navigate-gingerly:** `tsc` is clean.

### To commit

- **The `types` submodule has four checkouts:** assign-gingerly, `inferencer`, o2h and navigate-gingerly. I removed the `mapsTo` line in all four. They're the same repo, so commit it once, and update the others.
- **`o2h-edge/dist`** still has the old code. It's ignored by git, and `wrangler` regenerates it.
- This document is still in `TODO`, if you'd like to move it. Nothing is committed.
