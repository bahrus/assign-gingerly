# LHS is of type string that can be parsed as a number, RHS is of type number

---

## Human Ask

As always, feel free to push back on this request.

This is a common scenario that it would be nice to make work the way I think developers would want it to work:

```html
<button data-diff=12>Click</button>
```

```JS
assignGingerly(oButton, {
    dataset:{
        '?.diff +=': 13
    }
});
```

What should happen:

LHS = (Number(LHS) + RHS).toString()

So that the outcome of this should be:

```html
<button data-diff=25>Click</button>
```

---

## AI Response

I support this.  It makes `+=` practical for DOM-backed scalar values, especially
`dataset`: the DOM API intentionally exposes every `data-*` value as a string,
even when the attribute is plainly being used as a number.  The current fallback
to native `+=` produces `'1213'`, which is almost never the intended result for
the example above.

I would define the rule narrowly and symmetrically with the existing **number
LHS + numeric-string RHS** behavior:

| LHS type/value | RHS type | Result |
|---|---|---|
| numeric string | number | `(Number(lhs) + rhs).toString()` |
| non-numeric string | number | native string concatenation |
| string | non-number | existing string behavior |

That keeps ordinary text such as `'item' += 2` as `'item2'`, while making
`'12' += 13` become `'25'`.  The conversion back to a string is essential:
writing through `dataset` already coerces values to strings, and preserving that
contract for plain object string properties avoids an unexpected type change.

### Recommended implementation shape

Put the scalar `+=` decision in one helper shared by the nested-path and
plain-key branches.  Both branches currently duplicate the array and numeric
RHS-string logic, so adding this case independently in each branch would make
the divergence worse.  The helper should run after the missing-property and
array cases, then add this branch before the native fallback:

```ts
if (typeof lhs === 'string' && typeof rhs === 'number') {
    const parsed = Number(lhs);
    return Number.isNaN(parsed) ? lhs + rhs : (parsed + rhs).toString();
}
```

`assignTentatively` has its own `+=` implementation and should use the same
helper/rule.  Although the immediate scenario is `assignGingerly`, matching it
there prevents the two public assignment APIs from disagreeing about values
that are reversible.

### Boundary decisions to document and test

Using `Number()` matches the already-implemented inverse case and accepts
decimal, signed, exponent, hexadecimal, and whitespace-padded numeric strings.
It also treats `''` and `' '` as zero, and permits `'Infinity'`; those are normal
`Number()` semantics but may be surprising for HTML attributes.  My preference
is to retain this consistency unless the project wants a stricter *numeric
attribute* definition.  If so, introduce an explicit predicate for both
directions rather than letting their accepted forms drift.

At minimum, tests should cover the nested `dataset.diff` example, a plain-key
numeric string, a non-numeric fallback (`'12px' += 13` -> `'12px13'`), decimals,
negative values, and the chosen empty-string behavior.  The README's `+=`
table should replace the unconditional `string | any | string concatenation`
row with the more specific numeric-string/number case plus the fallback.

---

## Human Response I

Your feedback seems quite apt and on target.  Please implement.

---

## Implementation Notes

Implemented the feature in TypeScript:

- Numeric string LHS + numeric RHS now adds numerically and returns a string (`'12' += 13` → `'25'`).
- Nonnumeric strings retain native concatenation (`'12px' += 13` → `'12px13'`).
- Centralized `+=` behavior in helpers in [assignGingerly.ts](C:\git\assign-gingerly\assignGingerly.ts) and [assignTentatively.ts](C:\git\assign-gingerly\assignTentatively.ts).
- Added browser-test coverage, including the `dataset.diff` example.

Your compiler regenerated the `.js` outputs; I did not edit them directly.

Yes—`AGENTS.md` is automatically adopted for this repository, including its nested-path applicability. It is the right format; no translation is needed. Other files can document guidance, but `AGENTS.md` is the convention I can reliably treat as operative instructions.

`git diff --check` passes. The focused Playwright run did not finish within its timeout, and it left generated artifacts under `test-results/`; cleanup was blocked by the safety gate, so please remove or restore those before committing.
