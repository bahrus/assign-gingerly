# How to support a roundabout custom element feature

---

## Human ask

So far, I've defined two custom element features in separate packages, and am happy with how it's going.  One to manage attributes / properties binding.  Another to manage css state reflection.

Now there's a third custom element feature I'd like to support, but it runs into a snag.

Without using a feature, setting up the roundabout functionality looks as follows:

```JavaScript
class UserCounterSync extends HTMLElement {
                
    // Synchronous connectedCallback - no async needed!
    connectedCallback() {
        const [vm, propagator] = roundaboutSync({
            vm: this,
            ...raConfig,
        });

        this.status = 'low';
        this.statusMessage = '';
        this.renderCount = 0;
        this.template = template;

        const attrVals = parseWithAttrs(this, raConfig.customData.withAttrs, true);
        assignGingerly(this, attrVals);

        this._vm = vm;
        this._propagator = propagator;
    }
    ...
}

// One-time async setup: pre-loads modules, installs prototype getter/setters
await makeRoundaboutReady(UserCounterSync, raConfig);

// Now define the element - connectedCallback will be synchronous!
customElements.define('user-counter-sync', UserCounterSync);
```

So when I switch this to a feature, the feature needs a callback when the feature is linked up with the target class.

I'm thinking the feature class could define a static method where it can execute the code.

How would you suggest the API looks like?



---

## Kiro's Comments

I see the pattern. The key difference from other features is that `makeRoundaboutReady` needs to run **at registration time** (when `assignFeatures` is called), not at spawn time (when the getter fires). It does one-time class-level setup — installing prototype getter/setters, pre-loading modules — before any instances exist.

This is a new lifecycle moment: "feature was registered on this class." The existing lifecycle moments are:
- **Spawn time** (getter fires) — constructor runs
- **Connected** (via `callbackForwarding`) — `connectedCallback` forwarded

What you need is:
- **Registration time** (when `assignFeatures` processes this feature) — one-time class setup

### Proposed API: `static onAssigned(ctr, featureConfig)`

The feature class defines a static method that `assignFeatures` calls immediately after registering the feature and installing the getter:

```javascript
class RoundaboutFeature {
    static async onAssigned(ctr, featureConfig) {
        // One-time class-level setup
        // Install prototype getter/setters, pre-load modules, etc.
        await makeRoundaboutReady(ctr, featureConfig.customData);
    }

    constructor(host, ctx, initVals) {
        // Instance-level setup (runs on first getter access)
        const [vm, propagator] = roundaboutSync({
            vm: host,
            ...ctx.injection.customData,
        });
        this._vm = vm;
        this._propagator = propagator;
    }

    connectedCallback() {
        // Per-connect logic if needed
    }
}
```

Usage:

```javascript
class UserCounterSync extends HTMLElement {
    static supportedFeatures = {
        roundabout: {
            fallbackSpawn: RoundaboutFeature,
            callbackForwarding: ['connectedCallback'],
            getSharedContext(instance) {
                return { /* whatever roundabout needs */ };
            }
        }
    }
}

await customElements.assignFeatures(UserCounterSync, {
    roundabout: {
        spawn: RoundaboutFeature,
        customData: raConfig
    }
});

customElements.define('user-counter-sync', UserCounterSync);
```

### How it works

1. `assignFeatures` processes the feature as normal (validates, registers, installs getter).
2. After installing the getter, it checks if `spawn.onAssigned` exists (via `Object.hasOwn(SpawnClass, 'onAssigned')`).
3. If found, calls `SpawnClass.onAssigned(ctr, featureConfig)`.
4. If `onAssigned` returns a Promise, `assignFeatures` can either:
   - **(A)** Await it — making `assignFeatures` async (breaking change)
   - **(B)** Fire-and-forget — `assignFeatures` stays sync, but the consumer must `await` separately
   - **(C)** Return a Promise from `assignFeatures` when any `onAssigned` is async

### The async question

Your example has `await makeRoundaboutReady(...)` — it's async. This means `assignFeatures` would need to become async (or return a Promise). Currently it's synchronous.

**Option A: Make `assignFeatures` return a Promise when needed**

```javascript
// If any feature has async onAssigned, returns a Promise
// Otherwise returns undefined (backward compatible)
const ready = customElements.assignFeatures(UserCounterSync, { ... });
if (ready) await ready;
customElements.define('user-counter-sync', UserCounterSync);
```

**Option B: Separate async setup from registration**

Keep `assignFeatures` synchronous. The consumer calls `onAssigned` manually:

```javascript
customElements.assignFeatures(UserCounterSync, { roundabout: { spawn: RoundaboutFeature, customData: raConfig } });
await RoundaboutFeature.onAssigned(UserCounterSync, raConfig);
customElements.define('user-counter-sync', UserCounterSync);
```

But this defeats the purpose — the consumer shouldn't need to know about `onAssigned`.

**Option C: `assignFeatures` always returns a Promise**

```javascript
await customElements.assignFeatures(UserCounterSync, { ... });
customElements.define('user-counter-sync', UserCounterSync);
```

If no `onAssigned` hooks exist, the Promise resolves immediately. This is the cleanest but makes `assignFeatures` always async.

### My recommendation: Option A (conditional Promise)

```javascript
const maybePromise = customElements.assignFeatures(UserCounterSync, { ... });
if (maybePromise) await maybePromise;
// or simply: await customElements.assignFeatures(...); // works either way
```

`assignFeatures` returns `undefined` (falsy) when all features are synchronous (backward compatible — existing code that doesn't `await` still works). Returns a `Promise` when any feature has an async `onAssigned`.

Since `await undefined` is a no-op in JavaScript, consumers can always write `await customElements.assignFeatures(...)` and it works regardless.

### Alternative: `static onAssigned` on `SupportedFeatureConfig`

Instead of putting it on the spawn class, put it on `supportedFeatures`:

```javascript
static supportedFeatures = {
    roundabout: {
        fallbackSpawn: RoundaboutFeature,
        async onAssigned(ctr, featureConfig) {
            await makeRoundaboutReady(ctr, featureConfig.customData);
        }
    }
}
```

This keeps the hook on the author side (where the class-level setup knowledge lives). But it means the author must know about `makeRoundaboutReady` at declaration time, which they do since they're the feature author.

### Which side should own `onAssigned`?

I think **the spawn class** (static method) is the right place:
- The feature class knows what class-level setup it needs.
- It's self-contained — the feature is a single class that handles all its own lifecycle.
- It follows the same pattern as `static assignTo` — static methods as protocols.
- The consumer doesn't need to know about it.

### Summary

| Aspect | Recommendation |
|--------|---------------|
| Hook name | `static onAssigned(ctr, featureConfig)` on the spawn class |
| When called | By `assignFeatures`, after getter installation |
| Async support | `assignFeatures` returns a Promise when any `onAssigned` is async |
| Backward compat | `await assignFeatures(...)` always works; non-awaiting code still works for sync features |
| Detection | `Object.hasOwn(SpawnClass, 'onAssigned')` (only sync spawners; async spawners can't have it since the class isn't loaded yet) |

Shall I implement?
