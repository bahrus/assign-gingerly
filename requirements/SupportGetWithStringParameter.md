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



