# Support Features In Enhancement And Itemscope Management Registration

---

## Human Ask

Feel free to push back on this request if I'm missing something.

When we introduced features for custom elements, we didn't want to do any deep surgery by allowing the developer to associate features with the custom element during the define, thus we introduced a separate call, which is quite universal in how it can be applied.

However, I think it would be convenient to allow features to be defined when registering enhancements and itemscope managers:

```Typescript
const enhRegistry = myElement.customElementRegistry.enhancementRegistry;

enhRegistry.push({
  spawn: MyEnhancement,
  enhKey: 'myEnh'  // Key identifier for this enhancement, 
  features: ...
});

// Access the global registry
const ISMRegistry = customElements.itemscopeRegistry;

// Define a manager
ISMRegistry.define('manager-name', {
  manager: ManagerClass,
  lifecycleKeys: {
    dispose: 'cleanup',
    resolved: 'isReady'
  },
  features: ....
});
```

