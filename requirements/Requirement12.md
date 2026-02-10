# get / spawn instance programmatically

```JavaScript
const spawnedInstance = oElement.get(registryItem: IBaseRegistryItem)
```

should:

1.  If registryItem isn't in oElement.customElementRegistry.assignGingerlyRegistry, add it.
2.  If spawned instance doesn't exist, spawn it (attaching to enhKey if applicable)
3.  Return the spawned instance.

