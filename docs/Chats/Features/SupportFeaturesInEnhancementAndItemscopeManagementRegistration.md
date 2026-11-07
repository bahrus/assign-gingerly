# Support Features In Enhancement And Itemscope Management Registration

---

## Human Ask

Feel free to push back on this request if I'm missing something.

When we introduced features for custom elements, we didn't want to do any deep surgery by allowing the developer to associate features with the custom element during the define, thus we introduced a separate call, which is quite universal in how it can be applied.

However, I think it would be convenient to allow features to be defined when registering enhancements and itemscope managers:

```Typescript
const enhRegistry = myElement.customElementRegistry.enhancementRegistry;

enhRegistry.push({
  spawn: MyEnhancement,
  enhKey: 'myEnh'  // Key identifier for this enhancement, 
  features: ...
});

// Access the global registry
const ISMRegistry = customElements.itemscopeRegistry;

// Define a manager
ISMRegistry.define('manager-name', {
  manager: ManagerClass,
  lifecycleKeys: {
    dispose: 'cleanup',
    resolved: 'isReady'
  },
  features: ....
});
```


---

## Feedback / Thoughts

### Current State

Today, features are associated with a class via a separate call:

```ts
customElements.assignFeatures(MyClass, { featureA: { spawn: FeatureAImpl } });
```

This is decoupled from registration — you define the element/enhancement/manager in one step, then associate features in another. The API works for all three (custom elements, enhancements, itemscope managers) but requires the developer to make two separate calls.

### What You're Proposing

Bundle the features declaration into the registration config itself:

```ts
enhRegistry.push({
    spawn: MyEnhancement,
    enhKey: 'myEnh',
    features: { featureA: { spawn: FeatureAImpl } }  // ← new
});

ISMRegistry.define('manager-name', {
    manager: ManagerClass,
    lifecycleKeys: { dispose: 'cleanup', resolved: 'isReady' },
    features: { featureB: { spawn: FeatureBImpl } }  // ← new
});
```

### I Don't See a Reason to Push Back

This is purely additive — a convenience shorthand. The separate `assignFeatures` call would still work for cases where you need it (e.g., assigning features to a class you don't own, or adding features after initial registration).

**Semantics are clear:**
- For enhancements: "when this enhancement is spawned, its class has these features"
- For itemscope managers: "when this manager is instantiated, its class has these features"

**Implementation would be:**
1. `EnhancementRegistry.push()` — after storing the config, if `config.features` exists, call `assignFeatures(config.spawn, config.features, this.featuresRegistry)`.
2. `ItemscopeRegistry.define()` — after storing the config, if `config.features` exists, call `assignFeatures(config.manager, config.features, this.featuresRegistry)`.

Both are ~3 lines of additional logic in the respective `push`/`define` methods.

### Type Changes

```ts
// EnhancementConfig gains optional features
export interface EnhancementConfig<T = any, Obj = Element> extends EnhancementConfigBase<T> {
    spawn: Spawner<T, Obj>;
    withAttrs?: AttrPatterns<T>;
    enhKey?: EnhKey;
    features?: FeatureConfigsMap;  // ← new
}

// ItemscopeManagerConfig gains optional features
export interface ItemscopeManagerConfig<T = any> {
    manager: ItemscopeManager<T>;
    lifecycleKeys?: { dispose?: string | symbol; resolved?: string | symbol };
    features?: FeatureConfigsMap;  // ← new
}
```

### Questions

1. **Timing:** `assignFeatures` installs lazy getters on the class prototype. For enhancements, the spawn class is known at `push` time — so calling `assignFeatures` immediately is fine. Same for itemscope managers at `define` time. No timing issues I can see.

2. **Idempotency:** If someone calls `enhRegistry.push(config)` and also separately calls `assignFeatures(config.spawn, config.features)`, the second call would throw ("already assigned"). Should the registry silently skip if features are already registered, or is this a developer error that should throw?

3. **FeaturesRegistry access:** The enhancement registry and itemscope registry would need access to a `FeaturesRegistry` instance. Currently `featuresRegistry` lives on `CustomElementRegistry`. Should these sub-registries reference the same one (via their parent), or have their own?

4. **Async spawns in features:** `assignFeatures` can return a `Promise` (when async fallback spawns need resolution). Should `push()` / `define()` become async, or fire-and-forget the feature setup? For enhancements, the spawn doesn't happen until an element mounts — so features just need to be ready by then. A fire-and-forget `assignFeatures` call at registration time should be fine (it resolves before any element would need the feature).

### No Push-Back — Ready When You Are

This is a natural ergonomic improvement. The only design decision is whether to make the sub-registries reference the parent's `featuresRegistry` or maintain their own. I'd suggest referencing the parent's — features are a cross-cutting concern, and sharing the registry avoids fragmentation.

---

## Human Response I

>  Should the registry silently skip if features are already registered, or is this a developer error that should throw?

Do nothing special, so that the developer encounters the standard error.

> Should these sub-registries reference the same one (via their parent), or have their own?

Same one.


