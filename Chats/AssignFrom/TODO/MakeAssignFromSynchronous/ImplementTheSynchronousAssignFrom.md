# Implement the Synchronous assignFrom

---

## Human Ask

Like we did with resolveValues.ts, let's do the same with assignFromAsync.js

1.  Define module assignFrom.js
2.  Move all the synchronous functions from assignFromAsync.js to the more time sensitive assignFrom.js.
3.  The function assignFromAsync is quite lengthy, and contains many sections where everything is synchronous.  Judiciously break up those sections into synchronous functions and move them to assignFrom.js module
4.  Define the synchronous assignFrom that reuses as much of the logic as possible.

---

## Response

### Analysis of `assignFromAsync` — What's Sync vs Async

| Section | Sync? | Notes |
|---------|-------|-------|
| `expandSubstitutions(pattern, options)` | ✅ | Pure string manipulation |
| Key categorization loop | ✅ | Pure iteration |
| `resolveValues(normalPattern, ...)` | ❌ | Async protocols. **But `getValues` is sync** |
| `handleSpreads(resolved)` | ✅ | Pure object walking |
| `assignGingerly(target, resolved, options)` | ✅ | Already sync |
| `#[x]` normal keys processing | ❌ | `await import('./resolveIdRef.js')` + `await resolveValues` |
| Handler commands (`processHandlerCommands`) | ❌ | Handlers may be async |
| `#[x]` handler keys | ❌ | Same |
| `inferredAssignments` | ✅* | `processInferredAssignments` is now sync! |
| `beVigilant` | ❌ | Sets up MutationObserver (but fire-and-forget) |
| `enhance` | ❌ | JSON imports, async spawning |

### What the Sync `assignFrom` Would Support

| Feature | Supported in sync? | How |
|---------|-------------------|-----|
| Normal key resolution | ✅ | Uses `getValues` instead of `resolveValues` |
| Looped substitution | ✅ | `expandSubstitutions` is already sync |
| `handleSpreads` | ✅ | Already sync |
| `assignGingerly` | ✅ | Already sync |
| `#[x]` with `withIds` | ✅ | `resolveIdVariable` is sync, `getValue` is sync |
| `inferredAssignments` | ✅ | `processInferredAssignments` is now sync |
| Sync protocols | ✅ | `getValues` handles them |
| Handlers (`=>`) | ❌ | Fire-and-forget (or skip entirely) |
| `beVigilant` | ❌ | Fire-and-forget |
| `enhance` | ❌ | Fire-and-forget |
| Async protocols | ❌ | Use `assignFromAsync` |

### Proposed Structure

```
assignFrom.ts (new sync module)
├── Imports from getValues.ts (sync resolution)
├── Imports shared functions from assignFromAsync.ts (or a new shared.ts)
│   ├── expandSubstitutions
│   ├── isHandlerCommand
│   ├── mergeHandlerDuplicates
│   ├── handleSpreads
│   └── SUBSTITUTION_VARS
├── Imports resolveIdVariable, parseIdRef from resolveIdRef.ts
├── Imports processInferredAssignments from inferredAssignments.ts
├── Imports assignGingerly from assignGingerly.ts
└── Exports:
    └── assignFrom(target, pattern, options, permissions?) → target (sync)
```

The sync `assignFrom`:
1. Expands substitutions (sync)
2. Categorizes keys (sync)
3. Resolves normal keys via `getValues` (sync)
4. Handles spreads (sync)
5. Calls `assignGingerly` (sync)
6. Processes `#[x]` normal keys (sync — `resolveIdVariable` + `getValue`)
7. Processes `inferredAssignments` (sync)
8. For handler commands / enhance / beVigilant — **fire-and-forget** (kick off async, don't await)

### Questions

1. **Should handlers be fire-and-forget in the sync version, or just unsupported (throw)?** Fire-and-forget means the DOM might not reflect handler results until the next microtask. Throwing means "use assignFromAsync if you need handlers."

2. **Should I extract the shared sync functions into a separate `assignFromShared.ts` module, or just import directly from `assignFromAsync.ts`?** Importing from async is simpler (fewer files) but semantically odd. A shared module is cleaner.

3. **Ready to implement?**

---

## Human Response I

> **Should handlers be fire-and-forget in the sync version, or just unsupported (throw)?**

Yes, just call "assign" in a fire and forget way, and allow handler's assigns to continue to be asynchronous

> **Should I extract the shared sync functions into a separate `assignFromShared.ts` module, or just import directly from `assignFromAsync.ts`?**

I think assignFromAsync should import from assignFrom.  We can revisit later if the need arises.

> **Ready to implement?**

Yes, please.



