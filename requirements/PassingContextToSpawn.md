# Passing Context To Spawn

I've added to "mountCtx" to SpawnContet


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