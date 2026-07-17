# getValues as Synchronous Resolve Values

---

## Human Ask

This is first in a series of requests to rename assignFrom to assignFromAsync and define a synchronous assignFrom, in baby steps.

I think the word "resolve" is closely associated with promises and thus with async await.  So I'm inclined to want another name for the synchronous version.  I think getValues is close if not the best name.

We should share as much code as possible.

The interface defined in resolveValues:

```TS
/**
 * Options for resolveValues
 */
export interface ResolveValuesOptions {
  /**
   * Method names that should be called instead of accessed as properties.
   * When a path segment matches, it's called as a method with the next segment as argument.
   */
  withMethods?: string[] | Set<string>;
  
  /**
   * Alias mappings for path segments.
   * Substituted before path resolution, matching complete tokens between `?.` delimiters.
   */
  aka?: Record<string, string>;

  /**
   * Protocol handlers for resolving protocol-prefixed values (e.g., 'globalThis://key').
   * Each handler receives the key portion and returns the resolved value (sync or async).
   * 
   * If a value contains '://' but the protocol isn't in this map, the value passes through unchanged.
   * If a '?.' appears after the protocol key, the remaining path is resolved against the handler's result.
   * 
   * @example
   * protocols: {
   *     globalThis: (key) => globalThis[key],
   *     localStorage: (key) => JSON.parse(localStorage.getItem(key) || 'null')
   * }
   */
  protocols?: Record<string, (key: string) => any | Promise<any>>;
}
```

should be moved to types/assign-gingerly/types.d.ts.

Can you add to the steering guidance that all types should go there?

So should IAssignGingerlyOptions in assignGingerly.

Really, I think ResolveValuesOptions should extend IAssignGingerlyOptions, and redundancies removed.

I think we need another interface, GetValuesOptions:  

```TS
/**
 * Options for resolveValues
 */
export interface GetValuesOptions extends IAssignGingerlyOptions{
  

  /**
   * Protocol handlers for resolving protocol-prefixed values (e.g., 'globalThis://key').
   * Each handler receives the key portion and returns the resolved value (sync or async).
   * 
   * If a value contains '://' but the protocol isn't in this map, the value passes through unchanged.
   * If a '?.' appears after the protocol key, the remaining path is resolved against the handler's result.
   * 
   * @example
   * protocols: {
   *     globalThis: (key) => globalThis[key],
   *     localStorage: (key) => JSON.parse(localStorage.getItem(key) || 'null')
   * }
   */
  protocols?: Record<string, (key: string) => any;
}
```

Many of the functions found in resolveValues should be moved to getValues, since getValues is more time-sensitive.

It looks like since function resolveValue is still synchronous, it should be moved to getValues and renamed getValue.


---

## Response

### On the Naming

Agree that "resolve" implies async/Promise. `getValues` / `getValue` reads as synchronous — good choice.

### On the Type Consolidation

The inheritance chain makes sense:

```
IAssignGingerlyOptions (base: withMethods, aka, signal, enhance, registry, etc.)
  ↳ GetValuesOptions (adds: synchronous protocols)
    ↳ ResolveValuesOptions (extends protocols to allow Promise returns)
```

This way:
- `getValues` accepts `GetValuesOptions` (sync protocols only)
- `resolveValues` accepts `ResolveValuesOptions` (sync or async protocols)
- Both inherit `withMethods` and `aka` from `IAssignGingerlyOptions`

### On Moving Functions to `getValues`

Looking at `resolveValues.ts`, here's what's sync vs async:

| Function | Sync? | Move to `getValues`? |
|----------|-------|---------------------|
| `applyAliases` | ✅ sync | Yes |
| `parseCachedPath` | ✅ sync | Yes |
| `navigatePath` | ✅ sync | Yes |
| `resolveValue` (exported) | ✅ sync | Yes → rename to `getValue` |
| `resolveArray` | ❌ async (protocols can be async) | Needs sync variant |
| `resolveProtocolValue` | ❌ async | Needs sync variant for sync protocols |
| `resolveValues` (exported) | ❌ async | Keep in `resolveValues.ts`, calls into `getValues` |

So the refactoring would be:
1. New `getValues.ts` with: `applyAliases`, `parseCachedPath`, `navigatePath`, `getValue` (renamed from `resolveValue`), `getValues` (sync main function), sync `getArray`, sync `getProtocolValue`
2. `resolveValues.ts` becomes a thin async wrapper that imports from `getValues` and adds Promise handling for async protocols

### On `ResolveValuesOptions extends IAssignGingerlyOptions`

One concern: `IAssignGingerlyOptions` currently has properties that don't make sense for value resolution alone (`registry`, `bypassChecks`, `enhance`). If `ResolveValuesOptions extends IAssignGingerlyOptions`, it inherits all of those.

Options:
- A) Accept the extra properties (they're just ignored by getValues/resolveValues)
- B) Extract a smaller base interface (`PathOptions`?) with just `withMethods`, `aka`, `signal`
- C) Keep them separate but with `withMethods` and `aka` defined once and referenced by both

I'd lean toward A (accept extra properties) for simplicity — TypeScript allows extra properties on objects without complaint. The alternative creates more interfaces than needed.

### On Steering Guidance

I'll add a rule that all exported types/interfaces belong in `types/assign-gingerly/types.d.ts`.

### Questions Before Implementing

1. **Should `getValues` handle arrays?** Currently `resolveValues` recurses into arrays (resolving paths within them). The sync `getValues` should do the same?
2. **Should `getValues` recurse into plain objects?** Same question — `resolveValues` does this today.
3. **Should the sync protocol handlers in `GetValuesOptions` be strictly `(key: string) => any` (no Promise allowed)?** Or should we just call them synchronously and trust the user not to return a Promise? The type enforces it, but runtime doesn't check.
4. **Ready to implement, or want to adjust the design?**

---

## Human Response I

> **Should `getValues` handle arrays?**

Yes

> **Should `getValues` recurse into plain objects?**

**Should the sync protocol handlers in `GetValuesOptions` be strictly `(key: string) => any` (no Promise allowed)?**

I think the type should indicate no promise allowed (though I admit any covers asynchronous -- is there a way to say anything but a Promise?) but trust the author not to deviate from the tping and stuff an asynchronous protocol in there.
