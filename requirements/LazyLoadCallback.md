# Lazy Load Callback

---

## Human Ask

Please move this to the folder [where I moved](Done/AssignFrom/Handlers/LazyLoad/SupportForLazyLoadConditionalDisplayP1.md) the lazy load requirement when done.

First, can the lazy load handler be structured a little more, especially the config, ideally in types/assign-gingerly folder (types.d.ts is fine, maybe?).

Second, can we add an optional asynch callback that gets called after cloning the template?  I'm thinking there are potentially two ways this could be done, perhaps in conjunction (one after the other if both defined).  One way would be resolving from the vn

```JavaScript
const myVM = {
    isHappy: false,
    async myInstantiatedTemplateHandler(ctx){

    }
}

assignFrom(myDomElement, {
    '?.querySelector?..mainView =>': {
        do: 'builtIns.lazyLoad',
        resolve:{
            if: '?.isHappy',
            instantiate: 'globalThis://happyMood',
            method: 'appendChild', //default
            forget: true,
        },

    }
}, {
    withMethods: ['querySelector'],
    from: myVM
});
```

The other one is that a class could extend LazyLoadHandler, and implement an override.  Maybe cloneAndInsert could be made async, and it could call a public overridable method around line 180? 