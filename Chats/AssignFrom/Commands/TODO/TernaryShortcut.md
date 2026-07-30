# Ternary Shortcut

---

## Human Ask

This package supports [ternary assignment](/docs/ternary-assignment.md)

As explained in that document, the ternary operator ?= supports:

[cond, then, else]

However, it is a bit inconvenient to have to provide this, a frequent occurrence I'm sure:

[cond, cond, else]

It would be more convenient to allow for:

[cond, '??', else]

if condition is truthy, return the actual condition.  Otherwise return the else.

In fact, I could see the following being useful, the equivalent of

const answer = cond1 || cond2 || cond3 ...

[cond1, '??', cond2, '??', cond3, ...]

Is there a better alternative to '??'

I'm also interested in being able to extend what ternaries support to support nested conditions:

```JS
const answer = cond1 ? then1 : cond2 ? then2 : cond3 ? then3 : else
```

Supporting this latter feature is outside the scope of this proposal, but I want to make sure that supporting:

[cond1, '??', cond2, '??', cond3, ...]

won't create a "checkmate" as far as supporting nested conditions.
