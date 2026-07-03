# Built ins

---

## Human Ask

I think being that handlers can be loaded asynchronously, it would be more meaningful if  invoking the built in ones, like lazyLoad, by name, automatically, dynamically loads the handler, within processHandlerCommands.js.  So these don't get registered in the currently global AssignFrom map (for which I plan to reconsider your earlier advice of supporting custom element registries for this).

This means we can remove this from the README.md:

```JavaScript
import 'assign-gingerly/handlers/lazyLoad.js';
```

as well as any unit tests (if there are any).

---

## Feedback / Questions

### The Idea

Makes sense. Currently `handlers/lazyLoad.ts` self-registers via `defineHandler('builtIns.lazyLoad', LazyLoadHandler)` at import time — the consumer pays the cost of importing even if they never use it. Moving to on-demand dynamic import for `builtIns.*` names aligns with the existing pattern of lazy-loading (e.g., `processHandlerCommands.ts` itself is already dynamically imported from `assignFrom`).

### Implementation Approach

In `processHandlerCommands.ts`, before the "handler not found" throw, add a fallback for `builtIns.*` names:

```ts
let HandlerClass = handlerRegistry.get(config.do);

if (!HandlerClass && config.do.startsWith('builtIns.')) {
    // Auto-load built-in handlers on demand
    HandlerClass = await loadBuiltIn(config.do);
}

if (!HandlerClass) {
    throw new Error(`assignFrom: unknown handler "${config.do}". Register with defineHandler().`);
}
```

Where `loadBuiltIn` maps the name to the module path:

```ts
const BUILT_IN_MAP: Record<string, string> = {
    'builtIns.lazyLoad': './handlers/lazyLoad.js',
    // Future built-ins go here
};

async function loadBuiltIn(name: string): Promise<AssignFromHandlerConstructor | undefined> {
    const path = BUILT_IN_MAP[name];
    if (!path) return undefined;
    const module = await import(path);
    // The module self-registers via defineHandler, but return the class directly
    return module.LazyLoadHandler ?? handlerRegistry.get(name);
}
```

### Questions / Concerns

1. **Should the built-in still call `defineHandler` on self-register?**  
   Currently `handlers/lazyLoad.ts` ends with `defineHandler('builtIns.lazyLoad', LazyLoadHandler)`. If we're auto-loading, we have two options:
   - **Keep self-registration**: The dynamic import triggers the side effect, which registers it in the global map. Subsequent uses find it without re-importing. Simple, but it still pollutes the global registry.
   - **Remove self-registration, export only**: `processHandlerCommands` imports the module and uses the exported class directly, never adding to the global map. Cleaner separation — the global registry stays for user-defined handlers only.
   
   Given your plan to move user-defined handlers to custom element registries, option B (export only, no self-registration) seems cleaner. The built-in map in `processHandlerCommands` becomes the canonical lookup for `builtIns.*`.

2. **Should the explicit import path still work?**  
   Consumers who already have `import 'assign-gingerly/handlers/lazyLoad.js'` — should that continue to work (self-registering as a side effect), or should it become a no-op / removed entirely? Since this is in your package.json `exports`, removing it would be a breaking change for anyone using it today. Suggest: keep the module functional but mark the import as unnecessary in docs (the auto-load handles it).

3. **Naming convention for future built-ins:**  
   The `builtIns.` prefix is a good namespace. As more built-ins are added (e.g., the `join` handler discussed earlier), they'd follow the same pattern: `builtIns.join` → `./handlers/join.js`. The `BUILT_IN_MAP` serves as a manifest.

4. **No existing unit tests to remove.**  
   I checked — there are no Playwright spec files or test HTML pages that exercise `builtIns.lazyLoad` directly. The handler is only referenced in the README examples and requirements docs. So no test removal needed.

### What Changes

| File | Change |
|------|--------|
| `processHandlerCommands.ts/.js` | Add built-in auto-load fallback before "unknown handler" error |
| `handlers/lazyLoad.ts/.js` | Remove `defineHandler(...)` self-registration line (optional, see Q1) |
| `README.md` | Remove `import 'assign-gingerly/handlers/lazyLoad.js'` from examples |
| `docs/assignFrom.md` | Same — remove explicit import instruction |

### Edge Case

- **User registers their own handler with a `builtIns.*` name**: The registry lookup happens first, so a user-defined handler with the same name would take precedence over the auto-loaded built-in. This is fine — it's an intentional override mechanism.

---

## Human Response I

> **Should the built-in still call `defineHandler` on self-register?** 

No.

> **Keep self-registration**

No.

> **Remove self-registration, export only**

Yes.

> **Should the explicit import path still work?**

This is spanking new, so no worries about backwards compatibility.

> **Naming convention for future built-ins:** 

Sounds good.