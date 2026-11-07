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

is supported, which would then cause this polyfill library to just expect the names of the keys themselves to be the choice ("resolved", "dispose").  Maybe there's a better name than "std", or some other value like true, which would make more sense?

---

## AI Comments / Analysis

### Naming Convention Feedback

**For the shortcut value**, I'd suggest one of these options (in order of preference):

1. **`"standard"`** - More explicit and self-documenting than "std"
2. **`true`** - Concise and follows common convention (e.g., `strict: true`)
3. **`"default"`** - Clear intent, though might imply it's the default behavior when omitted
4. **`"conventional"`** - Emphasizes following conventions

**Recommendation**: Use `true` for brevity, or `"standard"` for clarity. The boolean `true` feels most natural since it's saying "yes, use the standard lifecycle keys."

### Type Safety Consideration

The type definition could be:

```TypeScript
lifecycleKeys?: 
  | true  // Use standard names: dispose, resolved
  | "standard"  // Alternative explicit form
  | {
      dispose?: string | symbol;
      resolved?: string | symbol;
    };
```

This provides:
- **Convenience**: `lifecycleKeys: true` for 99% of cases
- **Flexibility**: Custom names when needed for legacy code or specific requirements
- **Type safety**: TypeScript knows what to expect

### Resolved Event Name Issue

You're correct that the event name should be configurable. The pattern should be:

```TypeScript
lifecycleKeys?: {
  dispose?: string | symbol;      // Method to call
  resolved?: string | symbol;     // Property to watch AND event name to dispatch
}
```

When `lifecycleKeys: true`, it would default to:
- Call `dispose()` method on disposal
- Watch `resolved` property and dispatch `"resolved"` event

### Why lifecycleKeys vs Base Class/Mixin

**Excellent reasoning on avoiding base classes.** Here's how I'd articulate it for the README:

**Advantages of configurable lifecycle keys:**

1. **Zero coupling**: Enhancement classes don't need to extend anything or implement interfaces. They're just plain classes with methods/properties.

2. **Framework agnostic**: Works with classes from any source - your own, third-party libraries, generated code, legacy code. No need to wrap or adapt.

3. **Naming freedom**: Avoids bikeshedding over standard names. One team's `dispose()` is another's `cleanup()`, `destroy()`, `teardown()`, etc. The registry adapts to your code, not vice versa.

4. **Multiple enhancement patterns**: Different enhancement libraries can coexist with different conventions. A project using both "behaviors" and "enhancements" can configure each appropriately.

5. **Gradual adoption**: Can integrate with existing classes without refactoring. Just point to the methods/properties that already exist.

6. **Testability**: Enhancement classes remain simple POJOs (Plain Old JavaScript Objects) that are easy to test in isolation without framework dependencies.

**The shortcut (`lifecycleKeys: true`) provides the best of both worlds**: Convention for those who want it, configuration for those who need it.

### Additional Suggestions [TODO]

**Consider expanding the shortcut to support common variations:**

```TypeScript
lifecycleKeys?: 
  | true                    // dispose, resolved
  | "standard"              // Same as true
  | "cleanup"               // cleanup, resolved (alternative convention)
  | { /* custom */ };
```

This acknowledges that while "dispose" is good, "cleanup" is also widely used. But this might be overengineering - `true` + custom object is probably sufficient.

**Symbol support**: The current type allows `string | symbol` which is great for avoiding collisions in complex scenarios. The shortcut should only use strings since symbols can't be standardized.

### Implementation Note

When `lifecycleKeys: true`:
- Look for `dispose` method (string key)
- Look for `resolved` property (string key)  
- Dispatch `"resolved"` event (string event name)

This keeps it simple and predictable while still allowing symbols for advanced use cases via the object form.

---

**Summary**: Strong support for the shortcut pattern. Recommend `lifecycleKeys: true` as the shortcut value. The configurable approach is architecturally sound and avoids the coupling/naming issues that plague framework-specific base classes.

