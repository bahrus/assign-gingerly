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


---

## Kiro's Comments

### On structuring the config types

Agreed — the handler config should have a proper interface in `types.d.ts`. Something like:

```typescript
export interface LazyLoadConfig extends HandlerConfig {
    do: 'builtIns.lazyLoad';
    resolve: {
        /** Condition to show/hide */
        if: string;
        /** Template element to clone (resolved via protocol or path) */
        instantiate: string;
        /** Insert method: 'appendChild' (default) or 'prepend' */
        method?: string;
        /** If true, removes nodes when hiding instead of adding hidden attribute */
        forget?: boolean | string;
        /** Optional async callback to invoke after cloning, resolved from the VM */
        onInstantiated?: string;
    };
}
```

I'll add this to `types.d.ts`.

### On the post-clone callback

I think both mechanisms you describe are good and serve different use cases:

**1. `resolve.onInstantiated` — VM-defined callback (declarative, JSON-friendly)**

```javascript
resolve: {
    if: '?.isHappy',
    instantiate: 'globalThis://happyMood',
    onInstantiated: '?.myInstantiatedTemplateHandler'
}
```

After cloning, the handler resolves `onInstantiated` from the VM (it'll be a function reference), and calls it with a context object:

```javascript
async myInstantiatedTemplateHandler(ctx) {
    // ctx.clone - the cloned DocumentFragment (or the inserted nodes)
    // ctx.target - the lhsTarget element
    // ctx.config - the full handler config
}
```

**Pros:** Declarative, JSON-serializable (the path string is JSON-safe, the function lives on the VM). Works with cede scripts.
**Cons:** The VM must expose the callback as a property.

**2. Subclass override — `onCloneInserted` protected method**

```javascript
class MyLazyLoader extends LazyLoadHandler {
    async onCloneInserted(clone, lhsTarget, resolvedParams) {
        // Custom post-clone logic
    }
}
defineHandler('my-lazyLoad', MyLazyLoader);
```

**Pros:** Full OOP extensibility. Can do anything. No VM coupling.
**Cons:** Requires defining a new handler class and registering it with a different name.

### My recommendation: implement both

They're complementary:
1. Make `cloneAndInsert` async and have it call a protected `onCloneInserted` method (defaults to no-op). Subclasses override it.
2. After `onCloneInserted`, check if `resolvedParams.onInstantiated` is a function and call it with a context object.

This way the resolve-based callback works for the simple/declarative case, and subclassing works for the advanced case.

### Implementation sketch

```typescript
// In LazyLoadHandler:

async assign(lhsTarget, resolvedParams, options) {
    // ... existing show/hide logic ...
    // When showing and cloning:
    const insertedNodes = await this.cloneAndInsert(instantiate, startMarker, endMarker);
    
    // Call onInstantiated if provided (resolved from VM)
    if (resolvedParams.onInstantiated && typeof resolvedParams.onInstantiated === 'function') {
        await resolvedParams.onInstantiated({
            nodes: insertedNodes,
            target: lhsTarget,
            config: this.config
        });
    }
}

// Protected method for subclass override
protected async onCloneInserted(
    nodes: Node[], 
    lhsTarget: Element, 
    resolvedParams: Record<string, any>
): Promise<void> {
    // No-op by default. Subclasses override.
}

private async cloneAndInsert(templateEl, startMarker, endMarker): Promise<Node[]> {
    // ... clone logic ...
    const nodes = Array.from(content.childNodes);
    endMarker.parentNode.insertBefore(content, endMarker);
    
    // Call protected hook
    await this.onCloneInserted(nodes, startMarker.parentElement, {});
    
    return nodes;
}
```

### Shall I implement?

No blockers. I'll:
1. Add `LazyLoadConfig` interface to `types.d.ts`
2. Make `cloneAndInsert` async, add `onCloneInserted` hook
3. Add `onInstantiated` callback support in `resolve`
4. Export `LazyLoadHandler` class so it can be subclassed
5. Move the requirement when done
