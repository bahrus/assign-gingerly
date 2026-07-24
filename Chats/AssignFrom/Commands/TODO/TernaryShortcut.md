# Ternary Shortcut

---

## Human Ask

The ternary operator ?= supports:

[cond, then, else]

However, it is a bit invonient to have to provide this, a frequent occurrence I'm sure:

[cond, cond, else]

It would be more convenient to allow for:

[cond, '??', else]

if condition is truthy, return the actual condition.  Otherwise return the else.

Else return the else.

In fact, I could see the following being useful, the equivalent of

const answer = cond1 || cond2 || cond3 ...

[cond1, '??', cond2, '??', cond3, ...]