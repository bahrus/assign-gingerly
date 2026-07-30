# Ternary Assignment (`?=` operator)

The `?=` operator provides conditional (ternary) assignment in `assignFrom`. The LHS path receives a value chosen based on a condition evaluated from the source object.

## Syntax

```JS
assignFrom(target, {
    '<lhsPath> ?=': [condition, thenValue, elseValue?]
}, { from: source });
```

The RHS is always an array. The first element is the condition; subsequent elements are the possible result values. Each element can be a `?.`-prefixed path (resolved against `from`), a protocol string, or a plain literal.

## Forms

### Guard — `[condition, thenValue]`

Assigns `thenValue` only when `condition` is truthy. If falsy, the assignment is skipped entirely (the target property remains unchanged).

```JS
const vm = { isLoggedIn: true, greeting: 'Welcome back!' };

assignFrom(header, {
    '?.textContent ?=': ['?.isLoggedIn', '?.greeting']
}, { from: vm });
// header.textContent = 'Welcome back!'

// If isLoggedIn were false, header.textContent would remain unchanged.
```

### Ternary — `[condition, thenValue, elseValue]`

Assigns `thenValue` when truthy, `elseValue` when falsy. Always assigns one or the other.

```JS
const vm = { isHappy: true, happyMsg: 'I am happy', sadMsg: 'I am sad' };

assignFrom(element, {
    '?.textContent ?=': ['?.isHappy', '?.happyMsg', '?.sadMsg']
}, { from: vm });
// element.textContent = 'I am happy'
```

With literal values (no `?.` prefix — passed through as-is):

```JS
assignFrom(element, {
    '?.textContent ?=': ['?.isHappy', 'Feeling great', 'Not so great']
}, { from: vm });
```

### Three-state — `[condition, trueValue, falseValue, neitherValue]`

Distinguishes between `true`, `false`, and nullish (`null`/`undefined`). Useful for data that hasn't loaded yet vs. an explicit negative state.

```JS
const vm = { loaded: null };  // not yet determined

assignFrom(statusEl, {
    '?.textContent ?=': ['?.loaded', 'Ready', 'Failed', 'Loading...']
}, { from: vm });
// statusEl.textContent = 'Loading...'
```

Semantics:
- `condition == null` → assigns element [3] (neither)
- `condition` is truthy → assigns element [1]
- `condition` is falsy (but not nullish) → assigns element [2]

### Chain shortcut — `[c1, '||', c2, ...]` and `[c1, '??', c2, ...]`

When the second element is the marker `'||'` or `'??'`, the array is a candidate chain instead of a ternary:

- `'||'` assigns the **first truthy** candidate (equivalent to `c1 || c2 || c3`).
- `'??'` assigns the **first non-nullish** candidate (equivalent to `c1 ?? c2 ?? c3`).

```JS
const vm = { nickname: '', name: 'Gingerly' };

assignFrom(element, {
    '?.textContent ?=': ['?.nickname', '||', '?.name']
}, { from: vm });
// element.textContent = 'Gingerly' — avoids writing ['?.nickname', '?.nickname', '?.name']
```

Longer chains work too:

```JS
// cond1 || cond2 || cond3
'?.textContent ?=': ['?.cond1', '||', '?.cond2', '||', '?.cond3']
```

`'??'` only skips `null`/`undefined` — falsy values like `0` or `false` are returned:

```JS
const vm = { count: 0, fallback: 5 };

assignFrom(element, {
    '?.textContent ?=': ['?.count', '??', '?.fallback']
}, { from: vm });
// element.textContent = 0 (0 is not nullish — with '||' it would have been 5)
```

Semantics and edge cases:

