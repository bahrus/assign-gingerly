# Support for itemscope managers

A standard attribute, "itemscope" is supported by all browsers, and provides a kind of reflection capability for search engines.

Included in the assign-gingerly polyfill proposal is support for a specific way for adding managing capabilities for DOM elements that add the itemscope attribute.

In particular, object-extension.ts has this code:

```TypeScript
if (typeof CustomElementRegistry !== 'undefined') {
  Object.defineProperty(CustomElementRegistry.prototype, 'enhancementRegistry', {
    ...
  });
}
```

This requirement calls for another registry linked to the CustomElementRegistry, with a similar implementation:

```TypeScript
if (typeof CustomElementRegistry !== 'undefined') {
  Object.defineProperty(CustomElementRegistry.prototype, 'itemscopeRegistry', {
    get: function () {
      // Create a new BaseRegistry instance on first access and cache it
      const registry = new ItemscopeRegistry();
      // Replace the getter with the actual value
      Object.defineProperty(this, 'itemscopeRegistry', {
        value: registry,
        writable: true,
        enumerable: false,
        configurable: true,
      });
      return registry;
    },
    enumerable: false,
    configurable: true,
  });
}
```

I think the features that the corresponding ItemscopeManagerConfig would be quite minimal compared to EnhancementConfig:

```TypeScript
export type ItemscopeManager<T = any> = {
  new (el?: HTMLElement, initVals?: Partial<T>): T;
}

export interface ItemscopeManagerConfig {
    name: string,
    manager: ItemscopeManager,
    lifeCycleKeys:  {
        ... //more on this later
    }
}
```

So how does assign-gingerly use this?

The developer registers a manager in a customElementRegistry:

```TypeScript
oElement.customElementRegistry.itemscopeRegistry.push({
    name: 'my-manager',
    manager: class {
        constructor(oElement, initVals){

        }
    }
});

const myElement = document.createElement('div', {customElementRegistry, oElement.customElementRegistry});

oElement.assignGingerly({
    ish: {
        hello, 'a'
    }
})
```

So the implementation will need 

What assignGingerly will do:

1.  Checks if 