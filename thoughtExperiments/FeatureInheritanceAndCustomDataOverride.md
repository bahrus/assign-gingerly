# Feature Inheritance and CustomData Override

---

## The Question

A parent custom element registers features with specific `customData`. A child class inherits those features but wants to override only the `customData` (e.g., different attribute mappings, different configuration) while keeping the same spawn class.

## How It Works Today

### The inheritance is automatic

```javascript
class Parent extends HTMLElement {
    static supportedFeatures = {
        roundabout: { fallbackSpawn: RoundaboutFeature }
    }
}

await customElements.assignFeatures(Parent, {
    roundabout: {
        spawn: RoundaboutFeature,
        customData: { template: parentTemplate, bindings: parentBindings },
        withAttrs: { base: 'ra', mode: '${base}-mode' },
        callbackForwarding: ['connectedCallback']
    }
});

class Child extends Parent {
    // Inherits the roundabout getter from Parent.prototype
    // No additional code needed for basic inheritance
}

customElements.define('parent-el', Parent);
customElements.define('child-el', Child);

const el = document.createElement('child-el');
el.roundabout; // ✓ Works — uses Parent's customData
```

### To override customData, the child must re-register

```javascript
class Child extends Parent {
    static supportedFeatures = {
        roundabout: { fallbackSpawn: RoundaboutFeature }
    }
}

// Must call assignFeatures on Child separately
await customElements.assignFeatures(Child, {
    roundabout: {
        spawn: RoundaboutFeature,
        customData: { template: childTemplate, bindings: childBindings }, // different!
        withAttrs: { base: 'ra', mode: '${base}-mode' }, // same
        callbackForwarding: ['connectedCallback'] // same
    }
});
```

This works because:
1. `assignFeatures(Child, ...)` checks `Object.getOwnPropertyDescriptor(Child.prototype, 'roundabout')` — the getter is on `Parent.prototype`, not `Child.prototype`, so no conflict.
2. A new getter is installed on `Child.prototype` that closes over `Child` as `ctr`.
3. The child's getter shadows the parent's (prototype chain: `Child.prototype` → `Parent.prototype`).
4. The registry has separate entries for `Parent` and `Child`.

### The problem: boilerplate

The child has to repeat the entire `assignFeatures` call — `spawn`, `withAttrs`, `callbackForwarding` — just to change `customData`. This is verbose and fragile (if the parent's config changes, the child's copy is stale).

## Possible Improvements

### Option A: `assignFeatures` with merge semantics

Allow a child to call `assignFeatures` with partial overrides that merge with the parent's registration:

```javascript
// Only specify what's different
customElements.assignFeatures(Child, {
    roundabout: {
        customData: { template: childTemplate, bindings: childBindings }
        // spawn, withAttrs, callbackForwarding inherited from Parent's registration
    }
}, { inherit: Parent });
```

The library would look up `Parent`'s registration for `roundabout`, merge the child's overrides on top, and register the result under `Child`.

**Pros:** Minimal boilerplate. Only declare what's different.
**Cons:** New `inherit` option adds API complexity. Merge semantics need to be well-defined (shallow? deep? replace arrays or concat?).

### Option B: Factory function pattern (no library changes)

The parent exports a factory that produces the config:

```javascript
// parent-features.js
export function getRoundaboutConfig(overrides = {}) {
    return {
        spawn: RoundaboutFeature,
        withAttrs: { base: 'ra', mode: '${base}-mode' },
        callbackForwarding: ['connectedCallback'],
        customData: { template: defaultTemplate, bindings: defaultBindings },
        ...overrides,
        // Deep merge customData if both exist
        customData: { ...defaultCustomData, ...overrides.customData }
    };
}

// child-def.js
import { getRoundaboutConfig } from 'parent-el/parent-features.js';

await customElements.assignFeatures(Child, {
    roundabout: getRoundaboutConfig({
        customData: { template: childTemplate, bindings: childBindings }
    })
});
```

**Pros:** No library changes. Explicit. Composable.
**Cons:** Requires the parent to export a factory (not always the case for third-party components).

### Option C: `customData` as a getter on `supportedFeatures`

The child overrides `static supportedFeatures` with a getter that provides different `customData`:

```javascript
class Child extends Parent {
    static supportedFeatures = {
        roundabout: {
            fallbackSpawn: RoundaboutFeature,
            // Child-specific customData used when the getter reads optIn
            customData: { template: childTemplate, bindings: childBindings }
        }
    }
}
```

Then the getter reads `customData` from `optIn` (the `supportedFeatures` entry) as a fallback when `injection.customData` is not set. This would require a small change to the getter:

```javascript
// In the getter, when building ctx:
const customData = injection.customData ?? optIn.customData;
```

**Pros:** Very clean for the child — just override `static supportedFeatures` with different `customData`. No re-registration needed.
**Cons:** Mixes "author config" (`supportedFeatures`) with "deployment config" (`customData`). But `customData` is already a pass-through field, so this might be acceptable.

### Option D: `static assignTo` on the FeatureConfig (BYOA for configs)

Not really applicable here — `assignTo` is for instance-level assignment, not class-level config.

## My Recommendation

**Option C** is the most elegant for this specific use case. It requires a one-line change to the getter (fallback to `optIn.customData` when `injection.customData` is undefined) and lets children override just by redefining `static supportedFeatures`:

```javascript
class Child extends Parent {
    static supportedFeatures = {
        roundabout: {
            fallbackSpawn: RoundaboutFeature,
            customData: childCustomData  // only thing that's different
        }
    }
}

// No assignFeatures call needed for Child — inherits Parent's getter,
// but the getter reads Child's supportedFeatures.roundabout.customData
```

Wait — there's a subtlety. The getter closes over `ctr` (the parent). It reads `(ctr as any).supportedFeatures` — which is the *parent's* `supportedFeatures`, not the child's. So Option C doesn't work as-is.

To make it work, the getter would need to read `this.constructor.supportedFeatures` instead of `ctr.supportedFeatures`. But that changes the semantics — the getter would dynamically resolve the config based on the actual instance's class, not the class it was registered on.

**Revised Option C:** Change the getter to read `optIn` from `this.constructor.supportedFeatures[key]` (dynamic) instead of `ctr.supportedFeatures[key]` (static/closed-over). This is a small but meaningful change:

```javascript
// Current (static):
const supportedFeatures = (ctr as any).supportedFeatures;
const optIn = supportedFeatures?.[key];

// Proposed (dynamic):
const supportedFeatures = (this.constructor as any).supportedFeatures;
const optIn = supportedFeatures?.[key];
```

This would make `getSharedContext`, `validateShape`, `callbackForwarding` (on the author side), and a new `customData` on `supportedFeatures` all dynamically resolved per-subclass. That's actually more correct for inheritance — the child's `supportedFeatures` should take precedence for the child's instances.

**However**, this is a behavioral change that could break existing code if anyone relies on the parent's `supportedFeatures` being used for child instances. Worth considering carefully.

## Summary

| Option | Library change | Boilerplate | Elegance |
|--------|---------------|-------------|----------|
| A (merge semantics) | Medium (new `inherit` option) | Low | Medium |
| B (factory pattern) | None | Medium | Good (explicit) |
| C (dynamic optIn lookup) | Small (change `ctr` → `this.constructor`) | Very low | High |

For now, **Option B** (factory pattern) works without any library changes. **Option C** is worth implementing if the inheritance use case becomes common — it's a small change with big ergonomic payoff.
