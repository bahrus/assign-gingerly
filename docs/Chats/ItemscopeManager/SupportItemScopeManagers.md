# Support for itemscope managers

## Problem statement

### Support for a view model DOM fragment manager tied to the itemscope attribute.

There are many scenarios where it makes sense to have one "central" element manager, that frameworks / libraries can expect, that manages the data and/or view model and/or binding and/or event handling for a DOM element and its children, plus extensions of that element that are linked to it via the itemref attribute:

1. Scenarios where we can't wrap the element inside a custom element.
2. Scenarios where we need to manage the light children of a web component that uses ShadowDOM
3. Scenarios where we want to manage a DOM fragment that was generated from a looping library api.

Unlike the other enhancements that this proposal supports, these element managers would not be enhancing the behavior of the element it provides, but rather focused squarely on binding and hydrating the light children of the element it adorns.

## Solution

A standard attribute, "itemscope" is supported by all browsers, and provides a kind of reflection capability for search engines.

Included in the assign-gingerly polyfill proposal is support for a specific way for adding managing capabilities for DOM elements that add the itemscope attribute.

This proposal is advocating enhancing the itemscope attribute, so that it can optionally specify the name of a registered class, instances of which frameworks could then easily pass values to, or invoke methods, or dispatch and listen for events to/from. These classes would need very little in terms of integration with the DOM API's, as their focus is meant to be on "business domain logic" -- no support for owned attributes is needed, for example. Nor specifying any restrictions of which types of elements that we are targeting. These classes would be so generic in manner that the element type is largely immaterial.


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

I think the features that the corresponding ItemscopeRegistry class and  ItemscopeManagerConfig would need to support should be quite minimal compared to EnhancementConfig:

```TypeScript

declare class ItemscopeRegistry extends EventTarget {
    #map = new Map<string, ItemscopeManagerConfig>();
    define(name: string, config: ItemscopeManagerConfig){
        if(this.#map.has(name)) throw 'Already registered';
        this.#map.set(name, config);
        this.dispatchEvent(new Event(name));
    }
    get(name: string){
        return this.#map.get(name);
    }
}

export type ItemscopeManager<T = any> = {
  new (el?: HTMLElement, initVals?: Partial<T>): T;
}

export interface ItemscopeManagerConfig {
    manager: ItemscopeManager,
    lifeCycleKeys:  {
        ... //more on this later
    }
}
```

So how does assign-gingerly use this?

The developer registers a manager in a customElementRegistry:

```TypeScript
oElement.customElementRegistry.itemscopeRegistry.define('my-manager', {
    manager: class {
        constructor(oElement, initVals){

        }
    }   
});
    

const myElement = document.createElement('div', {customElementRegistry, oElement.customElementRegistry});

myElement.assignGingerly({
    ish: {
        hello, 'a'
    }
})
```

ish stands for "itemscope host".

assignGingerly needs to be on the lookout for this special property applied to HTML Elements.


What assignGingerly will do when it encounters an ish property being assigned to an HTMLElement:

1.  Checks if the element has attribute itemscope set to a string value.  If not, throws an error.
2.  Creates an 'ish' property on that element instance if not already done:

This code is from a prior attempt at implementing this feature with slightly different specs:

