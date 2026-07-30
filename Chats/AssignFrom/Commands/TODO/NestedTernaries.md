# Nested Ternaries

---

## Human Ask

> - **Nested ternaries** can recurse through the *value positions* using nested arrays:

```JS
// cond1 ? then1 : cond2 ? then2 : else
[cond1, then1, [cond2, then2, else]]
```

> Position-0 nested arrays already mean "comparison mode", and that's unambiguous because it's *the first element*. Nested arrays in positions ≥ 1 currently pass through `resolveTernaryValue` untouched (non-strings pass through as literals), so adding "if an element in a result position is an array, recursively `evaluateTernary` it" doesn't collide with anything that exists today — except someone literally assigning an array as a result value. That collision can be dodged with a wrapper convention later if it ever matters (e.g. only treat it as a nested ternary when its first element is itself a valid condition shape), or by introducing an explicit `?:`-style marker for nesting.

I like the idea that if cond2 is a string that starts with '?.', then treat it as a condition, otherwise consider it to be the value for the else of cond1.

Are there any other ambiguities that need to be addressed before implementing this?

