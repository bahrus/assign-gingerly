# How to support a roundabout custom element feature

---

## Human ask

So far, I've defined two custom element features in separate packages, and am happy with how it's going.  One to manage attributes / properties binding.  Another to manage css state reflection.

Now there's a third custom element feature I'd like to support, but it runs into a snag.

Without using a feature, setting up the roundabout functionality looks as follows:

```JavaScript
class UserCounterSync extends HTMLElement {
                
    // Synchronous connectedCallback - no async needed!
    connectedCallback() {
        const [vm, propagator] = roundaboutSync({
            vm: this,
            ...raConfig,
        });

        this.status = 'low';
        this.statusMessage = '';
        this.renderCount = 0;
        this.template = template;

        const attrVals = parseWithAttrs(this, raConfig.customData.withAttrs, true);
        assignGingerly(this, attrVals);

        this._vm = vm;
        this._propagator = propagator;
    }
    ...
}

// One-time async setup: pre-loads modules, installs prototype getter/setters
await makeRoundaboutReady(UserCounterSync, raConfig);

// Now define the element - connectedCallback will be synchronous!
customElements.define('user-counter-sync', UserCounterSync);
```

So when I switch this to a feature, the feature needs a callback when the feature is linked up with the target class.

I'm thinking the feature class could define a static method where it can execute the code.

How would you suggest the API looks like?

