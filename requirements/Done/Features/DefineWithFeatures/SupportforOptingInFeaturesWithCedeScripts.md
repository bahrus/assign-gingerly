# Support for Opting In Features

---

## Human ask

Custom Elements that adopt the features support of this package / polyfill can indicate which features they support, and even provide fallback implementations.  I think in practice these fallback implementations would tend to use async spawns, so that users of the custom element aren't penalized for choosing an alternative implementation.

This package adds an assignFeatures method to the CustomElementRegistry  that allows the party registering the custom element to first choose concrete choices as far as which features to actually add lazy getters to, as well as things like custom data, and then define the custom element. It happens within the auspices of unfettered access to the JavaScript runtime engine.

The package mount-observer leverages this package (assign-gingerly), and adds something called ["cede scripts"](https://github.com/bahrus/mount-observer#custom-element-definition-cede-scripts) that allows us to declaratively define custom elements within the HTML markup, by indicating the name of custom element to extend.  Please read that documentation carefully until it is well understood.

But for the benefit of cede scripts, it would be helpful to:

1.  Allow the developer to define a very simple base custom element class, even an "abstract class", at least in concept, that expects and indicates support for a large swath of compatible features it wants to recognize as "legitimate" features for custom elements deriving from the base class. Each feature would specify one (asynchronous) fallback spawn, in addition to other universal settings.

The expectation is that this "abstract class" would be defined, featureless in the customElementRegistry.define call.  It is used as a blueprint for a family of declarative custom element definitions that do similar but not identical things, and that will want to pick and choose which features are actually needed for the problem at hand.

Instead of focusing on providing the concrete implementing spawn, we want to have a function that expects to be passed in a JSON serializable packet, such as the JSON shown inside the script tag below:


```html
<time-ticker>
    <script type="cede" data-extends="el-maker">{
        "assignFeatures": {
            "timeTicker":{},
            "roundabout": {
                "customData": {...},
                "withAttrs": {...},
                "callbackForwarding": ["connectedCallback"]
            },
            "truthSourcer": {
                "callbackForwarding": ["connectedCallback", "attributeChangedCallback"],
                "getSharedAccess": {
                    "hostPropagator": "instance.propagator"
                }
            },
            "faceUp": {
            }
        }
    }</script>
</time-ticker>
```

So in order to support this functionality (which is part of an extending package) what would be helpful is if this package provides a utility function, name TBD, that is passed in the custom element constructor to extend, and the JSON shown inside the script tag above and:

1.  Waits for all the asynchronous fallback spawns of the supportedFeatures static property of the custom element constructor to become available.

2.  Creates a new Custom Element class that extends (in this case) the "el-maker" custom element.

3.  Defines and registers concrete feature implementations mapped to the new custom element class defined in step 2, with synchronous spawns that came from the fallbackSpawns in step 1, and that specifies the settings from the passed in JSON serializable object.

4.  Registers the new custom element.


---

## Kiro's Comments

This is a compelling use case — it bridges the declarative (HTML/JSON) world with the imperative (assignFeatures) world, enabling "zero-JS" custom element definitions that still get full feature support.

Let me work through the design:

### What the utility function does (step by step)

```javascript
// Proposed name: defineFromCede or instantiateFromCede or buildElement
// I'll use "defineFromCede" for now

import { defineFromCede } from 'assign-gingerly/assignFeatures.js';

await defineFromCede('time-ticker', 'el-maker', {
    assignFeatures: {
        timeTicker: {},
        roundabout: {
            customData: {...},
            withAttrs: {...},
            callbackForwarding: ['connectedCallback']
        },
        truthSourcer: {
            callbackForwarding: ['connectedCallback', 'attributeChangedCallback']
        },
        faceUp: {}
    }
});
```

Internally:

1. **Resolve the base class** — look up `'el-maker'` in the registry to get the constructor. Read its `static supportedFeatures`.

2. **Resolve all async fallback spawns** — for each feature key in the JSON that matches a key in `supportedFeatures`, if `fallbackSpawn` is an async function, call it and await the resolved constructor. Collect all resolved constructors.

3. **Create a subclass** — `class TimeTickerElement extends ElMaker {}` (dynamically). Copy `static supportedFeatures` from the parent (or inherit it).

4. **Call `assignFeatures`** — pass the new subclass and the JSON config, but with each feature's `spawn` set to the resolved fallback constructor from step 2 (unless the JSON explicitly provides a `spawn` — which it can't in JSON, so it's always the fallback).

5. **Define** — `customElements.define('time-ticker', TimeTickerElement)`.

### The `getSharedAccess` question

The JSON includes:
```json
"getSharedAccess": {
    "hostPropagator": "instance.propagator"
}
```

This is interesting — it's a declarative way to express `getSharedContext`. The string `"instance.propagator"` would be evaluated as a path on the instance. This could be implemented as:

```javascript
// Convert JSON getSharedAccess to a getSharedContext function
if (cedeConfig.getSharedAccess) {
    optIn.getSharedContext = (instance) => {
        const result = {};
        for (const [key, path] of Object.entries(cedeConfig.getSharedAccess)) {
            result[key] = resolveValue(path.replace('instance.', '?.'), instance);
        }
        return result;
    };
}
```

But wait — `getSharedContext` is on `supportedFeatures` (the author side), not on `FeatureConfig` (the consumer side). The base class should already define `getSharedContext` for features that need it. If the base class doesn't define it, the cede script can't add it (it doesn't have access to private fields).

**My suggestion:** The base class defines `getSharedContext` for all features that might need shared access. The cede script doesn't need to specify it — it's inherited. If the JSON includes `getSharedAccess`, it's only for *public* properties (like `propagator`), which could be handled by a generated `getSharedContext` on the subclass.

### Naming

- `defineFromCede` — ties it to the cede script concept
- `defineWithFeatures` — more generic
- `buildCustomElement` — descriptive but long

I'd lean toward **`defineWithFeatures`** since this utility could be used outside of cede scripts too (any scenario where you want to declaratively define a feature-based custom element from config).

### Where should this live?

This feels like it belongs in a separate module (`defineWithFeatures.js`) since:
- It's async (resolves fallback spawns)
- It's optional (not everyone uses cede scripts)
- It depends on `assignFeatures` but adds orchestration on top
- mount-observer would import it

### Implementation sketch

```javascript
export async function defineWithFeatures(
    tagName: string,
    baseClassName: string,  // or base class constructor directly
    config: {
        assignFeatures: Record<string, {
            customData?: any;
            withAttrs?: any;
            callbackForwarding?: string[];
            getSharedAccess?: Record<string, string>;
        }>
    },
    registry?: CustomElementRegistry
): Promise<Function> {
    const reg = registry || customElements;
    
    // 1. Resolve base class
    const BaseClass = reg.get(baseClassName) 
        || (typeof baseClassName === 'function' ? baseClassName : null);
    if (!BaseClass) throw new Error(`Base class "${baseClassName}" not found in registry`);
    
    const supportedFeatures = BaseClass.supportedFeatures;
    if (!supportedFeatures) throw new Error(`${baseClassName} has no supportedFeatures`);
    
    // 2. Resolve all async fallback spawns in parallel
    const featureKeys = Object.keys(config.assignFeatures);
    const resolvedSpawns = new Map();
    
    await Promise.all(featureKeys.map(async (key) => {
        const optIn = supportedFeatures[key];
        if (!optIn) throw new Error(`Feature "${key}" not in ${baseClassName}.supportedFeatures`);
        
        let spawn = optIn.fallbackSpawn;
        if (spawn && isAsyncSpawn(spawn)) {
            spawn = await spawn();
        }
        resolvedSpawns.set(key, spawn);
    }));
    
    // 3. Create subclass
    const NewClass = class extends BaseClass {};
    // Copy supportedFeatures (or rely on inheritance)
    
    // 4. Build FeatureConfigsMap with resolved spawns + JSON config
    const featuresMap = {};
    for (const [key, jsonConfig] of Object.entries(config.assignFeatures)) {
        featuresMap[key] = {
            spawn: resolvedSpawns.get(key),
            ...jsonConfig
        };
    }
    
    // 5. assignFeatures + define
    await assignFeatures(NewClass, featuresMap, reg.featuresRegistry);
    reg.define(tagName, NewClass);
    
    return NewClass;
}
```

### Questions

1. **Should the base class be looked up by tag name or class name?** The cede script uses `data-extends="el-maker"` which looks like a tag name. We'd need `customElements.get('el-maker')` to resolve it.

2. **Should `getSharedAccess` be supported in the JSON?** It's only useful for public properties. Private fields require the base class to define `getSharedContext`. I'd defer this to a future enhancement and document that the base class should handle shared context.

3. **Should this utility handle `onAssigned` sequencing?** Yes — since it calls `assignFeatures`, the sequential `onAssigned` behavior is inherited automatically.

4. **Should the resolved spawns be cached?** If multiple cede scripts extend the same base class, the fallback spawns would be resolved multiple times. A cache keyed by `BaseClass + featureKey` would help.

### Summary

| Aspect | Recommendation |
|--------|---------------|
| Function name | `defineWithFeatures` |
| Module | Separate `defineWithFeatures.ts` |
| Async | Yes (resolves fallback spawns) |
| Base class resolution | Via `customElements.get(tagName)` |
| `getSharedAccess` | Defer — base class handles `getSharedContext` |
| Spawn caching | Worth adding for repeated definitions |

Want me to implement this?

---

## Human Response I

```JavaScript
await defineFromCede('time-ticker', 'el-maker', {
```

good start, I like passing in the name of the custom element rather than the constructor as I suggested (my mistake).  But this signature is missing passing in the (scoped) customElementRegistry, which you actually added when you spelled out the implementation, so we are good there.

> Internally:

> 1. **Resolve the base class** — look up `'el-maker'` in the registry to get the constructor. Read its `static supportedFeatures`.

Yes, if customElementRegistry.get('el-maker') is null, do an await customElementRegistry.whenDefined('el-maker').

> The `getSharedAccess` question

That's a good catch, I should have proofread what I copied and pasted, that is definitely a wrinkle of complexity that needs a solid use case before doing anything about.  Let's definitely hold off on implementing any declarative getSharedAccess support.

> Naming

I think defineWithFeatures is the most descriptive name, I agree.

> Where should this live?

I agree separate module, defineWithFeatures.js
