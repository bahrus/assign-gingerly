# Computed text as a ` ?=` result: `{ join: [...] }`

Follows on from [TernaryAssignment](../Ternary/TernaryAssignment.md) and [NestedTernaries](../Ternary/NestedTernaries.md).

---

## AI Proposal

**Status:** proposal only. Nothing else in the repo has been changed.

### In one example

```JS
'textContent ?=': [['?.n', 1], '1 item', { join: ['?.n', ' items'] }]
```

Let a ` ?=` result be a `{ join: [...] }` object, meaning the same as it does in ` =&` and ` :=`. With `n` of 1 and 2: `1 item`, `2 items`.

### The gap

Two operators each do half the job:

| Operator | Chooses between values | Builds text from parts |
|---|---|---|
| ` ?=` | Yes, with comparisons, chains and nesting | No: a result is a path or a literal |
| ` =&` with `join` | No (it can only drop nullish parts) | Yes |

"If there are more than `max`, show `3 Selected`, otherwise list them" needs both. Written the obvious way today, the object is assigned as it is. Measured, on an `<a>`:

```JS
'href ?=': ['?.id', { join: ['#product/', '?.id'] }, '#']      // today: <a href="[object Object]">
```

**Where it came up:** chip-away's `max-join`. Given `join` and `max-join="2"`, a select's chip reads `Red, Green` for two selected options, and `3 Selected` for three.

### Why not do it some other way today?

**Two keys on one property don't combine.** ` ?=` keys all run first, then ` =&`, so `'textContent =&'` always overwrites `'textContent ?='`.

**There is a workaround, and it works.** Put each half in a scratch property, and let `join`'s all-or-nothing sub-arrays drop the unused one:

```JS
'_n ?=': [['?.crew?.length', '>', '?.max'], '?.crew?.length', null],
'_t ?=': [['?.crew?.length', '>', '?.max'], null, '?.crew?.list'],
'textContent =&': { join: [['$0?._n', ' Selected'], '$0?._t'] },
```

Measured: `3 Selected`, then `Ada, Bo, Cy`, then `3 Selected` on reruns of one element. In chip-away's prototype, all 10 example pages pass with it. **So this gap doesn't strictly block chip-away.** But it states the condition twice, leaves `_n` and `_t` on the element, and relies on the order operators run in. I wouldn't want to document it as the answer.

**A formatter doesn't reach it.** `PluralRules` `cases` give text per category, but can't include the number. `NumberFormat`'s units are a fixed list.

### Examples

Every result was measured with a prototype (see "What I checked").

#### 1. chip-away: a count past a limit, otherwise the list

```JS
'textContent ?=': [['?.crew?.length', '>', '?.max'], { join: ['?.crew?.length', ' Selected'] }, '?.crew?.list']
```

`list` is a pipe (`pluck`, then `join`). Three in the crew:

| `max` | Result |
|---|---|
| 1, 2 | `3 Selected` |
| 3 | `Ada, Bo, Cy` |
| not set | `Ada, Bo, Cy` (`3 > undefined` is false) |

#### 2. A cart, with nested ternaries

```JS
'textContent ?=': [['?.n', 0], 'Your cart is empty', [['?.n', 1], '1 item', { join: ['?.n', ' items'] }]]
// 0 → 'Your cart is empty'    1 → '1 item'    2 → '2 items'
```

#### 3. A greeting

```JS
'textContent ?=': ['?.name', { join: ['Welcome back, ', '?.name', '!'] }, 'Please log in']
// 'Welcome back, Ada!'    or 'Please log in'
```

#### 4. Three states

```JS
'textContent ?=': ['?.ok', { join: ['Saved at ', '?.at'] }, { join: ['Failed: ', '?.err'] }, 'Saving...']
// true → 'Saved at 10:42'    false → 'Failed: timeout'    null → 'Saving...'
```

#### 5. A fallback in a chain

```JS
'textContent ?=': ['?.nick', '??', { join: ['?.first', ' ', '?.last'] }]
// 'Al'    or 'Ada L'
```

#### 6. With a pipe

```JS
'textContent ?=': [['?.price', '>', 0], { join: ['Only ', '?.price?.usd'] }, 'Free']
// 12.5 → 'Only $12.50'    0 → 'Free'
```

#### 7. Optional parts, as in any `join`

```JS
'textContent ?=': ['?.last', { join: ['?.last', [', ', '?.mid'], ', ', '?.first'] }, '?']
// 'L, D, A'    without mid: 'L, A'
```

#### 8. A separator

```JS
'textContent ?=': ['?.a', { join: ['?.a', '?.b'], separator: ' | ' }, '-']      // '1 | 2'
```

#### 9. A guard

```JS
'textContent ?=': [['?.n', '>', 0], { join: ['?.n', ' new'] }]
// 3 → '3 new'    0 → not assigned
```

#### 10. Not only text

```JS
'href ?=': ['?.id', { join: ['#product/', '?.id'] }, '#']      // <a href="#product/7">
```

#### 11. In a Tree, with `$parent`

```JS
list: ['ul', {}, { each: ['li', { 'textContent ?=': ['?.n', { join: ['$parent?.list?.length', ':', '?.n'] }, 'none'] }] }]
// two items, n of 1 and 0 → '2:1' and 'none'. The same with compile, and reruns update in place.
```

#### When not to use it

