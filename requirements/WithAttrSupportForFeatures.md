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


---

## Kiro's Comments

### On the rename: `FeatureInjection` → `FeatureConfig`

Agreed — `FeatureConfig` is more consistent with `EnhancementConfig`. The current name `FeatureInjection` was chosen to emphasize the DI aspect, but `FeatureConfig` is more accurate now that it's growing beyond just "what to inject" (it now carries `withAttrs`, `customData`, etc.). I'll do a rename across the codebase.

### On `withAttrs` for features

This maps cleanly to what enhancements already do. The flow would be:

1. Parse attributes from the host element using `parseWithAttrs(element, featureConfig.withAttrs, ...)`.
2. Merge with any programmatic initVals (from `captureFeatureInitVals` or the placeholder object for async spawn).
3. Attributes are the "base layer" — programmatic values override them.

```javascript
// Priority (lowest to highest):
// 1. Attribute-parsed values (withAttrs)
// 2. Programmatic initVals (from captureFeatureInitVals or placeholder accumulation)
const initVals = attrInitVals
    ? (programmaticInitVals ? { ...attrInitVals, ...programmaticInitVals } : attrInitVals)
    : programmaticInitVals;
```

This is the exact same merge pattern used in `object-extension.ts` for enhancements (line ~240).

### On `customData`

This is a pass-through field — the library doesn't interpret it, but it's available on the `FeatureConfig` (and thus on `ctx.injection` inside the feature constructor). The feature class can read `ctx.injection.customData` to access whatever configuration the consumer provided. Simple and useful.

### Questions

#### 1. `allowUnprefixed` for features?

Enhancements have `allowUnprefixed` to control whether attributes need the `enh-` prefix. For features on custom elements, there's no prefix convention — the attributes belong to the element itself. Should we:

- **(A)** Default to `allowUnprefixed: true` for features (no prefix needed)?
- **(B)** Let the developer specify it on `FeatureConfig`?
- **(C)** Omit it entirely — features always read unprefixed attributes?

I'd lean toward **(C)** — features are first-party to the custom element, so their attributes are just regular element attributes. No prefix needed. We can pass `true` (or omit the parameter) to `parseWithAttrs` internally.

#### 2. When does attribute parsing happen?

For the **sync path**: attributes are parsed in the getter, right before spawning. The element is in the DOM (or at least has attributes set), so `parseWithAttrs` can read them.

For the **async path**: attributes should be parsed when the `.then()` callback fires (when the constructor is resolved and we're about to instantiate). By that time, the element is likely in the DOM with its attributes set. The placeholder may have accumulated programmatic values — those override the attribute values.

#### 3. Does `parseWithAttrs` need the element reference?

Yes — it reads attributes from the element. In the getter, `this` is the element (or host object). For the async `.then()` callback, we already capture `hostElement` in the closure. So we have access in both paths.

### Implementation plan

1. Rename `FeatureInjection` → `FeatureConfig` across the codebase (types, assignFeatures.ts, object-extension.ts references, tests).
2. Add `withAttrs?: AttrPatterns<any>` and `customData?: any` to `FeatureConfig`.
3. In the getter (sync path): if `featureConfig.withAttrs` is defined, call `parseWithAttrs(this, featureConfig.withAttrs, true)` to get `attrInitVals`. Merge with programmatic initVals (programmatic wins).
4. In the async `.then()` callback: same — parse attributes from `hostElement`, merge with placeholder (placeholder wins since it accumulated programmatic values).
5. Pass `customData` through on `ctx.injection` (already accessible since `ctx.injection` is the full `FeatureConfig`).
6. Update types.d.ts.

Shall I proceed?

---

## Human Response I

#### 1. `allowUnprefixed` for features?

Good catch.  Yes, allow unprefixed, for sure, never an option to enable it.  We might, however, want to insist that each feature has a unique non trivial base, and all the other attributes build on that base.  What are your thoughts on that?  Is that too much meddling?  Leave it for a future requirement?


#### 2. When does attribute parsing happen?

Sounds good.


