# Support For Appending To Array

---

## Human Ask

In the Readme.md, the following feature is documented:

## Example 4 - Incrementing values with += command

The `+=` command allows us to increment numeric values and concatenate string values:

```TypeScript
const obj = {
    a: {
        b: {
            c: 2
        }
    }
};
assignGingerly(obj, {
    '?.a?.b?.c +=': 3,
});
console.log(obj);
```

I think we should make it clear in the documentation that if c is a string, it will append 3 as a string (is that true?).

Anyway, we should add another rule:

if c is an array, and the rhs is an array, we should concatenate the rhs to c.


---

## Kiro's Comments

### On string concatenation

Yes, it's true. The current implementation uses JavaScript's native `+=` operator:

```javascript
parent[lastKey] += value;
```

If `parent[lastKey]` is a string and `value` is `3` (a number), JavaScript coerces it: `"hello" += 3` → `"hello3"`. This is standard JS behavior. The README already mentions "If the expression is a string, string concatenation is used" — so that's documented.

### On array concatenation

Currently, if `c` is an array and you do `'?.a?.b?.c +=': [4, 5]`, JavaScript's `+=` would coerce both to strings: `[1,2,3] += [4,5]` → `"1,2,34,5"`. That's clearly not what anyone wants.

The fix is simple — check if the existing value is an array before applying `+=`:

```javascript
if (!(lastKey in parent)) {
    parent[lastKey] = value;
} else if (Array.isArray(parent[lastKey]) && Array.isArray(value)) {
    parent[lastKey] = [...parent[lastKey], ...value];
} else {
    parent[lastKey] += value;
}
```

This gives us:
- `number += number` → addition ✓
- `string += anything` → concatenation ✓
- `array += array` → array concatenation ✓
- `array += non-array` → could push the single value, or let JS throw. I'd suggest pushing: `parent[lastKey] = [...parent[lastKey], value]`

### Should non-array RHS push a single item?

```javascript
assignGingerly(obj, { '?.items +=': 'newItem' });
// If items is ['a', 'b'], should this produce ['a', 'b', 'newItem']?
```

I think yes — it's intuitive. "Append to the array" should work whether you're appending one item or many.

### Proposed behavior

| LHS type | RHS type | Result |
|----------|----------|--------|
| number | number | addition |
| string | any | string concatenation |
| array | array | array concatenation (`[...lhs, ...rhs]`) |
| array | non-array | push single item (`[...lhs, rhs]`) |
| undefined/missing | any | direct assignment |

### Implementation

Two places to update (nested path and plain key):

```javascript
if (!(lastKey in parent)) {
    parent[lastKey] = value;
} else if (Array.isArray(parent[lastKey])) {
    parent[lastKey] = Array.isArray(value) 
        ? [...parent[lastKey], ...value]
        : [...parent[lastKey], value];
} else {
    parent[lastKey] += value;
}
```

Shall I implement?
