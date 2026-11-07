# Support for asynchronous loading

---

## Human Ask

Up to this point, assign-gingerly has strove to be synchronous as much as possible.  The two major exceptions have been itemscope managers and the @eachTime directive.  When it came to element enhancements, a conscious decision was made to only support "spawn" as a class constructor, and not support spawn to point, for example, to an asynchronous function that returns a constructor.  The thinking was that the asynchronous loading could be accomplished via the mount-observer discovery mechanism.  Since the platform doesn't natively support (synchronous) discovery of all elements satisfying some conditional logic that immediately enables the enhancement (say, for example, based on the presence of one of a suite of enhancement attributes), we could asynchronously load the enhancement configuration, including the potentially heavy spawn code only when applicable, i.e. lazy loading by necessary default when mount-observer discovers an element that needs upgrading based on developer criteria.

But for custom element features, the performance benefits of supporting asynchronous loading of the feature javascript is too signifnicant to sweep under the rug.

Let me address one issue that this library will consciously **not** address:

What happens if assignGingerly or gest regular property setting is applied to a custom element after the the customElementRegistry.define was called, but before customElementRegistry.assignFeatures is defined, and this includes setting properties for one of these features?  Do we need to retroactively find all the custom element instances where data has been passed to the "unknown property", and "upgrade" the property to a getter/setter, and instantiate the spawn instance, and pass what was previously passed in to the instance?

The reason we don't think it is our burden to solve for this is:

We believe a full blown standard from the platform would combine the assignFeatures method into the define method, doing everything in one call.  This polyfill is avoiding that in order to avoid risky surgery, but we don't see any reason why the developer wouldn't want to register the class and register the features in two sequential synchronous lines of code.  If the developer fails to do so, bad on them.

We should, at least, document this clearly, which should be considered part of this proposal.

In fact, in what follows below, I think we will agree we should document that by necessity, the call to assignFeatures should be called before calling the define method.

However, the brunt of this proposal is to enhance the features to support two useful scenarios:

1.  If properties/data was passed to an unknown element, but then the custom element upgrades, the developer of the custom element should have a way to read what data had been passed in, ideally with a single line of code

To support this, for starters, we need to start enhancing the following two types to be as follows

```TypeScript
/**
 * Configuration for a supported feature slot declared via static supportedFeatures
 */
export interface SupportedFeatureConfig {
  /**
   * Optional fallback class to spawn if no implementation is injected
   */
  fallbackSpawn?: { new(hostElement: any, ctx: tbd, initVals: an): any };

  /**
   * Optional runtime shape validation for the spawned instance.
   * Return true if the instance is valid, false to throw.
   */
  validateShape?: (spawnedInstance: any) => boolean;
}

/**
 * Configuration for a feature injection passed to assignFeatures
 */
export interface FeatureInjection {
  /**
   * The class to instantiate for this feature.
   * Constructor receives the host element as its first argument.
   */
  spawn?: { new(hostElement: any, ctx: tbd, initVals: any): any };
}
```

Let's actually stop there with this proposal.  I was thinking this proposal would also talk about supporting asynchronous spawneres, but let's make that Part III, and deal with the second implicit scenario after we fully resolve this first scenario.

Keep in mind that future requirements will include absorbing parsed attributes defined with withAttrs settings.

Please suggest what this API would look like below.


---

## Kiro's Comments / Questions

Good framing. The core ask is clear: when the lazy getter fires, the spawned feature should receive whatever data was previously assigned to that property slot (before the getter existed or before the element upgraded). Let me work through the design.

### The problem restated

The timeline looks like this:

```
1. customElements.assignFeatures(ClubMember, { photoTaker: { spawn: PhotoTakerImpl } })
   → installs getter-only on ClubMember.prototype
2. customElements.define('club-member', ClubMember)
3. const el = document.createElement('club-member')  // or parser creates it
4. el.photoTaker  // getter fires, spawns instance with initVals
```

But what if data arrived *before* step 1 (or between steps 2 and 3 for parser-created elements that upgrade late)?

```
A. <club-member> exists in DOM as unknown element
B. Someone does: el.photoTaker = { someProp: 'hello' }  
   → This sets an own-property on the instance (no getter yet)
C. Element upgrades, constructor runs
D. el.photoTaker  // getter is on prototype, but own-property shadows it!
```

