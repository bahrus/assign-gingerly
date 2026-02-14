We already have support for lifecycleKeys:

```TypeScript
interface IBaseRegistryItem<T> {
  spawn: { 
    new (oElement?: Element, ctx?: SpawnContext<T>, initVals?: Partial<T>): T;
    canSpawn?: (obj: any, ctx?: SpawnContext<T>) => boolean;  // Optional spawn guard
  };
  symlinks: { [key: string | symbol]: keyof T };
  enhKey?: string;  // String identifier for set proxy access
  withAttrs?: AttrPatterns<T>;  // Automatic attribute parsing during spawn
  lifecycleKeys?: {
    dispose?: string;  // Method name to call on disposal
    resolved?: string;  // Property name indicating async resolution
  };
}
```

This requirement wants to continue supporting the way things are without any backwards compatible changes.

One thing I actually wanted implemented, which apparently, based on the way you documented the feature, isn't how it was implemented, is that the resolved key would be used both for specifying the name of the property as well as the name of the event to dispatch when the resolved state changes.  I think what was implemented was that "resolved" is the hard coded name of the event.

I would like to ask you to add some explanation to the ReadMe.me for why we are using lifecycleKeys, as opposed insisting that all spawn classes inherit from a base class or apply a standard built in mixin, worded in a way that makes the most sense to you.

My reasoning, which doesn't really apply to the "resolved" event, I suppose, is that for the small price of making this configurable, we open the doors wide open to the developer to build their class however they see fit, and avoid religious wars about what the name of the base class or mixin should be (there was a certain amount of conflict between using "behaviors" vs "enhancements", for example).

However, I think there will be a strong desire to just default to some standard names for these lifecycle events, and unless you have a better suggestion, I think "dispose" and "resolved" are as good as any other names, so what we would tend to see in the configuration is a lot of repetition of the same settings.

And the number of keys is likely to grow (for example, making the "resolved" event name configurable).

So I'm thinking we should establish a pattern where

```JavaScript
lifecycleKeys?: "std",
```

is supported, which would then cause this polyfill library to just expect the names of the keys themselves to be the choice ("resolved", "dispose")

