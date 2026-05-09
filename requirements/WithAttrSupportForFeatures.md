# Support Attr Support For Features

---

## Human Ask

The interface in types/assign-gingerly/types.d.ts:

```Typescript
/**
 * Configuration for a feature injection passed to assignFeatures
 */
export interface FeatureInjection {
  /**
   * The class to instantiate for this feature, or an async function that
   * resolves to such a class (for lazy-loading).
   * 
   * Synchronous: Constructor receives the host element as its first argument,
   * a FeatureSpawnContext as second, and optional initVals as third.
   * 
   * Asynchronous: A function (arrow or async) that returns a Promise resolving
   * to a constructor. The getter returns a placeholder object immediately and
   * instantiates the real class once the Promise resolves.
   */
  spawn?: 
    | { new(hostElement: any, ctx: FeatureSpawnContext, initVals?: any): any }
    | (() => Promise<{ new(hostElement: any, ctx: FeatureSpawnContext, initVals?: any): any }>);
}
```

First of all, the name of that interface -- this is the "feature" equivalent of EnhancementConfig, so maybe we should rename it FeatureConfig?

Let's please add:

```Typescript
{  
    ...
    //Applicable to passing in the initVals during the spawn lifecycle event
    withAttrs?: AttrPatterns<T>,

    //reservedName for specifying custom configuration information
    customData: any,
}
  
```

Please follow the same (shared as much as possible) logic as far as managing attributes and props passed in programatically -- Attributes are considered the "oldest" settings, overriden by any props passed in programatically.