The own-property shadow is the classic custom element "pre-upgrade property" problem.

### Your stated constraint

You've said: **`assignFeatures` must be called before `define`**. This eliminates scenario (A→B→C) for the getter installation timing — by the time the element upgrades, the getter is already on the prototype. But the own-property shadow problem still exists if someone set `el.photoTaker = {...}` on the instance before upgrade.

### Proposed API

Here's what I think the API should look like:

#### Updated types

```TypeScript
/**
 * Context passed to feature spawn constructors
 */
export interface FeatureSpawnContext {
    /** The feature key (e.g., 'photoTaker') */
    key: string;
    /** The SupportedFeatureConfig from static supportedFeatures */
    optIn: SupportedFeatureConfig;
    /** The FeatureInjection config from assignFeatures */
    injection: FeatureInjection;
    /** The features registry reference */
    featuresRegistry: FeaturesRegistry;
}

export interface SupportedFeatureConfig {
    fallbackSpawn?: { new(hostElement: any, ctx: FeatureSpawnContext, initVals?: any): any };
    validateShape?: (spawnedInstance: any) => boolean;
}

export interface FeatureInjection {
    spawn?: { new(hostElement: any, ctx: FeatureSpawnContext, initVals?: any): any };
}
```

#### How initVals gets populated

The getter, on first access, should:

1. **Check for an own-property on the instance with the same key** — if one exists (set before the getter was reachable, or set during pre-upgrade), capture its value as `initVals`, then `delete` the own-property so the prototype getter is no longer shadowed.
2. **Spawn with**: `new SpawnClass(hostElement, ctx, initVals)` where `initVals` may be `undefined` if nothing was pre-set.

```JavaScript
// Inside the getter for key:
get: function() {
    let storage = featureStorage.get(this);
    if (!storage) {
        storage = new Map();
        featureStorage.set(this, storage);
    }

    if (!storage.has(key)) {
        // Capture and clear any own-property that shadows this getter
        let initVals = undefined;
        if (Object.hasOwn(this, key)) {
            initVals = this[key];
            delete this[key]; // Unshadow the prototype getter
        }

        // ... resolve SpawnClass as before ...

        const ctx = { key, optIn, injection, featuresRegistry };
        const instance = new SpawnClass(this, ctx, initVals);

        // If initVals was an object, merge it into the instance
        // (the spawn constructor can do this itself, or we can do it here)
        // I'd lean toward letting the constructor handle it — more flexible.

        if (optIn.validateShape) {
            if (!optIn.validateShape(instance)) {
                throw new Error(`assignFeatures: spawned instance for "${key}" failed shape validation`);
            }
        }

        storage.set(key, instance);
    }

    return storage.get(key);
}
```

#### What the feature constructor does with initVals

The feature class is responsible for applying `initVals` however it sees fit:

```JavaScript
class PhotoTakerImpl {
    constructor(hostElement, ctx, initVals) {
        this.host = hostElement;
        if (initVals) {
            // Simple case: merge properties
            Object.assign(this, initVals);
            // Or use assignGingerly for nested paths:
            // assignGingerly(this, initVals);
        }
    }
    takePicture() { ... }
    someProp = 'default';
}
```

This keeps the library non-opinionated about *how* initVals are applied — some features might want `Object.assign`, others might want `assignGingerly`, others might want selective picking.

### Questions

#### 1. Should the library auto-merge initVals, or leave it to the constructor?

Two options:

- **(A) Constructor handles it** — the library just passes `initVals` through. The feature class decides what to do. More flexible, less magic.
- **(B) Library auto-merges** — after `new SpawnClass(this, ctx, initVals)`, the library also does `assignGingerly(instance, initVals)` if initVals is an object. Less boilerplate for feature authors, but potentially double-applies if the constructor already handled it.

I'd recommend **(A)** — let the constructor handle it. It's consistent with how enhancement spawners work (they receive `initVals` and decide what to do). If we want a convenience, we could document a base class or mixin pattern.

#### 2. The own-property delete — is this safe?

