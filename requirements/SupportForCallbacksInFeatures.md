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
