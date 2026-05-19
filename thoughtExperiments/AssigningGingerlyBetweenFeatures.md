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

## Human Response I

Thanks for your input.  I think because the need for sharing seems to me to be so common, I would like to push forward with a formal solution, shown below.  Actually, the ideal solution, and why it could pose problems followed by a more foolproof suggestion, perhaps.

### Appealing, but problematic solution

1.  assignFeatures should provide an API, suggestFeatureInfo:

(fromFeatureCtr is the class definition for the feature that wants to provide input to the other feature with class toFea)

```JavaScript
// module assignFeatures.js

//replace any with the correct type
export function suggestFeatureInfo(fromFeatureCtr: any, toFeatureCTR: any,  featureInfo: {
    withAttr?: AttrPattern,
    customData?: any
}){
    //please figure out how to implement this
}

export function getFeatureInfoSuggestions(toFeatureCtr: any){
    //please figure out how to implement this
}: Map<ctr, {withAttr?: AttrPattern, customData?: any} >
```

### Why the solution above is problematic

If feature A assumes version 1.0 of Feature B will be used, but in fact version 1.1 is used, the keys won't match.  Likewise, what about mock features?

### Less elegnt solution

Feature A publishes unique 

```JavaScript
export const myID =  Symfol.for('feature-a-my-id');
```

New versions will still use the same constant, and mock features that want to import shared info should use the same one as well

```JavaScript
// module assignFeatures.js

//replace any with the correct type
export function suggestFeatureInfo(fromFeatureCtr: any, toFeatureSymbol: Symbol,  featureInfo: {
    withAttr?: AttrPattern,
    customData?: any
}){
    //please figure out how to implement this
}

export function getFeatureInfoSuggestions(toFeatureSymbol: Symbol){
    //please figure out how to implement this
}: Map<ctr, {withAttr?: AttrPattern, customData?: any} >
```





---

## Kiro's Response I

Good thinking on the versioning/mock problem. Using a Symbol as the stable identifier is the right call — it decouples the "who am I sending to" from the actual class reference, which solves both the version mismatch and mock substitution problems.

### On the API shape

The Symbol-based approach is clean. Let me refine the implementation:

```typescript
// A global (module-scoped) map of suggestions
// Key: target feature Symbol, Value: array of suggestions from various sources
const featureInfoSuggestions = new Map<symbol, Array<{
    from: Function;  // the suggesting feature's constructor (for debugging/tracing)
    withAttrs?: any; // AttrPatterns to merge
    customData?: any; // customData to merge
}>>();

export function suggestFeatureInfo(
    fromFeatureCtr: Function,
    toFeatureSymbol: symbol,
    featureInfo: { withAttrs?: any; customData?: any }
): void {
    let suggestions = featureInfoSuggestions.get(toFeatureSymbol);
    if (!suggestions) {
        suggestions = [];
        featureInfoSuggestions.set(toFeatureSymbol, suggestions);
    }
    suggestions.push({ from: fromFeatureCtr, ...featureInfo });
}

export function getFeatureInfoSuggestions(
    toFeatureSymbol: symbol
): Array<{ from: Function; withAttrs?: any; customData?: any }> {
    return featureInfoSuggestions.get(toFeatureSymbol) || [];
}
```

### How it would be used

Feature A (e.g., template parser) publishes its Symbol and calls `suggestFeatureInfo` during its `onAssigned`:

```javascript
// face-up/symbols.js
export const FACE_UP_FEATURE = Symbol.for('bahrus/face-up');

// face-up/FaceUp.js
import { suggestFeatureInfo } from 'assign-gingerly/assignFeatures.js';
import { FACE_UP_FEATURE } from './symbols.js';
import { ROUNDABOUT_FEATURE } from 'roundabout/symbols.js';

class FaceUp {
    static onAssigned(ctr, featureConfig) {
        // ... face-up setup ...
        
        // Suggest config to roundabout (if it's being used)
        suggestFeatureInfo(FaceUp, ROUNDABOUT_FEATURE, {
            customData: {
                formBindings: { value: 'value', validity: 'validity' }
            },
            withAttrs: {
                // additional attributes roundabout should parse
            }
        });
    }
}
```

Feature B (roundabout) reads suggestions during its `onAssigned`:

```javascript
// roundabout/symbols.js
export const ROUNDABOUT_FEATURE = Symbol.for('bahrus/roundabout');

// roundabout/RoundaboutFeature.js
import { getFeatureInfoSuggestions } from 'assign-gingerly/assignFeatures.js';
import { ROUNDABOUT_FEATURE } from './symbols.js';

class RoundaboutFeature {
    static onAssigned(ctr, featureConfig) {
        // Read suggestions from other features
        const suggestions = getFeatureInfoSuggestions(ROUNDABOUT_FEATURE);
        
        for (const suggestion of suggestions) {
            if (suggestion.customData) {
                featureConfig.customData = {
                    ...featureConfig.customData,
                    ...suggestion.customData
                };
            }
            if (suggestion.withAttrs) {
                // Merge withAttrs (this needs thought — how to merge AttrPatterns?)
                featureConfig.withAttrs = {
                    ...featureConfig.withAttrs,
                    ...suggestion.withAttrs
                };
            }
        }
        
        // ... rest of roundabout setup
    }
}
```

### Timing consideration

This works cleanly **if** Feature A's `onAssigned` runs before Feature B's `onAssigned`. Since `assignFeatures` processes keys in declaration order, the consumer just needs to declare them in the right order:

```javascript
await customElements.assignFeatures(MyElement, {
    faceUp: { spawn: FaceUp },           // runs first, calls suggestFeatureInfo
    roundabout: { spawn: RoundaboutFeature }  // runs second, reads suggestions
});
```

If the consumer gets the order wrong, roundabout's `onAssigned` won't see face-up's suggestions (they haven't been posted yet). This is acceptable — it's a documented ordering requirement, same as "call `assignFeatures` before `define`."

### One refinement: scoping suggestions per class

The current design is global — suggestions accumulate across all classes. If two different custom elements both use face-up and roundabout, face-up's suggestions from Element A would leak into Element B's roundabout.

Fix: scope suggestions per target class:

```typescript
const featureInfoSuggestions = new Map<symbol, Map<Function, Array<{...}>>>();

export function suggestFeatureInfo(
    fromFeatureCtr: Function,
    toFeatureSymbol: symbol,
    featureInfo: { withAttrs?: any; customData?: any },
    targetClass: Function  // the class being configured
): void { ... }

export function getFeatureInfoSuggestions(
    toFeatureSymbol: symbol,
    targetClass: Function
): Array<{...}> { ... }
```

Then `onAssigned` passes `ctr` as the `targetClass`:

```javascript
static onAssigned(ctr, featureConfig) {
    suggestFeatureInfo(FaceUp, ROUNDABOUT_FEATURE, { ... }, ctr);
}
```

And roundabout reads:

```javascript
static onAssigned(ctr, featureConfig) {
    const suggestions = getFeatureInfoSuggestions(ROUNDABOUT_FEATURE, ctr);
}
```

### Summary

The Symbol-based approach is solid. I'd implement it with:
1. `suggestFeatureInfo(fromCtr, toSymbol, info, targetClass)` — scoped per target class
2. `getFeatureInfoSuggestions(toSymbol, targetClass)` — returns array of suggestions
3. Document the ordering requirement (suggesting feature must be declared before consuming feature)
4. Each feature package exports its Symbol (e.g., `export const ROUNDABOUT_FEATURE = Symbol.for('bahrus/roundabout')`)

Want me to implement this?
