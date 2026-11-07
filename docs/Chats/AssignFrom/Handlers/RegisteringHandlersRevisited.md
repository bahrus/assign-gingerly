# Registering Handlers, Revisited

---
## Human Ask

The AssignFrom.define doesn't feel like the right way to register an assignFromHandler.

When I first proposed it, Kiro responded:

>  **1. Where does the registry live?**

> `AssignFrom.define(...)` as a static method is fine for global macros. But should it also support scoped registries (per `CustomElementRegistry`, like everything else)? Probably not initially — these macros are likely application-wide. Can add scoping later if needed.

When invoking assignFrom programmatically, there doesn't seem to be that large an advantage of defining a string name that can be used throughout the application.

On the other extreme, we have [this use case for assign-from](https://raw.githubusercontent.com/bahrus/do-merge/refs/heads/baseline/README.md).

with the latter case in mind, here's my proposal:

1.  Remove AssignFrom.define from the code and documentation.  Maybe later we will introduce a registry for it.  For now, it doesn't feel like the right fit.  No external packages use it yet, so no concerns about backwards compatibility.

2.  Move AssignFromOptions from assignFrom to types/assig-gingerly/types.d.ts

3.  Add another option to AssignFromOptions:

```Typescript
//Can't really represent this with TypeScript I don't think
export type BareImportSpecifier = string;
export type NonCrossDomainImportPath = 
    | `./${string}`
    | `../${string}`
    | `/${string}`
    | BareImportSpecifier
;
export type DoKey = string;
export interface AssignFromOptions extends IAssignGingerlyOptions, ResolveValuesOptions {
    ...
    //feel free to improve
    handlers: Record<DoKey, NonCrossDomainImportPath | ClassCtr>
}
```

So only local package references and importMap endorsed paths, or a class constructor are allowed.

If a string is provided, a dynamic import is done to that path on demand (arfter confirming it matches the string pattern), and then search the module for a default export first that is a class instance, and if not, search for the first class instance found.

That handler then becomes "registered" within the scope of the assignFrom call only.




---

## Feedback / Questions

### The Proposal

Remove the global `defineHandler` registry, and instead pass handler resolution directly in `options.handlers` per-call. Handlers can be either:
- A class constructor (already instantiatable)
- A string import path (dynamically imported on demand)

This shifts from "register globally, reference by name" to "provide locally, scope to this call." It's more explicit, more tree-shakeable, and avoids the global-mutable-state pattern.

### I Like This

1. **No global mutable state.** The current `handlerRegistry` Map is module-level state that any code can mutate from anywhere. Removing it makes the system more predictable.

2. **Explicit dependencies.** Each `assignFrom` call declares exactly which handlers it needs. No hidden setup step, no import-order dependencies.

3. **Works great for `do-merge`.** In the do-merge use case, the enhancement's JSON config specifies handler names — but the `handlers` map is provided programmatically when `assignFrom` is called. The JSON stays declarative, and the calling code provides the implementations.

4. **Dynamic import path = lazy loading.** Built-in handlers already use this pattern (the `BUILT_IN_MAP`). Generalizing it to user-defined handlers is consistent.

### Questions / Concerns

1. **Built-ins still auto-load?**  
   Currently `builtIns.lazyLoad`, `builtIns.join`, etc. are auto-loaded via `BUILT_IN_MAP` in `processHandlerCommands`. With this proposal:
   - Option A: Built-ins continue to auto-load (the `BUILT_IN_MAP` stays as a fallback). User-defined handlers come from `options.handlers`.
   - Option B: Everything comes from `options.handlers`, including built-ins. Users must pass them explicitly.
   
   I'd recommend **Option A** — built-ins auto-load, `options.handlers` is for user-defined handlers. Requiring users to pass `handlers: { 'builtIns.lazyLoad': './handlers/lazyLoad.js' }` on every call would be tedious.

2. **Lookup order:**  
   `options.handlers` (local) → `BUILT_IN_MAP` (auto-load) → error  
   
   This means a user can override a built-in by providing their own implementation under the same name. Is that desired?

3. **The class constructor form — does it need instantiation?**  
   If `handlers: { 'myHandler': MyHandlerClass }`, the call just does `new MyHandlerClass(config)` — same as today. Simple.

4. **The import path form — security/validation:**  
   You propose restricting to non-cross-domain paths. The `NonCrossDomainImportPath` type is a good compile-time hint but isn't enforceable at runtime (a string is a string). The runtime check (`startsWith('./')` or `startsWith('../')` or `startsWith('/')` or bare specifier) is straightforward:

   ```ts
   function isAllowedImportPath(path: string): boolean {
       return path.startsWith('./') || path.startsWith('../') || path.startsWith('/') 
           || (!path.includes('://') && !path.startsWith('//'));
   }
   ```

   If the path contains `://` or starts with `//`, it's cross-domain — reject it.

5. **Finding the handler class in the imported module:**  
   You propose: check for default export first, then first class with `assign` on prototype. This mirrors what `loadBuiltIn` already does. One concern: if a module exports multiple classes, "first found" is non-deterministic (object key order isn't guaranteed for all cases). But in practice, modules export one handler — this is fine.

6. **Removing `defineHandler` — what about `getHandler`?**  
   `getHandler` is also exported. Remove both?

7. **The `handlerRegistry` Map in `processHandlerCommands`** — currently passed from `assignFrom` to `processHandlerCommands`. With this change, `options.handlers` would be passed instead (or a resolved map built from it). The `processHandlerCommands` function signature would change.

### Suggested Implementation

```ts
// In AssignFromOptions:
export interface AssignFromOptions extends IAssignGingerlyOptions, ResolveValuesOptions {
    from: any;
    where_x_in?: string[];
    where_y_in?: string[];
    where_z_in?: string[];
    withIds?: Record<string, string | { qry: string }>;
    
    /**
     * Handler implementations scoped to this call.
     * Key: the `do` name referenced in handler configs.
     * Value: a class constructor, or an import path to dynamically load one.
     */
    handlers?: Record<string, AssignFromHandlerConstructor | string>;
}
```

In `processHandlerCommands`, the lookup becomes:

```ts
// 1. Check options.handlers (local, per-call)
let HandlerClass = resolveFromHandlersOption(config.do, options.handlers);

// 2. Fallback to built-in auto-load
if (!HandlerClass && config.do.startsWith('builtIns.')) {
    HandlerClass = await loadBuiltIn(config.do);
}

// 3. Error
if (!HandlerClass) {
    throw new Error(`assignFrom: unknown handler "${config.do}". Provide it in options.handlers.`);
}
```

Where `resolveFromHandlersOption` handles both class constructors and dynamic import strings.

### Impact

| What | Change |
|------|--------|
| `defineHandler` / `getHandler` | Remove from `assignFrom.ts`, `index.ts`, and types |
| `handlerRegistry` Map | Remove from `assignFrom.ts` |
| `processHandlerCommands` signature | Remove `handlerRegistry` parameter, read from `options.handlers` |
| `BUILT_IN_MAP` | Stays (built-ins still auto-load) |
| `types.d.ts` | Remove `defineHandler` / `getHandler` declarations, add `handlers` to options |
| Error message | Change from "Register with defineHandler()" to "Provide it in options.handlers" |
| README / docs | Update examples to show `handlers` option instead of `defineHandler` import |

### Ready to implement once confirmed.

---

## Human Response I

1-5.  Agree with your recommendations.
6.  Remove both.

Please implement

