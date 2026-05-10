# Support for Property Forwarding

---

## Human Ask

The document requirements/Done/CustomElementFeatures/SupportForCustomElementDependencyInjection.md spells out a kind of nuisance need that I think we should address, before considering the implementation of custom element features complete -- property forarding.

Those ideas contained in that document were proposed before formalizing this library of assign-gingerly, that has support for things like aka, etc.

I just wanted to get your take on how you would go about solving this problem, starting with 1.  is the problem worth solving, or should it be deferred?  2.  If so, how would you solve it?


---

## Kiro's Comments

### 1. Is the problem worth solving?

**Yes, but it's a "nice to have" rather than a blocker.** Here's why:

The problem: a custom element wants to expose properties at the top level (e.g., `el.command`, `el.commandForElement`) that are actually implemented by a feature class nested inside. Without forwarding, the developer writes boilerplate getter/setter pairs that just delegate:

```javascript
get command() { return this.commandFeature.command; }
set command(v) { this.commandFeature.command = v; }
```

This is tedious when there are many properties, but it's not *broken* — it works today. The question is whether the boilerplate reduction justifies the API complexity.

**Arguments for solving it now:**
- It completes the "features as a mixin alternative" story. Without forwarding, features still require boilerplate that mixins don't.
- The original proposal explicitly calls this out as a key benefit ("the top level custom element has fully, 100% delegated implementation").
- It makes the `ElementInternals` type emulation use case (the `CustomButton` example) genuinely clean.

**Arguments for deferring:**
- The feature system already works without it. Developers can write the forwarding manually.
- It adds complexity to the prototype manipulation (more `Object.defineProperty` calls).
- The interaction with async spawn needs thought (what happens if you access a forwarded property before the feature is ready?).

**My take:** Worth solving, but as a separate phase after the current feature set stabilizes. It's additive — nothing breaks by adding it later.

### 2. How I'd solve it

#### The API shape

Add a `forwardProps` (or `passThrough`) field to `FeatureConfig`:

```javascript
customElements.assignFeatures(CustomButton, {
    commandBehavior: {
        spawn: CommandFeatureImpl,
        forwardProps: ['command', 'commandForElement']
    }
});
```

This tells `assignFeatures` to install getter/setter pairs on `CustomButton.prototype` for each listed property name. The getter reads from the feature instance; the setter writes to it.

#### What gets installed on the prototype

For each property in `forwardProps`:

```javascript
Object.defineProperty(CustomButton.prototype, 'command', {
    get() {
        // Access the feature (triggers lazy spawn if needed)
        const feature = this.commandBehavior;
        return feature?.command;
    },
    set(value) {
        const feature = this.commandBehavior;
        if (feature) {
            feature.command = value;
        }
    },
    enumerable: true,
    configurable: true  // configurable so it doesn't conflict with future overrides
});
```

The key insight: the forwarded getter accesses `this[featureKey]` which triggers the feature's lazy getter. So forwarded properties automatically trigger feature instantiation on first access — same as accessing the feature directly.

#### Interaction with async spawn

If the feature uses an async spawner, `this[featureKey]` returns the placeholder object. The forwarded getter would then read/write on the placeholder. When the real instance replaces the placeholder, the forwarded getter naturally starts reading from the real instance (because it always goes through `this[featureKey]`).

This "just works" because the forwarded getter doesn't cache the feature reference — it reads it fresh each time via the feature getter.

#### Interaction with `aka`

Your original proposal used `?.behaviors?.command` paths. With the current system, features are flat (one level deep on the element). If you want nested features (`el.behaviors.command`), that's the "nested features" roadmap item. For now, forwarding would work with flat features:

```javascript
// Feature is at el.commandBehavior
// Forwarded props appear at el.command, el.commandForElement
// They delegate to el.commandBehavior.command, el.commandBehavior.commandForElement
```

#### Naming: `forwardProps` vs `passThrough`

The original proposal used `passThrough`. I slightly prefer `forwardProps` because:
- "Pass through" implies the value passes *through* something (like middleware). 
- "Forward" clearly says "delegate to somewhere else."
- But either works. `passThrough` has precedent in your original proposal.

#### Validation

At `assignFeatures` time, we should check that the forwarded property names don't already exist on the prototype (same check we do for feature keys). If they do, throw.

#### Renaming support (optional, future)

Sometimes the top-level property name differs from the feature's property name:

```javascript
forwardProps: {
    'command': 'command',           // same name
    'commandTarget': 'commandForElement'  // different name at top level
}
```

This could be an object form (in addition to the array shorthand). But I'd defer this to keep the initial implementation simple — array of strings where the names match.

### Summary

| Aspect | Recommendation |
|--------|---------------|
| Worth solving? | Yes, but can be a separate phase |
| API | `forwardProps: string[]` on `FeatureConfig` |
| Mechanism | Getter/setter pairs on prototype that delegate to `this[featureKey][propName]` |
| Async compat | Works naturally (reads through feature getter each time) |
| Validation | Throw if forwarded prop already exists on prototype |
| Renaming | Defer (array-only for now) |


---

## Human Response I

I was thinking that since features can be defined on any class, not just a custom element class, this package starts out by providing a barebones "PropertyBag" feature class, like what was illustrated with the  "Eehaviors" or "RegistrationFeatures" in the WHATWG proposal.  It would:

1.  Have a property "customElementRegistry", and set it from the passed in element and/or parent PropertyBag feature class.
2.  Maybe provide some property forwarding API, so that the property forwarding isn't baked into the underlying feature api, but rather is a specific implementation of this PropertyBag feature.

