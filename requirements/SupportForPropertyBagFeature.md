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

    //make the typescript fail if this isn't defined on a subclass.  Should we define it here?  Can we throw an error if isn't defined tht would be helpful to the developer?
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

