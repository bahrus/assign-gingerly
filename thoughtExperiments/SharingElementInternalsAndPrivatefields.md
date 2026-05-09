# Sharing Element Internals and Private fields

---

## Human Ask

Adding support for custom element features allows us to delegate functionality to reusable modules that can be used by other custom elements, and allows for dynamic dependency injection.

But by moving logic out of the root class and into a compositional class property, the logic loses access to private information in the class.  One of the most important examples of this is access to element internals.

Individual classes can define methods or listen for events spawned from its instance, and passes such information to the features, on a case-by-case basesis.

The thrust of this thought experiment:

Are there any benefits to creating a uniform pattern and/or API for allowing this information sharing to take place.


---

## Kiro's Comments

This is a real tension in the composition-over-inheritance model. The moment you move logic out of the class, you lose `#private` access and `ElementInternals`. Let me think through the options:

### The problem stated concretely

```javascript
class MyButton extends HTMLElement {
    #internals;
    #privateState = { clickCount: 0 };

    constructor() {
        super();
        this.#internals = this.attachInternals();
    }

    // Feature needs access to #internals to set ARIA states
    // Feature needs access to #privateState to read/write click count
    // But features are external classes — they can't see # fields
}
```

### Current ad-hoc solutions

1. **Event-based handoff** (from your WHATWG proposal): The custom element listens for a `feature-added` event and passes internals to the feature via a setter. Works, but requires boilerplate per feature.

2. **Constructor parameter**: The feature constructor receives the host element, and the host exposes what it wants to share via public (or symbol-keyed) properties. Simple, but makes "private" things public.

3. **Closure-based sharing**: The custom element creates a shared context object in its constructor and passes it to features. Features receive it via `ctx` or `initVals`.

### Is a uniform API worth it?

I think **yes**, but with a light touch. Here's why:

- Without a pattern, every custom element author invents their own sharing mechanism. Some use events, some use public properties, some use WeakMaps. This makes features non-portable — a feature written for one element's sharing pattern won't work with another's.
- A uniform pattern means features can declare what they *need* (internals, specific private data) and the host can declare what it *provides*, with a standard handoff mechanism.

### Possible approaches

#### A. `sharedContext` on `FeatureSpawnContext`

The simplest: add a `sharedContext` field to `FeatureSpawnContext` that the custom element populates:

```javascript
class MyButton extends HTMLElement {
    #internals;
    #state = { clickCount: 0 };

    static supportedFeatures = {
        ariaManager: {
            fallbackSpawn: AriaManagerImpl,
            lifecycleKeys: true
        }
    }

    constructor() {
        super();
        this.#internals = this.attachInternals();
        captureFeatureInitVals(this);
    }

    // Called by the library before spawning each feature
    static getSharedContext(instance, featureKey) {
        return {
            internals: instance.#internals,
            state: instance.#state
        };
    }
}
```

The library calls `ctr.getSharedContext(this, key)` in the getter and passes the result on `ctx.shared`. The feature reads `ctx.shared.internals`.

**Pros:** Simple, explicit, the host controls exactly what's shared. Static method has access to private fields via the class scope.

**Cons:** The static method receives the instance — this works because static methods of a class *can* access private fields of instances of that class. But it requires the developer to know this JavaScript quirk.

#### B. `provideInternals` lifecycle hook

A more targeted approach for the most common case (internals):

```javascript
class MyButton extends HTMLElement {
    static supportedFeatures = {
        ariaManager: {
            fallbackSpawn: AriaManagerImpl,
            provideInternals: true  // library will call feature.internals = host.#internals
        }
    }
}
```

The library, after spawning the feature, checks if `provideInternals` is set and calls a setter on the feature instance. But... the library doesn't have access to `#internals` either. So this only works if the host exposes internals via a known mechanism.

This could work with a convention: the host stores internals in a WeakMap that the library can access:

```javascript
// Library-provided WeakMap
export const elementInternalsMap = new WeakMap();

class MyButton extends HTMLElement {
    constructor() {
        super();
        const internals = this.attachInternals();
        elementInternalsMap.set(this, internals);
    }
}
```

Then the library can do `feature.internals = elementInternalsMap.get(host)` automatically.

**Pros:** Zero-boilerplate for the most common case.
**Cons:** Requires the host to opt into storing internals in a shared WeakMap. Less flexible for arbitrary private data.

#### C. `shareWith` callback on `SupportedFeatureConfig`

```javascript
static supportedFeatures = {
    ariaManager: {
        fallbackSpawn: AriaManagerImpl,
        shareWith(instance, featureInstance) {
            featureInstance.internals = instance.#internals;
            featureInstance.state = instance.#state;
        }
    }
}
```

Called by the library after spawning. The callback is defined in the class body, so it has access to `#private` fields.

**Pros:** Per-feature granularity. Defined in the class scope (private access). Clear intent.
**Cons:** Runs after construction — the feature constructor can't use the shared data. Would need a two-phase init (constructor + `shareWith` callback).

#### D. Hybrid: `getSharedContext` + `ctx.shared`

Combine A and C:

```javascript
static supportedFeatures = {
    ariaManager: {
        fallbackSpawn: AriaManagerImpl,
        // Per-feature shared context (has access to #private via class scope)
        getSharedContext(instance) {
            return { internals: instance.#internals };
        }
    }
}
```

The library calls `optIn.getSharedContext(this)` before spawning and passes the result as `ctx.shared`. The feature constructor receives it immediately:

```javascript
class AriaManagerImpl {
    constructor(host, ctx, initVals) {
        this.#internals = ctx.shared.internals;
    }
}
```

**Pros:** Available at construction time. Per-feature. Private access via class scope. Clean.
**Cons:** Slightly more complex type signature.

### My recommendation

**Option D** (`getSharedContext` on `SupportedFeatureConfig`) is the cleanest:

1. It's available at construction time (no two-phase init).
2. It's per-feature (different features can get different slices of private state).
3. It's defined in the class body (has `#private` access).
4. It's opt-in (no shared context if not defined — `ctx.shared` is `undefined`).
5. It composes well with the existing `FeatureSpawnContext` — just add a `shared` field.

### Should this be implemented now?

I'd say **not yet** — this is a thought experiment, and the current system works without it (developers can use the event-based or constructor-parameter approaches today). But it's worth:

1. Reserving the `shared` field on `FeatureSpawnContext` (don't use it for something else).
2. Documenting the recommended pattern (Option D) so early adopters know what's coming.
3. Implementing it when a real consumer hits the pain point and validates the API shape.

The implementation itself would be small: ~5 lines in the getter to call `optIn.getSharedContext?.(this)` and attach it to `ctx.shared`.