- **The branches differ in markup:** use a [switch](../../../../tree.md#switches).
- **There's no condition:** use ` =&`.
- **Only a missing value matters:** `join`'s sub-arrays already handle it.

### Semantics

1. **Where:** any result position: then, else, neither, comparison results, chain candidates and nested ternaries. Not in conditions.
2. **What counts:** the existing `isJoinValue` test, as for ` :=`. A plain object whose only keys are `join` and, optionally, `separator`. Any other object stays a literal, as today (measured with `{ join: 1, x: 2 }`).
3. **Resolved with `getValues`,** so paths, pipes, `$0`, `$parent`, `$root` and `!` all work as in ` =&`. Only the chosen branch is resolved.
4. **The result is always a string,** possibly empty. This matters in chains, and is the one surprising case:

   | Nothing to join, `first` missing | Result |
   |---|---|
   | `['?.nick', '??', { join: ['?.first'] }, '??', 'Anonymous']` | `''`: an empty string isn't nullish |
   | `['?.nick', '\|\|', { join: ['?.first'] }, '\|\|', 'Anonymous']` | `'Anonymous'` |

   So use `||` after a `join`. I'd document that rather than special-case it.
5. **`join` only,** not `microJoin`, which writes into an element rather than returning a value.
6. **Async values:** ` =&` rejects thenables. I'd apply the same check here. (The prototype doesn't.)
7. **`assignFromAsync`** passes ` ?=` keys to the sync `assignFrom`, so it works there too (measured).

**Compatibility:** the only behavior that changes is a ternary that assigns a literal `{ join: … }` object to a property. I consider that very unlikely.

### Implementation sketch

In [assignFrom.ts](../../../../../assignFrom.ts):

```TypeScript
function resolveResult(value: any, source: any, options: AssignFromOptions): any {
    if (isNestedTernary(value)) return evaluateTernary(value, source, options);
    if (isJoinValue(value)) {
        const { join: args, ...extra } = getValues(value, source, options);
        assertNoThenable(args, 'join', '?=');
        return join(args, extra);
    }
    return resolveTernaryValue(value, source, options);
}
```

`join` and `isJoinValue` are already in the core (`syncOps/join.ts`), so there's nothing new to load. Minified then gzipped, `assignFrom.js` alone goes from 3,715 to 3,757 bytes: **about 40 bytes**, though this is in the core.

**o2h:** it applies ternaries by calling `assignFrom` on a scratch object (`o2h.ts`), so I'd expect it to work there once o2h updates. I haven't run it.

### Alternatives

In chip-away's document I suggested two others (A and B). Having prototyped all three, I now prefer `{ join }` (C). All three give the right answer.

#### A. A switch that compares

```JS
{ switch: ['?.length', '>', '$root?.maxJoin'], cases: {
    true: ['span', { 'textContent =&': { join: ['?.length', ' Selected'] } }],
    false: ['span', '?.list'] } }
```

More general in Tree, since each branch can have its own markup. But it only exists in Tree, replaces the element when the answer flips, and repeats the element in each branch. It's also the largest: about 100 bytes on `treeSpec.js`, which o2h shares. **Worth considering on its own merits** for markup that depends on a comparison; it isn't needed for text.

#### B. A `template` data pipe

```JS
pipes: { selected: { template: ['?.length', ' Selected'] } }
'textContent ?=': [['?.length', '>', '$root?.maxJoin'], '?.selected', '?.list']
```

Outside the core, and about 40 bytes. But the text ends up away from where it's used, it's a second way to write `join`, and in merges it needs `dataPipes.js` loaded (gap 6).

#### Comparison

| | C: `{ join }` result | A: switch | B: pipe |
|---|---|---|---|
| Works outside Tree | Yes | No | Yes |
| Uses an existing notation | Yes: ` =&` and ` :=` have it | Partly: ` ?=` comparisons | No |
| Keeps the element when the answer flips | Yes | No | Yes |
| Branches with different markup | No | Yes | No |
| Approximate gzipped size | 40, core | 100, Tree | 40, data pipes |

#### D. The reverse: a ternary inside `join`

```JS
'textContent =&': { join: ['?.n', ' item', { if: [['?.n', 1], '', 's'] }] }      // '1 item', '2 items'
```

This avoids repeating the shared parts, but needs a new notation. I didn't prototype it. C covers the same cases with some repetition, and doesn't rule it out.

### What I checked

A patched copy of 0.0.112, served only to a test browser (Chromium):

- **All of the examples above,** and the chain cases. In the unpatched code, every `{ join }` result came out as an object.
- **chip-away's JSON prototype** on 0.0.112, with your `pluck`, `at` and `keyScope`. With C, its 10 example pages pass, two chip-aways on one select both update, and `change` reaches the select. Without C, page 10 (`max-join`) fails.
- **One function pipe is left there:** the legend text (gap 5). `dataPipes.js` is still imported by hand (gap 6).

**Not checked:** the thenable check, permissions, Firefox and WebKit, o2h.

### Suggested tests

- Each example, through `assignFrom` and `assignFromAsync`.
- Every result position, including nested ternaries and both chain kinds.
- The branch that isn't chosen isn't resolved.
- An object with other keys stays a literal.
- A thenable throws.
- In `builtIns.tree`: plain, `compile`, and reruns.

### Documentation

`docs/ternary-assignment.md`: a section on `join` results, with the `||` note. `docs/sync-ops.md`: a cross-reference.

### Questions

1. C, as proposed? Or A, B, or the workaround as it is?
2. Document the `??` / empty string case (as proposed), or treat an empty join as a failed candidate?
3. Do you also want A, on its own merits? I'd wait for a use.
