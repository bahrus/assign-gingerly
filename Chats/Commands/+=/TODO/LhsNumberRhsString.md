# Lhs Number, Rhs String

---

## Human Ask

When it comes to the += operator, the README.md currently lays out the following rules for how it behave:

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