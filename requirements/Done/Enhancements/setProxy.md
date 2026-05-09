# set proxy

Recall that in Requirement6, we added:

```TypeScript
declare global {
  interface CustomElementRegistry {
    "enhancementRegistry": typeof BaseRegistry | BaseRegistry;
  }
}
```

Note first the addition of property enhKey to IBaseRegistryItem

But BaseRegistry only has findBySymbol(). We need to add:

findByEnhKey(enhKey: string | symbol): IBaseRegistryItem | undefined;

The basic thing we want to do is that if a registry item is in the customElementRegistry for an element, then doing:

```JavaScript
oElement.set.myEnh.myEnhProp = 'hello'
```

does the following:

Checks if there's a registry item in oElement.customElementRegistry.enhancementRegistry which has enhKey === 'myEnh'.

If so,

     checks if oElement.myEnh already exists as an instance of class constructor.

```JavaScript
if (oElement[enhKey] && oElement[enhKey] instanceof SpawnClass) {
  // Already exists, just use it
} else {
  // Need to spawn
}
```

     If not, spawns an instance of the class constructor, passing in oElement as the first argument, and the spawnContext.  If oElement.myEnh is set to some object that isn't an instance of the class constructor,
     it is passed as the third argument into the class constructor (initVals).  oElement.myEnh is set to the spawned instance.

     After the previous paragraph is done if needed, set oElement.myEnh.myEnhProp to 'hello'. 

If not, if there is no registry item with enhKey === 'myEnh', then:

    Do checks if oElement.myEnh is undefined. If it is undefined, set oElement.myEnh = {};

    Sets oElement.myEnh.myEnhProp to 'hello'.

To accomplish this:

oElement.set → returns a proxy (first level)
oElement.set.myEnh → proxy's get trap returns  the actual enhancement object (second level) if a spawn class is found with enhKey === 'myEnh' and if not just sets oElement.myEnh = {} and returns eElement.myEnh.
oElement.set.myEnh.myEnhProp = 'hello' → sets the property on the enhancement

The code sample below is "approximate" and probably contains some errors and is purposely vague in some cases.





```JavaScript
//weak map between elements and the "set" proxy
const wm = new WeakMap();
Object.defineProperty(Element.prototype, 'set', {
    get() {
        
        if(!wm.has(this)){
            const self = this;
            const proxy = new Proxy(self, {
                get(obj: any, prop: EnhKey){
                    //do the spawning if found in registry or set oElement[enhKey] = {}
                    const ctx: SpawnContext = { config: registryItem };
                }
            })
            wm.set(this, proxy);
        }
        return wm.get(this);
    },
    enumerable: true,
    configurable: true,
});
```