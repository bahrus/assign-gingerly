# Passing Context To Spawn

I've added "mountCtx" to SpawnContext


```TypeScript
export interface SpawnContext<T = any, TMountContext = any> {
  config: EnhancementConfig<T>;
  mountCtx?: TMountContext;
}
```

This requirement is to allow invokers of the spawn to pass in their own context:

```JavaScript
oElement.enh.get(regItem, myContext);
```

So by the time we get to 

```JavaScript
new SpawnClass(element, ctx, initVals);
```

like line 189, the second parameter, myContext should be assigned to mountCtx

We need the same with whenResolved.

---

## Implementation Complete

**Changes made:**

1. **`enh.get()` signature**: Added optional `mountCtx` parameter
   ```TypeScript
   get(registryItem: any, mountCtx?: any): any
   ```

2. **`enh.whenResolved()` signature**: Added optional `mountCtx` parameter
   ```TypeScript
   async whenResolved(registryItem: any, mountCtx?: any): Promise<any>
   ```

3. **Context creation**: Updated all `ctx` object creation to include `mountCtx`:
   ```TypeScript
   const ctx = { config: registryItem, mountCtx };
   ```

4. **Documentation**: Added comprehensive examples showing:
   - How to pass custom context
   - Use cases (auth, config, state sharing, DI)
   - Note about `enh.set` proxy limitation

**Note**: The `enh.set` proxy cannot receive `mountCtx` since it's accessed via property getter with no way to pass parameters. This is by design - use explicit `enh.get()` or `enh.whenResolved()` calls when you need to pass context.