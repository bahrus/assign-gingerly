# Declarative Custom Element Definition with `defineWithFeatures`

`defineWithFeatures` enables declarative custom element definition from JSON-serializable configuration. It resolves async feature implementations, creates a subclass, wires up features, and registers the element — all from a simple config object.

## Use Case

A base "abstract" custom element declares support for many features (with async fallback spawns for lazy loading). Concrete elements are defined declaratively — picking which features to activate and providing per-element configuration — without writing any JavaScript class code.

This is designed to work with [mount-observer's cede scripts](https://github.com/bahrus/mount-observer#custom-element-definition-cede-scripts), but can be used standalone.

## API

```javascript
import { defineWithFeatures } from 'assign-gingerly/defineWithFeatures.js';

await defineWithFeatures(
    tagName,        // Custom element tag name to define (e.g., 'time-ticker')
    baseTagName,    // Tag name of the base class to extend (e.g., 'el-maker')
    config,         // JSON-serializable feature configuration
    registry?,      // Optional scoped CustomElementRegistry (defaults to global)
    options?        // Optional { onSubclassCreated(NewCtr) {} }
);
```

## Example

### The base class (defined once, shared by many elements)

```javascript
class ElMaker extends HTMLElement {
    propagator = new EventTarget();
    #internals;

    static supportedFeatures = {
        roundabout: {
            // Async fallback — only loaded when a derived element uses it
            fallbackSpawn: () => import('roundabout-lib/RoundaboutFeature.js')
                .then(m => m.RoundaboutFeature),
            callbackForwarding: ['connectedCallback'],
            getSharedContext(instance) {
                return { internals: instance.#internals, hostPropagator: instance.propagator };
            }
        },
        truthSourcer: {
            fallbackSpawn: () => import('truth-sourcer/TruthSourcer.js')
                .then(m => m.TruthSourcer),
            callbackForwarding: ['connectedCallback', 'attributeChangedCallback']
        },
        faceUp: {
            fallbackSpawn: () => import('face-up/FaceUp.js').then(m => m.FaceUp),
            callbackForwarding: ['connectedCallback', 'disconnectedCallback']
        }
    };

    constructor() {
        super();
        this.#internals = this.attachInternals();
    }
}

customElements.define('el-maker', ElMaker);
```

### Declarative definition (from a cede script or JS)

```javascript
await defineWithFeatures('time-ticker', 'el-maker', {
    assignFeatures: {
        roundabout: {
            customData: { template: myTemplate, bindings: myBindings },
            withAttrs: { base: 'ra', mode: '${base}-mode' },
            callbackForwarding: ['connectedCallback']
        },
        truthSourcer: {
            callbackForwarding: ['connectedCallback', 'attributeChangedCallback']
        }
    }
});

// 'time-ticker' is now a fully defined custom element
// with roundabout and truthSourcer features activated
```

### From a cede script in HTML

```html
<time-ticker>
    <script type="cede" data-extends="el-maker">{
        "assignFeatures": {
            "roundabout": {
                "customData": {...},
                "withAttrs": {...},
                "callbackForwarding": ["connectedCallback"]
            },
            "truthSourcer": {
                "callbackForwarding": ["connectedCallback", "attributeChangedCallback"]
            }
        }
    }</script>
</time-ticker>
```

mount-observer parses this script tag and calls `defineWithFeatures('time-ticker', 'el-maker', parsedJSON)`.

## How It Works

1. **Waits for the base class** — if `'el-maker'` isn't defined yet, awaits `customElements.whenDefined('el-maker')`.

2. **Resolves async fallback spawns** — for each feature key in the config, resolves the base class's `fallbackSpawn` (if async). All spawns are resolved in parallel. Results are cached per base class so repeated definitions don't re-import.

3. **Creates a subclass** — dynamically extends the base class. Inherits `supportedFeatures`, `getSharedContext`, etc.

4. **Calls `assignFeatures`** — passes the resolved spawns + the JSON config. Sequential `onAssigned` runs, inter-feature communication works.

5. **Defines the element** — registers in the provided (or global) registry.

## Spawn Caching

Resolved fallback spawns are cached per base class. If you define 10 elements extending `'el-maker'`, the async imports for each feature only happen once:

```javascript
// First call — imports roundabout, truthSourcer, faceUp
await defineWithFeatures('element-a', 'el-maker', configA);

// Second call — uses cached spawns (no re-import)
await defineWithFeatures('element-b', 'el-maker', configB);
```

## Scoped Registry Support

Pass a scoped registry as the fourth argument:

```javascript
const scopedRegistry = new CustomElementRegistry();
await defineWithFeatures('my-ticker', 'el-maker', config, scopedRegistry);
```

## Options: `onSubclassCreated` callback

The fifth parameter accepts an options object with an `onSubclassCreated` callback. This fires after the subclass is created but before `registry.define()` — the right moment to set static properties that the element's constructor or `connectedCallback` might need during synchronous upgrade:

```javascript
await defineWithFeatures('time-ticker', 'el-maker', config, registry, {
    onSubclassCreated(NewCtr) {
        // Set static properties before any instances are created
        NewCtr.seedRef = new WeakRef(scriptEl);
    }
});
```

**Why this matters:** When `registry.define(tagName, NewCtr)` is called, the browser synchronously upgrades any existing elements of that tag in the DOM. If the class's `connectedCallback` reads a static property (like `this.constructor.seedRef`), it must already be set. The callback guarantees this timing.

## What's NOT in the JSON config

- **`spawn`** — always comes from the base class's `fallbackSpawn` (resolved automatically).
- **`getSharedContext`** — defined on the base class (has access to `#private` fields).
- **`validateShape`** — defined on the base class.
- **`onAssigned`** — defined on the spawn class itself.

The JSON config only contains deployment-time settings: `customData`, `withAttrs`, `callbackForwarding`.
