# Support for canSpan

I think it would be useful for an enhancement author to be able to block spawned classes (for example, if the element is of a type they can't support).

Remember that spawning of augmenting class instances isn't only supported for elements, but any object type (the registry isn't limited to custom element registries).

So I'm thinking the developer should be able to do:

```TypeScript
class MyEnhancement {
    static canSpawn(obj: any, ctx){
        if(...){
            return true;
        }
        return false;
    }
}
```

I'm not sure how to represent ths feature in the types.d.ts, but that would be quite useful to support.

This check would be applied regardless of how the spawning happens -- programmatically via *.enh.get(...) or via the dependency injection.

