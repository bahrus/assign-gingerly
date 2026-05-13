# Support for Callsbacks In Features

---

## Human ask

Based on the first two features created so far, it would be helpful to be able to configure the ability to propagate the callbacks to the features:

```javascript

customElements.assignFeatures(MyElement, {

    reflector: {

        spawn: Reflector,

        callBackForwarding: ['connectedCallback', 'disconnectedCallback', 'attributeChangedCallback']

    }

});

```

Each of these would be optional, but if defined, the expectation is that the spawned class has such methods, and if it doesn't, it should throw an error.  

This would require maintaining a lookup of some sort I guess, and monkey patching each of these three methods as needed and calling the full list of features that need these events forwarded.


---

## Kiro's Comments

### Honest assessment

This is a reasonable ask and I think it's worth implementing. It solves a real problem (features that need lifecycle awareness) without requiring the consumer to write boilerplate forwarding code in every callback.

However, I want to flag a few design considerations:

### 1. This subsumes `activateOn: 'connected'`

The earlier `activateOn: 'connected'` proposal was specifically about triggering the lazy getter on first connect. `callbackForwarding: ['connectedCallback']` is more general — it forwards *every* connect to the feature, not just the first. 

If we implement `callbackForwarding`, we probably don't need `activateOn` as a separate concept. The first `connectedCallback` forwarding naturally triggers the getter (spawning the feature), and subsequent ones call the feature's `connectedCallback`. Two birds, one stone.

**Recommendation:** Drop `activateOn` and just use `callbackForwarding`. Simpler API surface.

### 2. The monkey-patching approach

Yes, this requires patching the custom element's lifecycle callbacks. The pattern:

```javascript
// In assignFeatures, accumulate which features need which callbacks
// Then patch once per callback type:

const originalConnected = ctr.prototype.connectedCallback;
ctr.prototype.connectedCallback = function() {
    if (originalConnected) originalConnected.call(this);
    // Forward to all features that requested it
    for (const key of connectedFeatureKeys) {
        const feature = this[key]; // triggers lazy spawn if first time
        if (feature && typeof feature.connectedCallback === 'function') {
            feature.connectedCallback();
        }
    }
};
```

**Key details:**
- Patch once per callback type, not once per feature (accumulate keys)
- Call the original first, then forward to features (features see the element in its post-callback state)
- The getter access (`this[key]`) triggers lazy spawn on first connect — this handles the `activateOn` use case naturally
- For `attributeChangedCallback`, forward the same arguments (`name, oldValue, newValue`)

### 3. Validation

You said "if the spawned class doesn't have the method, throw an error." I'd suggest validating at `assignFeatures` time if the spawn is a synchronous constructor (we can check `spawn.prototype.connectedCallback`). For async spawners, we'd have to defer validation to first invocation.

Actually — for async spawners, the feature might not be spawned yet when `connectedCallback` fires. The getter access will return the placeholder `{}`. Should we:
- **(A)** Skip forwarding if the feature isn't spawned yet (silent no-op)?
- **(B)** Queue the callback and replay it after async spawn completes?
- **(C)** Always trigger the getter (which starts async resolution), then skip if placeholder?

I'd lean toward **(C)** — trigger the getter (starting async resolution if needed), then only call the callback if the stored value is a real instance (not a placeholder). The feature will get `connectedCallback` on subsequent reconnects once it's fully spawned. For the initial connect during async loading, the feature misses it — but that's acceptable since it wasn't ready anyway.

### 4. `attributeChangedCallback` is special

For `attributeChangedCallback` to work, the custom element also needs `static observedAttributes`. The feature can't add to that list after `define()` is called. So either:
- The custom element author includes the feature's attributes in their own `observedAttributes`
- Or we document that `attributeChangedCallback` forwarding only works for attributes the element already observes

This is a limitation worth documenting clearly.

### 5. Should `adoptedCallback` be supported too?

It's rare but exists. I'd include it in the allowed list for completeness, even if no one uses it initially.

### 6. Proposed type

```typescript
interface FeatureConfig {
    // ... existing fields ...
    
    /**
     * Custom element lifecycle callbacks to forward to this feature.
     * The feature class must implement the listed methods.
     * 
     * Supported: 'connectedCallback', 'disconnectedCallback', 
     *            'attributeChangedCallback', 'adoptedCallback'
     */
    callbackForwarding?: string[];
}
```

### Summary

| Aspect | Recommendation |
|--------|---------------|
| Worth implementing? | Yes — solves real boilerplate problem |
| Subsumes `activateOn`? | Yes — drop `activateOn`, use this instead |
| Patching strategy | Patch once per callback type, accumulate feature keys |
| Validation | Check `spawn.prototype` at registration time (sync only) |
| Async features | Trigger getter, skip if placeholder |
| `attributeChangedCallback` | Document limitation re: `observedAttributes` |
| `adoptedCallback` | Include for completeness |

Ready to implement when confirmed.
