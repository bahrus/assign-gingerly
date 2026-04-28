# Supporting Get with String Or Symbol Parameter

---

## Human Ask:

The section Programmatic Instance Spawning with enh.get() of README.md explains how to get / spawn the instance of an enhancement:

```TypeScript
const registryItem = {
  spawn: MyEnhancement,
  enhKey: 'myEnh'
};

// Get or spawn the instance
const instance = element.enh.get(registryItem);

console.log(instance instanceof MyEnhancement); // true
console.log(element.enh.myEnh === instance); // true
```

I believe that the "get" method is defined in object-extension:

```TypeScript
/**
 * Get or spawn an instance for a registry item
 * @param registryItem - The registry item to get/spawn instance for
 * @param mountCtx - Optional context to pass to the spawned instance
 * @returns The spawned instance
 */
get(registryItem: any, mountCtx?: any): any {
    ...
}
```

I'm a little surprised we are using any there, rather than EnhancementConfig.  Is there a good reason for not being a little more specific?

I believe that what is expected to be passed in is an object key, and strings or symbols matching the enhKey of a registered enhancement won't work.  Can you confirm?

This requirement assumes as such, and allows for the first argument to be a string or symbol, in which case the matching would be done via the enhKey.  If not found, throw a simple error ('${registryItem} not in registry').




---

## Agent Analysis

### Answering Your Questions

**1. Why `any` instead of `EnhancementConfig`?**

You're right to be surprised. The `get` method's parameter is typed as `any` when it should be `EnhancementConfig`. Looking at the implementation in `object-extension.ts`, the method accesses `registryItem.spawn`, `registryItem.enhKey`, `registryItem.withAttrs`, `registryItem.canSpawn`, `registryItem.symlinks`, and `registryItem.lifecycleKeys` — all properties of `EnhancementConfig`. There's no good reason for `any` here. We should tighten the signature.

However, with this new requirement, the first parameter needs to accept `EnhancementConfig | string | symbol`, so we'll need a union type anyway.

**2. Confirming: strings/symbols don't currently work**

Confirmed. The current `get` method treats its first argument as an object reference. It calls `registry.getItems()` and checks `items.includes(registryItem)`, which is a reference equality check. Passing a string like `'myEnh'` would fail — it wouldn't match any registry item, would be pushed into the registry as-is (a string, not an `EnhancementConfig`), and then `registryItem.spawn` would be `undefined`, causing a crash.

### Implementation Plan

The change is straightforward. At the top of the `get` method, detect if `registryItem` is a string or symbol, and if so, look it up via `findByEnhKey`:

```typescript
get(registryItem: EnhancementConfig | string | symbol, mountCtx?: any): any {
    const element = this.element;
    const registry = (element as any).customElementRegistry?.enhancementRegistry;
    
    if (!registry) {
      throw new Error('customElementRegistry.enhancementRegistry not available');
    }
    
    // Resolve string/symbol to EnhancementConfig via enhKey lookup
    if (typeof registryItem === 'string' || typeof registryItem === 'symbol') {
      const found = registry.findByEnhKey(registryItem);
      if (!found) {
        throw new Error(`${String(registryItem)} not in registry`);
      }
      registryItem = found;
    }
    
    // ... rest of existing logic unchanged
}
```

### Scope & Concerns

**A. The `dispose` method has the same `any` typing issue.** Should we also update `dispose` to accept `string | symbol` for consistency? It would make sense — if you can `get` by enhKey, you should be able to `dispose` by enhKey too. But I'll leave that to your call since it's not in this requirement.

**B. The `whenResolved` method also takes `any`.** Same question applies.

**C. Type definition in `types/assign-gingerly/types.d.ts`:** The `ElementEnhancementGateway` class there has a minimal stub. We should update it if we want the types to reflect the new signature, though it looks like it's a TODO placeholder anyway.

**D. Error message format:** The requirement specifies `'${registryItem} not in registry'`. For symbols, `String(registryItem)` gives us `"Symbol(name)"` which is readable. For strings it's just the string itself. Clean enough.

**E. Weight impact:** Negligible — about 8 lines of code added to the `get` method.

### Questions Before Proceeding

1. Should `dispose` and `whenResolved` also accept `string | symbol` for consistency, or just `get` for now?
2. Should we also tighten the existing `any` types to `EnhancementConfig` on the object-reference path, or keep that as a separate cleanup?

Let me know and I'll implement.

---

## Human Response I

1.  Yes, please apply to dispose and whenResolve for consistency.
2.  Yes, please
