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
