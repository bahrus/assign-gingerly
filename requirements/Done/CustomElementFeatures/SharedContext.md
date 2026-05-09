# Shared Context

---

## Human Ask

In the thoughtExperiments/SharingElementInternalsAndPrivatefields.md, kiro suggested the following approach.  I think this is a good approach.  Let's please go for it.

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



---

## Kiro's Response

No issues — proceeding with implementation.
