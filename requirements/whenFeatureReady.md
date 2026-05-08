# Support for life cycle keys

---

## Human Ask

This proposal is advocating adding a section "lifecycleKeys" to the SupportedFeatureConfig interface:

```Typescript
export interface SupportedFeatureConfig {
  ...

  lifecycleKeys?: {
    whenFeatureReady: 'whenFeatureReady'
  }
}
```

If present, a method is added to the constructor prototype with the specified name ('whenFeatureReady' in this case):

```Javascript
//I don't recall the syntax for dynamically adding a method to the class prototype
Object.defineProperty(ctr, 'whenFeatureReady', {

});
```

that would do the equivalent of the following:

```JavaScript
class MyCustomElement{
    async whenFeatureReady<TFeatures>(featureName: keyof TFeatures){
        //see if spawn is synchronous.  If so, get the instance, making sure it passes through the ceremony as far as getting the initVals, etc.  pass it back after the instance is stored in storage
        //if not, do whatever is needed to asynchronously place the feature in storage.
        //either way, pass back the instance when ready
    }
}
```


---

## Kiro's Comments

This makes sense — it's the "await readiness" counterpart to the synchronous getter. Consumers who know a feature might be async can explicitly wait for it rather than getting a placeholder.

### A few design thoughts:

#### 1. Naming and placement

You're proposing `lifecycleKeys` on `SupportedFeatureConfig` to let the developer name the method. But I think there's a simpler framing: the method name is always the same (e.g., `whenFeatureReady`), and it accepts the feature key as an argument. This avoids installing a separate method per feature and keeps the API surface small:

```javascript
const photoTaker = await el.whenFeatureReady('photoTaker');
```

One method, handles all features. If the feature is sync, it resolves immediately. If async, it resolves when the spawn completes.

Alternatively, if you want the developer to control the method name (to avoid collisions with existing methods), the `lifecycleKeys` approach works — but then you'd install one method per custom element class, not per feature. The method still takes a feature key argument.

#### 2. What it does internally

```javascript
async whenFeatureReady(featureKey) {
    // 1. Trigger the getter (which starts async resolution if needed)
    const current = this[featureKey];
    
    // 2. Check if it's already the real instance (sync spawn, or async already resolved)
    const storage = featureStorage.get(this);
    const stored = storage?.get(featureKey);
    
    // If stored value is the real instance (not a placeholder), return it
    if (stored && !isPlaceholder(stored)) {
        return stored;
    }
    
    // 3. It's a placeholder — poll or use a Promise that resolves when .then() callback fires
    // Wait for the async resolution to complete
    return new Promise((resolve, reject) => {
        // ... resolve when storage is updated with the real instance
    });
}
```

The tricky part is step 3 — how does the Promise know when the `.then()` callback in the getter has fired and replaced the placeholder with the real instance?

#### 3. Resolution signaling

Options:

**(A) Store a Promise alongside the placeholder** — when the getter kicks off the async spawn, it also stores a Promise that resolves when the instance is ready. `whenFeatureReady` just returns that Promise.

```typescript
// In the getter's async path:
const resolvePromise = { promise: null, resolve: null };
resolvePromise.promise = new Promise(r => { resolvePromise.resolve = r; });
storage.set(key + '__ready', resolvePromise);

// In the .then() callback:
resolvePromise.resolve(instance);

// In whenFeatureReady:
const readySignal = storage.get(featureKey + '__ready');
if (readySignal) return readySignal.promise;
```

**(B) Use a dedicated Map for pending Promises** — cleaner than string-concatenated keys:

```typescript
const pendingFeatures = new WeakMap<object, Map<string, { promise: Promise<any>, resolve: Function }>>();
```

I'd lean toward **(B)** — a separate WeakMap for pending async features. It keeps the main `featureStorage` clean (only stores actual values), and the pending map is only populated for async features.

#### 4. The sync case

If the spawn is synchronous, `whenFeatureReady` should still work — it just resolves immediately:

