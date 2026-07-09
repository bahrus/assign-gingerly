#  Support for  property bag feature

---

## Human Ask

So let's now provide support for the property bag feature.  The benefits of this feature probably falls mostly along the lines of "this is how to do nested features properly, let us help guide you to the right way", which isn't at all obvious.  The actual implementation seems  fairly minimal.  I think the documentation in README.md, showing how this integrates with the just implemented installForwarding and propLinks support would be very helpful, and it would carry a little more weight if we officially endorsed a base class to work with.

So as discussed in thoughtExperiments/SupportForPropertyForwarding.md:

```javascript
// class to be subclassed
class PropertyBag {
    constructor(hostElement, ctx, initVals) {
        // 1. Carry the registry reference
        this.customElementRegistry = hostElement.customElementRegistry || customElements;
        
        // 2. Apply any initVals
        if (initVals) Object.assign(this, initVals);
    }

    //make the typescript fail if this isn't defined on a subclass, or if someone tries to register PropertyBag without subclassing it.  Should we define it here?  Can we throw an error if isn't defined tht would be helpful to the developer?
    static supportedFeatures = {};  // dynamically populated? or open-ended?
}
```

```javascript
class ClubMemberBehaviors extends PropertyBag {
    static supportedFeatures = {
        commandBehavior: { fallbackSpawn: CommandFeatureImpl },
        ariaBehavior: { fallbackSpawn: AriaFeatureImpl }
    }
}

customElements.assignFeatures(ClubMember, { behaviors: { spawn: ClubMemberBehaviors } });
customElements.assignFeatures(ClubMemberBehaviors, { commandBehavior: { spawn: CommandFeatureImpl } });
```



---

## Kiro's Comments

This is clean and minimal. A few thoughts:

### On `static supportedFeatures = {}` in the base class

Defining it as an empty object on `PropertyBag` itself is fine — it means `PropertyBag` can technically be used directly (it just won't have any features). But you asked about making TypeScript fail if someone doesn't subclass or doesn't define `supportedFeatures`.

**What we can do:**

1. **Runtime check in the constructor** — if `this.constructor === PropertyBag`, throw:

```javascript
class PropertyBag {
    constructor(hostElement, ctx, initVals) {
        if (this.constructor === PropertyBag) {
            throw new Error('PropertyBag must be subclassed — define static supportedFeatures on your subclass');
        }
        this.customElementRegistry = hostElement.customElementRegistry || customElements;
        if (initVals) Object.assign(this, initVals);
    }
    
    // Not defined here — forces subclasses to provide their own
}
```

2. **Don't define `supportedFeatures` on the base class** — then `assignFeatures` will throw its existing "does not define static supportedFeatures" error if someone tries to register features on `PropertyBag` directly. This is already built-in validation with a helpful message.

**My recommendation:** Don't define `static supportedFeatures` on `PropertyBag` at all. Leave it off. This way:
- Subclasses *must* define it (or `assignFeatures` throws).
- TypeScript won't complain about the missing property on the base class (it's just not there).
- The existing `assignFeatures` validation gives a clear error message.

Optionally add the `this.constructor === PropertyBag` guard in the constructor for an even earlier, clearer error if someone tries to instantiate it directly.

### On `customElements.assignFeatures(ClubMemberBehaviors, ...)`

This is the key insight — `PropertyBag` subclasses are themselves feature hosts. They carry `customElementRegistry` so the feature getter can resolve the registry. The two-level registration:

```javascript
customElements.assignFeatures(ClubMember, { behaviors: { spawn: ClubMemberBehaviors } });
customElements.assignFeatures(ClubMemberBehaviors, { commandBehavior: { spawn: CommandFeatureImpl } });
```

...works because `ClubMemberBehaviors` has `static supportedFeatures` and its instances have `customElementRegistry`. The feature getter on `ClubMemberBehaviors.prototype` resolves via `this.customElementRegistry.featuresRegistry` — which is the same registry the host element uses.

### Full example with `installForwarding`

```javascript
import { PropertyBag } from 'assign-gingerly/assignFeatures.js';
import { installForwarding } from 'assign-gingerly/installForwarding.js';

class ClubMemberBehaviors extends PropertyBag {
    static supportedFeatures = {
        commandBehavior: { fallbackSpawn: CommandFeatureImpl },
        ariaBehavior: { fallbackSpawn: AriaFeatureImpl }
    }
}

class ClubMember extends HTMLElement {
    static supportedFeatures = {
        behaviors: { fallbackSpawn: ClubMemberBehaviors }
    }
    static propLinks = {
        'command': '?.behaviors?.commandBehavior?.command',
        'commandForElement': '?.behaviors?.commandBehavior?.commandForElement'
    }
}

customElements.assignFeatures(ClubMember, { behaviors: { spawn: ClubMemberBehaviors } });
customElements.assignFeatures(ClubMemberBehaviors, {
    commandBehavior: { spawn: CommandFeatureImpl },
    ariaBehavior: { spawn: AriaFeatureImpl }
});
installForwarding(ClubMember);
customElements.define('club-member', ClubMember);

// Usage:
const el = document.createElement('club-member');
el.command = 'toggle';  // forwards to el.behaviors.commandBehavior.command
```

### Implementation plan

1. Create `PropertyBag` class in `assignFeatures.ts` (or a separate `propertyBag.ts` — your call).
2. Constructor: set `this.customElementRegistry`, apply `initVals`, guard against direct instantiation.
3. No `static supportedFeatures` on the base — subclasses must define it.
4. Export from `assignFeatures.js` (since it's tightly coupled to the features system).
5. Document in README with the full nested features + `installForwarding` example.

Shall I implement?