```JavaScript
export { waitForEvent } from './waitForEvent.js';
import { ObsAttr } from './ObsAttr.js';
import { getIsh } from '../refid/getIsh.js';
import { arr } from '../refid/secretKeys.js';
export const attached = Symbol.for('xyyspnstnU+CDrNVa0VnxA');
export class Newish {
    queue = [];
    isResolved = false;
    #ce;
    #ref;
    #options;
    #args;
    constructor(enhancedElement, target, itemscope, options) {
        this.#args = [enhancedElement, target, itemscope];
        this.#options = options || { assigner: Object.assign };
        this.#ref = new WeakRef(enhancedElement);
    }
    async handleEvent() {
        const enhancedElement = this.#ref.deref();
        if (!enhancedElement)
            return;
        await this.#attachItemrefs(enhancedElement);
    }
    async do() {
        const [enhancedElement, target, itemscope] = this.#args;
        this.#args = undefined;
        if (enhancedElement[attached] === true)
            return;
        enhancedElement[attached] = true;
        const options = this.#options;
        const { initPropVals, ctr } = options;
        let ce;
        if (ctr === undefined) {
            const foundCtr = await getIsh(enhancedElement.isConnected ? enhancedElement : target, itemscope);
            const initPropVals = enhancedElement['ish'];
            const resolvedConstructor = foundCtr.constructor.name === 'AsyncFunction' ? await foundCtr() : foundCtr;
            const isInstance = initPropVals instanceof resolvedConstructor;
            ce = isInstance ? initPropVals : new resolvedConstructor();
            if (initPropVals !== undefined && !isInstance)
                this.queue.push(initPropVals);
        }
        else {
            ce = new ctr();
            if (initPropVals !== undefined)
                this.queue.push(initPropVals);
        }
        // if('tbd' in ce && typeof ce['tbd'] === 'function'){
        //     await ce['tbd'](ce, enhancedElement, this.#options);
        // }
        this.#ce = ce;
        const self = this;
        Object.defineProperty(enhancedElement, 'ish', {
            get() {
                return self.#ce;
            },
            set(nv) {
                if (self.#ce === nv)
                    return;
                self.queue.push(nv);
                self.#assignGingerly(false);
            },
            enumerable: true,
            configurable: true,
        });
        await this.#assignGingerly(true);
        if ('<mount>' in ce && typeof ce['<mount>'] === 'function') {
            await ce['<mount>'](ce, enhancedElement, this.#options);
        }
        //attach any itemref references
        await this.#attachItemrefs(enhancedElement);
        const et = ObsAttr(enhancedElement, 'itemref');
        et.addEventListener('attr-changed', this);
        this.isResolved = true;
        return ce;
    }
    #alreadyAttached = new WeakSet;
    async #attachItemrefs(enhancedElement) {
        //TODO:  watch for already attached itemrefs to be removed and remove them from the set
        // and call outOfScopeCallback on them
        if ('<inScope>' in this.#ce && enhancedElement.hasAttribute('itemref')) {
            await import('../refid/via.js');
            const itemref = enhancedElement.via.itemref;
            const refs = itemref.children;
            for (const ref of refs) {
                if (this.#alreadyAttached.has(ref))
                    continue;
                this.#ce['<inScope>'](this.#ce, ref, this.#options);
            }
            itemref.addEventListener('change', this);
        }
    }
    async #assignGingerly(fromDo) {
        const actions = new Set();
        if (fromDo) {
            actions.add('attached');
        }
        let ce = this.#ce;
        if (ce === undefined) {
            throw 500;
        }
        let foundArray = false;
        const hasArrFilter = 'arr=>' in ce && typeof ce['arr=>'] === 'function';
        const ref = this.#ref.deref();
        while (this.queue.length > 0) {
            const fi = this.queue.shift();
            //TODO: Provide support for a virtual slice of a very large list
            //TODO:  Maybe should check if iterable rather than an array?
            if (Array.isArray(fi)) {
                foundArray = true;
                let filtered = fi;
                if (hasArrFilter) {
                    filtered = await (ce['arr=>'])(ce, fi, ref, this.#options);
                }
                ce[arr] = filtered;
                actions.add('ishListAssigned');
            }
            else {
                let { assigner } = this.#options;
                if (assigner === undefined) {
                    assigner = Object.assign;
                }
                await assigner(ce, fi);
                actions.add('ishAssigned');
            }
        }
        if (fromDo && !foundArray && hasArrFilter) {
            const filtered = await (ce['arr=>'])(ce, undefined, ref, this.#options);
            if (filtered !== undefined) {
                ce[arr] = filtered;
                actions.add('ishListAssigned');
            }
        }
        if (ref) {
            ref.dispatchEvent(new IshEvent(Array.from(actions)));
        }
    }
}
export class IshEvent extends Event {
    actions;
    static eventName = 'ish';
    constructor(actions) {
        super(IshEvent.eventName);
        this.actions = actions;
    }
}

```


2.  If the typeof rhs !== 'object' throw an error
3.  Checks if that string value has been registered in the element's customElementRegistry.itemscopeManageRegistry.  
4.  If not:
    1. Does an assignGingerly into the "ish" property of the element, basically transferring the object in / merging with prior values.  
    2.  Uses './waitForEvent.js' to wait for the customElementRegistry to fire event with the name of the itemscope path.
    3.  Instantiates the class defined in ItemscopeManagerConfig

5.  If it is:  The setter of ish assigns gingerly the passed in object into the instanted class.