```javascript
async whenFeatureReady(featureKey) {
    // Trigger the getter (handles sync spawn, initVals capture, etc.)
    const instance = this[featureKey];
    
    // Check if there's a pending async resolution
    const pending = pendingFeatures.get(this)?.get(featureKey);
    if (pending) {
        return pending.promise;
    }
    
    // Sync — already resolved
    return instance;
}
```

This means `whenFeatureReady` is safe to call regardless of whether the feature is sync or async. Consumers don't need to know which type it is.

#### 5. Should it be on the prototype or on the registry?

Two options:

- **On the element prototype** (your proposal): `el.whenFeatureReady('photoTaker')` — feels natural, instance-level.
- **On the registry**: `customElements.whenFeatureReady(el, 'photoTaker')` — avoids polluting the element prototype.

I think the prototype approach is better for ergonomics. The `lifecycleKeys` config lets the developer name it to avoid collisions. If they don't specify `lifecycleKeys`, no method is installed.

#### 6. When to install the method

The method should be installed by `assignFeatures` — same time as the getters. It goes on `ctr.prototype` once, regardless of how many features the class has. The method handles all feature keys for that class.

#### 7. Revised proposal

```typescript
export interface SupportedFeatureConfig {
    fallbackSpawn?: ...;
    validateShape?: ...;
    lifecycleKeys?: {
        /** Method name for awaiting feature readiness. Installed on the prototype. */
        whenFeatureReady?: string;
    }
}
```

But since the method is per-class (not per-feature), maybe `lifecycleKeys` belongs at a higher level — on the `assignFeatures` call itself or as a class-level static:

```typescript
class ClubMember extends HTMLElement {
    static supportedFeatures = {
        photoTaker: { ... },
        badgeMaker: { ... }
    }
    // Class-level lifecycle config
    static featureLifecycle = {
        whenReady: 'whenFeatureReady'  // method name to install
    }
}
```

Or even simpler — just always install it with a fixed name if any async features are detected. But that's less flexible.

### Summary

The core idea is solid. My recommendation:

1. Use a single method (one per class, not per feature) that takes a feature key argument.
2. Store a pending Promise in a separate WeakMap when async spawn is kicked off.
3. The `.then()` callback resolves the Promise (in addition to replacing the placeholder).
4. `whenFeatureReady` returns the pending Promise if one exists, otherwise returns the current value (sync case).
5. Let the developer name the method via config to avoid prototype collisions.

Want me to implement, or do you want to refine the config shape first?

---

## Human Response I

> You're proposing `lifecycleKeys` on `SupportedFeatureConfig` to let the developer name the method. But I think there's a simpler framing: the method name is always the same (e.g., `whenFeatureReady`), and it accepts the feature key as an argument. This avoids installing a separate method per feature and keeps the API surface small

It was never my intention that we install a separate method per feature.  One method at most.

One thing we did with enhancements that might placate your conern a bit:  The developer can set:

```Typescript
export interface SupportedFeatureConfig {
  ...

  lifecycleKeys?: true
}
```

in which case you just assume the default name "whenFeatureReady".  Unlikely as it seems, the option to specify the method is in case the custom element happens to need a method with name whenFeatureReady that has another meaning.  And the desire to treat the developer as a "power user" who may prefer a different name just for the aesthetics of it.

#### 5. Should it be on the prototype or on the registry?

On the prototype because assignGingerly will use it with an upcoming proposal.  We agree

#### 6.  When to install the method

We agree, same time as the getters.

#### 7.  Revised proposal

There's a strange disconnect there.  What you put in for the interface is exactly what I'm suggesting -- oh, I see, I was mixing typescript with the typical (expected) value.  My bad.  You're right, it can be any string, that's the correct type.  We should add to the comment that the suggested name is "whenFeatureReady" and also comment lifecycleKeys to indicate it can be set to true which means default names ("whenFeatureReady" in this case) will be used.