- Candidates are resolved lazily — evaluation stops at the first match, and each candidate is resolved at most once.
- When the chain ends with a candidate (`['?.a', '||', '?.b']`), that candidate doubles as the fallback and is assigned even when it fails the test (matching JS `a || b`, which yields `b` regardless).
- A trailing element after the last candidate with no marker between (`['?.a', '||', '?.b', 'fallback']`) is an explicit fallback, assigned when all candidates fail.
- When the chain ends with a dangling marker (`['?.a', '||']` or `['?.a', '||', '?.b', '||']`), it acts as a guard: assigns the first passing candidate, skips otherwise.
- The marker check takes precedence over the length-based forms, so a length-4 chain like `['?.a', '||', '?.b', 'fallback']` is not misread as the three-state form.
- Markers are only recognized in the truthiness form — they are not supported in comparison mode (`[[lhs, rhs], ...]`).
- Mixing `'||'` and `'??'` in one chain is not supported; the first marker sets the mode.
- The literal strings `'||'` and `'??'` can no longer be used as a then-value in position 1.

### Equality guard — `[[lhs, rhs], result]`

When the first element is an array, it's a comparison. Assigns `result` only when `lhs === rhs`. Skips otherwise.

```JS
const vm = { role: 'admin' };

assignFrom(badge, {
    '?.textContent ?=': [['?.role', 'admin'], 'Administrator']
}, { from: vm });
// badge.textContent = 'Administrator'

// If role were 'user', badge.textContent would remain unchanged.
```

Both sides of the comparison can be paths:

```JS
assignFrom(target, {
    '?.className ?=': [['?.expected', '?.actual'], 'match', 'mismatch']
}, { from: { expected: 'foo', actual: 'foo' } });
// target.className = 'match'
```

### Equality ternary — `[[lhs, rhs], equalResult, notEqualResult]`

Always assigns one of the two results based on equality.

```JS
const vm = { theme: 'dark' };

assignFrom(body, {
    '?.className ?=': [['?.theme', 'dark'], 'dark-mode', 'light-mode']
}, { from: vm });
// body.className = 'dark-mode'
```

### Operator comparison — `[[lhs, op, rhs], result, elseResult?]`

For comparisons beyond equality, include an operator string as the middle element of the condition array.

Supported operators: `===`, `!==`, `>`, `>=`, `<`, `<=`

```JS
const vm = { score: 95 };

assignFrom(gradeEl, {
    '?.textContent ?=': [['?.score', '>=', 90], 'A', 'Below A']
}, { from: vm });
// gradeEl.textContent = 'A'
```

Without an else (guard form):

```JS
assignFrom(alert, {
    '?.hidden ?=': [['?.errorCount', '>', 0], false]
}, { from: { errorCount: 3 } });
// alert.hidden = false (shows the alert)
```

## Mixing with other keys

`?=` works alongside normal assignments, `Y=`, `+=`, and handlers in the same call:

```JS
assignFrom(element, {
    '?.title': '?.pageTitle',                              // normal path resolution
    '?.textContent ?=': ['?.isActive', '?.activeMsg', '?.inactiveMsg'],  // ternary
    '?.style Y=': { opacity: '1' },                        // merge
    '?.dataset?.visits +=': 1,                             // increment
}, { from: vm });
```

## Multiple ternaries

Multiple `?=` keys in the same pattern are all evaluated:

```JS
assignFrom(element, {
    '?.textContent ?=': ['?.showGreeting', '?.greeting', ''],
    '?.className ?=': [['?.theme', 'dark'], 'dark-theme', 'light-theme'],
    '?.hidden ?=': ['?.isVisible', false, true],
}, { from: vm });
```

## Notes

- `?=` is available in `assignFrom` and `assignFromAsync` (not `assignGingerly` — it requires source resolution).
- Path resolution uses `getValues` internally — protocols, `withMethods`, and `aka` all work in condition and result values.
- Guard forms (2-element) skip assignment entirely when the condition is not met — the target property is untouched.
- The condition array form (`[[...], ...]`) is distinguished from truthiness form by checking if the first element of the outer array is itself an array.
