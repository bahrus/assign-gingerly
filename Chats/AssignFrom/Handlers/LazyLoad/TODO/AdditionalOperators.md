# Additional Operators for `builtIns.lazyLoadSwitch`

---

## Context

From the [LazyLoadSwitch](./LazyLoadSwitch.md) discussion, the initial set of operators is:
`===`, `!==`, `==`, `!=`, `<`, `>`, `<=`, `>=`

## Candidates for Future Consideration

| Operator | Semantics | Use Case |
|----------|-----------|----------|
| `'in'` | `lhs in rhs` (property existence) | Check if a key exists in an object |
| `'includes'` | `rhs.includes(lhs)` | Array/string membership test |
| `'matches'` | `lhs.match(rhs)` or regex test | Pattern matching for routing |
| `'startsWith'` | `lhs.startsWith(rhs)` | Prefix matching (route segments) |
| `'endsWith'` | `lhs.endsWith(rhs)` | Suffix matching |
| `'typeof'` | `typeof lhs === rhs` | Type checking |
| `'nearlyEq'` | `tbd` | Close Enough |
| `'custom'` | `tbd` | Edge cases

## Notes

- These would all follow the same pattern: `evaluateOp(lhs, op, rhs)` → boolean.
- Adding new operators is trivial (just extend the switch/map in the evaluator function).
- The question is which ones earn their keep vs. being better served by pre-computing in the VM.
