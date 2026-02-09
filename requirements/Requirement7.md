# set proxy

Recall that in Requirement6, we added:

```TypeScript
declare global {
  interface CustomElementRegistry {
    "assignGingerlyRegistry": typeof BaseRegistry | BaseRegistry;
  }
}
```

Note first the addition of property enhKey to IBaseRegistryItem

The basic thing we want to do is that if a registry item is in the customElementRegistry for an element, then doing:

```JavaScript
oElement.set.myEnh.myEnhProp = 'hello'
```

does the following:

Checks if there's a registry item in oElement.customElementRegistry.assignGingerlyRegistry which has enhKey === 'myEnh'.

If so,

     checks if oElement.myEnh already exists as an instance of class constructor.

     If not, spawns an instance of the class constructor, passing in oElement as the first argument, and the spawnContext.  If oElement.myEnh is set to some object that isn't an instance of the class constructor,
     it is passed as the third argument into the class constructor (initVals).  oElement.myEnh is set to the spawned instance.

     After the previous paragraph is done if needed, set oElement.myEnh.myEnhProp to 'hello'. 

If not, if there is no registry item with enhKey === 'myEnh', then:

    Do checks if oElement.myEnh is undefined. If it is undefined, set oElement.myEnh = {};

    Sets oElement.myEnh.myEnhProp to 'hello'.

To accomplish this:

The code sample below is "approximate" and probably contains some errors and is purposely vague in some cases.

In object-extension.ts add a "set" lazy property to the Element prototype, that is something like below

```JavaScript
const wm = new WeakMap();
Object.defineProperty(Element.prototype, 'set', {
    get() {
        
        if(!wm.has(this)){
            const self = this;
            const proxy = new Proxy(self, {
                get(obj: any, prop: EnhKey){
                    //do the spawning if found in registry or set oElement[enhKey] = {}
                }
            })
            wm.set(this, new BeEnhanced(this));
        }
        return wm.get(this);
    },
    enumerable: true,
    configurable: true,
});
```