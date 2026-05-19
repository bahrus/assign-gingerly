# Assigning Gingerly Between Features

---

## Human Ask

I'm finding an increasing number of use cases where one custom element feature provides information needed by another custom element feature.  The most glaring one for me is the [roundabout-feature](https://github.com/bahrus/face-up), because it tends to be the feature that ties everything together.  We have one thought experiment that focuses on inheritance, which is one angle to approach this problem.  I'm thinking that another approach would be to inherit all the features except the round-about feature, and make that the one that gets a fresh coat of paint when defining the end user custom element.

The first such scenario, which seems surmountable in a way, is the [face-up enhancement](https://github.com/bahrus/face-up).  It [documents](https://github.com/bahrus/face-up#roundabout-integration) and [publishes a specific, static module](https://raw.githubusercontent.com/bahrus/face-up/refs/heads/baseline/RAConfig.mjs) that will want to be merged into to the roundabout settings.  But this requires a certain amount of coordination, which is okay, I guess.

What is tipping me over the edge enough to bring up this topic (in addition to the topic of custom element inheritance) is another feature I'm planning, that takes a document fragment from the live DOM tree, and turns it into template that can be used by the custom element to clone in each instance.  I want that feature to optionally look for microdata itemprop attributes, and form some roundabout merges and withAttrs and propagator settings that the roundabout feature would want to incorporate in.  This can't be published as a static module.

Basically, I would like to make sure we have a predictable chain, timing wise, and feature A, if passed a flag to do so, to be able to optionally say, "hey, feature B, I think you will want to merge this information into your settings" when it's your turn to register.

How would you orchestrate that?



---

## Kiro's Comments

This is a real coordination problem. You have features that produce configuration that other features need to consume, and the timing matters — Feature A needs to run (or at least produce its output) before Feature B registers/spawns.

Let me think through the options:

### The core tension

- Features are lazily spawned (getter fires on first access).
- `assignFeatures` is called once, registering all features simultaneously.
- But Feature A's output (dynamic config) isn't available until Feature A does some work (e.g., parsing the DOM template).
- Feature B (roundabout) needs that output as part of its `customData` or `withAttrs`.

### Option 1: `onAssigned` ordering + shared state

We already have `static onAssigned` which runs at registration time. If features are processed in key order, Feature A's `onAssigned` runs before Feature B's:

```javascript
await customElements.assignFeatures(MyElement, {
    // Processed first (object key order)
    templateParser: {
        spawn: TemplateParserFeature,
        customData: { lookForMicrodata: true }
    },
    // Processed second — can read what templateParser produced
    roundabout: {
        spawn: RoundaboutFeature,
        customData: baseRoundaboutConfig
    }
});
```

Feature A's `onAssigned` could store its output somewhere that Feature B's `onAssigned` reads:

```javascript
class TemplateParserFeature {
    static onAssigned(ctr, featureConfig) {
        // Parse DOM, discover microdata, produce roundabout config fragments
        const discovered = discoverMicrodataBindings(ctr);
        // Store on the class for roundabout to pick up
        ctr.__templateParserOutput = discovered;
    }
}

class RoundaboutFeature {
    static onAssigned(ctr, featureConfig) {
        // Merge in anything templateParser discovered
        const extra = ctr.__templateParserOutput;
        if (extra) {
            featureConfig.customData = {
                ...featureConfig.customData,
                ...extra
            };
        }
        // ... rest of roundabout setup
    }
}
```

**Pros:** Works today with existing `onAssigned`. No new API needed.
**Cons:** Relies on object key ordering (which is guaranteed in modern JS for string keys). Uses a "magic" property on the class (`__templateParserOutput`) — not formalized.

### Option 2: Formalize inter-feature communication via `featuresConfig`

Add a class-level "shared bus" that features can write to and read from during `onAssigned`:

```javascript
class MyElement extends HTMLElement {
    static supportedFeatures = { ... }
    static featuresConfig = {
        lifecycleKeys: true,
        // Shared state that features can read/write during onAssigned
        shared: {}
    }
}
```

Then `onAssigned` receives access to this shared object:

```javascript
class TemplateParserFeature {
    static onAssigned(ctr, featureConfig) {
        const discovered = discoverMicrodataBindings(ctr);
        ctr.featuresConfig.shared.templateBindings = discovered;
    }
}

class RoundaboutFeature {
    static onAssigned(ctr, featureConfig) {
        const extra = ctr.featuresConfig.shared.templateBindings;
        if (extra) {
            featureConfig.customData = { ...featureConfig.customData, ...extra };
        }
    }
}
```

**Pros:** Formalized location (no magic properties). Clear intent.
**Cons:** Still relies on ordering. `featuresConfig.shared` is a new concept.

### Option 3: Dependency declaration + topological sort

Features declare what they produce and what they consume:

```javascript
customElements.assignFeatures(MyElement, {
    templateParser: {
        spawn: TemplateParserFeature,
        provides: ['templateBindings'],  // what this feature produces at registration time
    },
    roundabout: {
        spawn: RoundaboutFeature,
        consumes: ['templateBindings'],  // what this feature needs before registering
    }
});
```

`assignFeatures` topologically sorts the features based on `provides`/`consumes` and processes them in dependency order. Each feature's `onAssigned` receives the accumulated "provided" values.

**Pros:** Explicit dependencies. Order-independent declaration. Self-documenting.
**Cons:** Significant API complexity. Overkill for 2-3 features?

### Option 4: Two-phase registration

Split `assignFeatures` into two phases:
1. **Register** — install getters, run `onAssigned` for all features.
2. **Finalize** — a second pass where features can read each other's outputs and adjust.

```javascript
class RoundaboutFeature {
    static onAssigned(ctr, featureConfig) {
        // Phase 1: basic setup
    }
    static onAllAssigned(ctr, featureConfig, allFeatureConfigs) {
        // Phase 2: read other features' outputs, merge
        const templateConfig = allFeatureConfigs.templateParser;
        if (templateConfig?.customData?.discoveredBindings) {
            featureConfig.customData = {
                ...featureConfig.customData,
                ...templateConfig.customData.discoveredBindings
            };
        }
    }
}
```

**Pros:** Clean separation. No ordering dependency. Each feature sees the full picture.
**Cons:** Two static methods to implement. More complex lifecycle.

### My recommendation

**Option 1** (ordering + shared state via class property) is the pragmatic choice for now. It works today, requires no library changes, and the pattern is simple enough to document:

> "Features are processed in declaration order. If Feature A needs to pass config to Feature B, declare A first. Use `static onAssigned` to store output on the class, and have B's `onAssigned` read it."

If this becomes a common pattern across many packages, **Option 2** (formalized `featuresConfig.shared`) is a small, clean addition that makes the convention explicit.

**Option 3** (topological sort) is over-engineered for the current scale. **Option 4** (two-phase) is worth considering if the "read other features' outputs" pattern becomes dominant.

### One more thought: runtime inter-feature communication

The above is all about *registration-time* coordination. For *runtime* communication between spawned feature instances (e.g., Feature A's instance dispatches an event that Feature B's instance listens to), the `propagator` pattern you're already using (shared EventTarget via `getSharedContext`) is the right approach. Features that need to talk at runtime share a propagator and dispatch/listen for events on it.