Can you see if that idea has any legs?  It would kind of provide a reference implementation of a really basic feature, perhaps?


---

## Kiro's Response I

This idea has legs. Let me think through it:

### The concept: `PropertyBag` as a built-in feature class

A `PropertyBag` is a feature whose job is to be a namespace container for other features (or just properties). It:

1. Carries `customElementRegistry` from the host element (so nested features can resolve their own registries).
2. Optionally provides property forwarding from the host element down to its own properties.

This is essentially the `Behaviors` or `RegistrationFeatures` class from the WHATWG proposal — but provided by the library as a reusable building block.

### What it would look like

```javascript
import { PropertyBag } from 'assign-gingerly/assignFeatures.js';

class ClubMember extends HTMLElement {
    static supportedFeatures = {
        behaviors: {
            fallbackSpawn: PropertyBag,
            // PropertyBag-specific config:
            forwardProps: {
                'command': 'commandBehavior.command',
                'commandForElement': 'commandBehavior.commandForElement'
            }
        }
    }
}

// Then features can be assigned to the PropertyBag:
customElements.assignFeatures(PropertyBag, {
    commandBehavior: { spawn: CommandFeatureImpl },
    ariaBehavior: { spawn: AriaFeatureImpl }
});
```

Usage:
```javascript
const el = document.createElement('club-member');
el.behaviors.commandBehavior.command = 'toggle';
// Or via forwarding:
el.command = 'toggle'; // forwards to el.behaviors.commandBehavior.command
```

### Why this is better than baking forwarding into the core

1. **Separation of concerns** — the core `assignFeatures` stays focused on lazy instantiation and DI. Forwarding is a *feature of a feature*, not a feature of the framework.
2. **Composability** — `PropertyBag` is itself a feature, so it gets all the benefits (lazy spawn, `getSharedContext`, `withAttrs`, etc.).
3. **Nestability** — `PropertyBag` can contain other `PropertyBag` instances, enabling the hierarchical grouping from the WHATWG proposal.
4. **Reference implementation** — shows developers how to build their own feature classes, and demonstrates that the system is powerful enough to build higher-level abstractions on top.

### What `PropertyBag` would need

```javascript
class PropertyBag {
    constructor(hostElement, ctx, initVals) {
        // 1. Carry the registry reference
        this.customElementRegistry = hostElement.customElementRegistry || customElements;
        
        // 2. Apply any initVals
        if (initVals) Object.assign(this, initVals);
    }

    // PropertyBag itself declares supportedFeatures so nested features can be assigned to it
    static supportedFeatures = {};  // dynamically populated? or open-ended?
}
```

### The challenge: dynamic `supportedFeatures`

The current system requires `static supportedFeatures` to be declared upfront. A generic `PropertyBag` doesn't know what features will be assigned to it. Options:

**(A) Open-ended PropertyBag** — skip the `supportedFeatures` validation for `PropertyBag` (or have it accept any key). This weakens the opt-in safety but makes it flexible.

**(B) Subclass per use case** — developers extend `PropertyBag` with their specific features:

```javascript
class ClubMemberBehaviors extends PropertyBag {
    static supportedFeatures = {
        commandBehavior: { fallbackSpawn: CommandFeatureImpl },
        ariaBehavior: { fallbackSpawn: AriaFeatureImpl }
    }
}
```

This preserves type safety and the opt-in pattern. The developer still declares what's allowed.

**(C) PropertyBag accepts a schema at construction** — the `customData` or a dedicated config field tells it what properties to accept.

I'd lean toward **(B)** — it's the most natural fit with the existing system. `PropertyBag` is a base class you extend, not a magic container.

### Where does forwarding live?

If forwarding is a `PropertyBag` concern (not a core concern), it could be:

- A static method on `PropertyBag` that installs forwarding getters on the host prototype.
- Or a helper function: `installForwarding(HostClass, featureKey, propMappings)`.

```javascript
import { PropertyBag, installForwarding } from 'assign-gingerly/assignFeatures.js';

class ClubMemberBehaviors extends PropertyBag {
    static supportedFeatures = {
        commandBehavior: { fallbackSpawn: CommandFeatureImpl }
    }
}

class ClubMember extends HTMLElement {
    static supportedFeatures = {
        behaviors: { fallbackSpawn: ClubMemberBehaviors }
    }
}

customElements.assignFeatures(ClubMember, { behaviors: { spawn: ClubMemberBehaviors } });
customElements.assignFeatures(ClubMemberBehaviors, { commandBehavior: { spawn: CommandFeatureImpl } });

// Install forwarding separately:
installForwarding(ClubMember, {
    'command': 'behaviors.commandBehavior.command',
    'commandForElement': 'behaviors.commandBehavior.commandForElement'
});
```

### My take

This is a solid direction. It keeps the core lean and pushes forwarding into userland (or a provided utility). The `PropertyBag` base class is small, useful as a reference implementation, and demonstrates the nested features pattern without requiring the core to support `?.path?.notation` keys natively.

I'd suggest:
1. Implement `PropertyBag` as a simple exported class (carries `customElementRegistry`, applies `initVals`).
2. Implement `installForwarding` as a standalone utility that installs getter/setter pairs using dot-path resolution.
3. Defer until the core features are fully stabilized and tested — this is additive.

Want me to move this to a requirements doc and implement, or keep it as a thought experiment for now?
