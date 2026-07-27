# Lhs Number, Rhs String

---

## Human Ask

When it comes to the += operator, README.md currently lays out the following rules for how it behaves:

**Behavior by type:**

| LHS type | RHS type | Result |
|----------|----------|--------|
| number | number | addition (`2 += 3` → `5`) |
| string | any | string concatenation (`"hello" += 3` → `"hello3"`) |
| array | array | array concatenation (`[1,2] += [3,4]` → `[1,2,3,4]`) |
| array | non-array | push single item (`[1,2] += 3` → `[1,2,3]`) |
| undefined/missing | any | direct assignment |

This proposal is to deal more carefully with LHS number, RHS string.

What I would like to happen:

If the string can be numerically parsed, then += the numeric value.

Otherwise, I guess make the result the native string concatenation.

Any concerns?

---

## AI Response

No major concerns — this is a reasonable quality-of-life improvement. A few thoughts:

### The proposed behavior

```
LHS: number, RHS: string that parses to a number → numeric addition
LHS: number, RHS: string that doesn't parse → string concatenation (native JS behavior)
```

### Implementation

```js
if (typeof target[path] === 'number' && typeof value === 'string') {
    const parsed = Number(value);
    if (!isNaN(parsed)) {
        target[path] += parsed;  // numeric addition
    } else {
        target[path] += value;   // string concatenation (native)
    }
}
```

That's ~5 lines. The `Number(value)` check handles integers, floats, negatives, scientific notation, hex (`0x...`), etc.

### Edge cases to consider

| RHS string | `Number(value)` | Behavior |
|-----------|-----------------|----------|
| `'3'` | 3 | numeric add ✓ |
| `'3.14'` | 3.14 | numeric add ✓ |
| `'-5'` | -5 | numeric add ✓ |
| `'1e3'` | 1000 | numeric add ✓ |
| `''` | 0 | numeric add — **might surprise** |
| `' '` | 0 | numeric add — **might surprise** |
| `'0x1F'` | 31 | numeric add — probably fine |
| `'hello'` | NaN | string concat ✓ |
| `'3px'` | NaN | string concat ✓ |

The empty string case (`'' → 0`) is the only one that feels potentially surprising. `Number('')` is `0` in JS, so `5 += ''` would become `5` (add zero) instead of `'5'` (string concat). That's probably *better* than the native behavior (which would give `'5'`), but worth documenting.

### Alternative: use `parseFloat` instead of `Number`

`parseFloat('3px')` → `3` (parses leading numeric portion). This is more lenient — it would handle CSS-like strings. But it's also more surprising (is `'3px'` really meant to be 3?). I'd stick with `Number()` for strictness.

### Concern: breaking change?

Currently `5 += '3'` produces `'53'` (native string concatenation, since JS does `5 + '3' = '53'`). After this change, it would produce `8`. That's a semantic change for anyone relying on the current behavior.

However — anyone writing `'count +=': '3'` almost certainly *wants* numeric addition, not string concatenation producing `'53'`. The current behavior is a JS quirk that this polyfill should smooth over. So the breaking change is actually a bug fix in intent.

### Recommendation

Go ahead. Use `Number(value)` (strict), document the `''` → 0 edge case, and note it as a minor semver breaking change if anyone was relying on the string-concat-from-numeric-string behavior (unlikely).


---

## Implementation Notes

I need to replace both `parent[lastKey] += value` and `target[path] += value` with the numeric-string-aware version:

Now the JS file:

Now let me also update the `assignTentatively.ts` and `.js` since it has its own += implementation:

Now update the README. Let me find the += behavior table:

Now let me verify diagnostics:

Done. Implemented in `assignGingerly.ts`/`.js` and `assignTentatively.ts`:

- **LHS number + RHS numeric string** (`5 += '3'`) → parses to number, does addition → `8`
- **LHS number + RHS non-numeric string** (`5 += 'px'`) → falls through to native string concat → `'5px'`
- Uses `Number(value)` for strict parsing (rejects `'3px'`, accepts `'3'`, `'3.14'`, `'-5'`, `'1e3'`)
- README updated with two new rows in the behavior table
