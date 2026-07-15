# Join Handler Accepting {prop, val} Format

---

## Idea

Allow `builtIns.join` to accept the same `{prop, val}` structure that `microDataJoin` uses in `resolve.template`. When `join` encounters `{prop, val}` objects, it ignores `prop` and uses `val` for the join. This gives an easy upgrade path:

```js
// Start with join (flat string output):
{ do: 'builtIns.join', resolve: { template: [{ prop: 'firstName', val: '?.firstName' }, ' ', { prop: 'lastName', val: '?.lastName' }] } }

// Upgrade to semantic HTML (just change `do`):
{ do: 'builtIns.microDataJoin', resolve: { template: [{ prop: 'firstName', val: '?.firstName' }, ' ', { prop: 'lastName', val: '?.lastName' }] } }
```

## Status

Parked for future consideration. Currently `join` uses `resolve.value` with flat arrays.