Deleting the own-property to unshadow the getter is the standard pattern for custom element pre-upgrade properties (it's what LitElement, FAST, and others do in `connectedCallback`). The only edge case: if someone stored a non-serializable value (like a DOM node reference) as the own-property, we'd capture it as `initVals` and pass it to the constructor. That seems fine — the constructor can handle whatever type it receives.

#### 3. Should `assignGingerly` also capture pre-set values?

Consider this sequence:

```JavaScript
const el = document.createElement('club-member'); // getter already on prototype
assignGingerly(el, { photoTaker: { someProp: 'hello' } });
// → getter fires, spawns instance, then assignGingerly merges { someProp: 'hello' } into it
```

This already works correctly with the current implementation (getter-only triggers merge). The `initVals` mechanism is specifically for the case where a plain property was set *before* the getter existed on the prototype (pre-upgrade scenario).

#### 4. Ordering documentation

You mentioned we should document that `assignFeatures` must be called before `define`. I'd suggest adding this to both the README and as a JSDoc comment on the method. Something like:

> **Important:** Call `assignFeatures` before `customElements.define()`. The lazy getters must be on the prototype before any instances are created, otherwise pre-set properties will shadow the getters without the capture-and-delete mechanism being in place.

Actually — wait. If `assignFeatures` installs the getter on the prototype, and `define` doesn't change the prototype, then even if `define` is called first, the getter installed afterward would still be on the prototype and accessible to existing instances. The issue is only if instances were created *and had properties set on them* between `define` and `assignFeatures`. So the documentation should say:

> **Important:** Call `assignFeatures` before `customElements.define()`, or at minimum before any instances of the element are created. If an instance has an own-property that matches a feature key, the getter will capture it as `initVals` on first access and delete the own-property.

#### 5. The `ctx` shape — keep it lean?

I proposed `FeatureSpawnContext` with `{ key, optIn, injection, featuresRegistry }`. Is there anything else you'd want in there? For enhancements, `SpawnContext` includes `config`, `mountCtx`, `synthesizerElement`, and `emc`. For features, I think we keep it minimal now and expand later (e.g., when `withAttrs` support arrives in a future phase).

### Summary of proposed changes

1. Add `FeatureSpawnContext` interface.
2. Update `SupportedFeatureConfig.fallbackSpawn` and `FeatureInjection.spawn` signatures to `new(hostElement, ctx: FeatureSpawnContext, initVals?: any)`.
3. In the getter: check `Object.hasOwn(this, key)`, capture value, delete own-property, pass as `initVals`.
4. Pass `ctx` with `{ key, optIn, injection, featuresRegistry }`.
5. Document the ordering requirement (`assignFeatures` before `define`).

This is a small, focused change to the getter logic — no new files needed, just updates to `assignFeatures.ts` / `.js` and the types.


---

## Kiro Session State — RESOLVED

The initVals tests are now passing (23/23). Full test suite passes (60/60).

### Final approach chosen: getter-only + `captureFeatureInitVals` helper

The getter+setter approach was abandoned because it conflicts with assignGingerly's readonly property detection (which requires getter-only to trigger merge behavior).

Instead:
- **Getter-only** on the prototype (preserves assignGingerly merge behavior).
- **`captureFeatureInitVals(this)`** — a helper function the custom element constructor calls to capture and delete own-properties that shadow the getter. The captured values are stored in the WeakMap tagged with a `RAW_INIT_VALS` sentinel symbol.
- The getter checks for sentinel-tagged values in the WeakMap and uses them as `initVals` when spawning.

### Usage pattern for custom element authors

```javascript
import { captureFeatureInitVals } from 'assign-gingerly/assignFeatures.js';

class ClubMember extends HTMLElement {
    static supportedFeatures = { photoTaker: { fallbackSpawn: PhotoTakerImpl } }
    constructor() {
        super();
        captureFeatureInitVals(this); // captures pre-upgrade own-properties
    }
}
```

### What was implemented

1. `assignFeatures.ts` — added `RAW_INIT_VALS` sentinel, updated getter to check for sentinel-tagged values, added `captureFeatureInitVals` export.
2. `index.ts` — exports `captureFeatureInitVals`.
3. `tests/assign-features.html` — initVals tests use the helper in the constructor, assignGingerly merge tests work with getter-only.

