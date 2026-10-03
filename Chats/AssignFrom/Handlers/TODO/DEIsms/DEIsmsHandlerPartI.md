# DOM Element Isms Handler Part I - Initial Instantiation

## Bruce

I'm not set on the name for this, so very open to suggestions.

## Use Case

The typical use case is a JSON object is retrieved from an API, and we want to 

1.  Map the JSON object to a DOM tree the first time
2.  Update the DOM with a retrieval of new JSON

This can be handled by a specific rendering technology like template literals.  That is not what this handler focuses on.  Instead, the assumption is that we will want each (or at least some) nodes to be managed by an itemscope manager class.  The class itself my very well use template literals.  

From the point of view of this handler, we assume there is a registered itemscope manager, tied to the name of the property.

## Simple example

```html
<details id=api-response>
    <summary>API Response</summary>
</details>
```

```TS
const vm = {
    image:{
        url: 'https:...',
        description: 'Lunar Surface'
    }
}

class ImageHandler {
    static instantiate(image: Image, ctx: TBD){
        const img = document.createElement('img');
        const {url, description} = image;
        img.src = url;
        img.alt = description;
        return img;
    }
}

customElements.itemscopeRegistry.define('image', {
    manager: ImageHandler
});

await assignFrom(document.getElementById('api-response'), {
    '?. =>': {
        do: 'builtIns.DEIsms',
    }
}, {
    from: vm
})
```

This would result in:

```html
<details id=api-response>
    <summary>API Response</summary>
</details>
```

Sketch of what this does:

1.  Iterates through all the top level keys of vm (by default).
2.  Checks if a matching Itemscope is found matching the key.  If none found, ignores it.
3.  Checks if (in this case) the details already has an element with itemscope=image.  If so, skip for now (phase II).
4.  Checks if class has a static method instantiate.  If not skips

Some assumptions:

By default, use the customElementRegistry of the first argument (I think we call that the "target").

## Future Phase

Support pulling from a section of the vm.
Support updates.

Let me know what clarifications are needed first before implementing, below.

---

## Feedback / Questions

### How it fits today

- The handler can be lazy-loaded like the others by adding `'builtIns.DEIsms': './handlers/DEIsms.js'` (or whatever name we pick) to `BUILT_IN_MAP` in `processHandlerCommands.ts`. With `'?. =>'` and no `get`/`resolve`, it would read the VM straight from `options.from`, which `assign(lhsTarget, resolvedParams, options)` already receives.
- The registry lookup can reuse the pattern already in `assignGingerly.ts`, `getHost.ts` and `handleIshProperty.ts`: `target.customElementRegistry?.itemscopeRegistry ?? customElements.itemscopeRegistry`. That matches your "use the target's registry" assumption.
- One wrinkle: `ItemscopeManager` is currently typed as `new (element, initVals) => T`, and the class is constructed later by the `ish` setter in `handleIshProperty.ts`. This proposal adds an optional **static** `instantiate` on that same class. That works fine, but it means the class has two jobs: a factory (static) and a per-element manager (instance). Questions 3 and 4 below come from that.

### Questions

1. **Expected output.** The "would result in" HTML is the same as the input. I assume you meant:
   ```html
   <details id=api-response>
       <summary>API Response</summary>
       <img itemscope=image src="https:..." alt="Lunar Surface">
   </details>
   ```
   Is that right? In particular, should the handler **add `itemscope=image`** to the returned element if `instantiate` didn't? Step 3 (skip if one already exists) only works on a second call if that attribute is present, so I'd suggest the handler always sets it.

2. **Also add `itemprop=image`?** The key is the property name in the VM, so microdata-wise `itemprop` is arguably the more accurate attribute, and `itemscope` is the manager name. They happen to be the same here. Should we:
   - (a) set only `itemscope=<key>` (simplest, matches what you wrote), or
   - (b) set both `itemprop=<key>` and `itemscope=<key>`, so Phase II can match on `itemprop` and leave room for a later key→manager mapping that differs?

   I lean toward (b).

3. **Should the `ish` manager also be instantiated?** Once the `<img itemscope=image>` exists, should the handler also set `img.ish = image` so `new ImageHandler(img, image)` runs through the existing `ish` path? That would give a natural Phase II update path (`img.ish = newImage`, which `assignGingerly`s into the manager). Or is Phase I strictly "call static `instantiate`, insert the result, done"?

4. **The `instantiate` contract:**
   - May it be **async** (return a Promise)? I'd `await` it either way.
   - May it return a `DocumentFragment` or multiple nodes, or only a single `Element`? If it returns a fragment, where does `itemscope` go, given question 1?
   - What should `ctx` contain? My proposal: `{ target, key, from, options, registry }`. Anything else?
   - If it returns `null`/`undefined`, skip silently?

5. **Where to insert.** Should it use `appendChild` on the target, which puts it after `<summary>` here? Should we support `method: 'prepend' | 'after'` the way `lazyLoad` does, or leave that for later?

6. **"Already has an element" scope.** Should that check cover **direct children only** (`:scope > [itemscope=image]`) or any descendant? I'd go with direct children, so nested scopes further down the tree don't block a top-level one.

7. **Which values qualify.** The example value is an object. What should happen for:
   - primitives (`title: 'foo'` with a registered `title` manager): pass them through, or skip?
   - `null`/`undefined`: skip, I assume.
   - arrays: call `instantiate` once per item, or skip until a later phase (this overlaps with `manageTemplateList`)?

8. **Unregistered keys.** You said "ignores it". The existing `ish` path *waits* for registration (`waitForEvent`). I assume ignoring is the intent, so lazily registered managers would be missed if they weren't defined at call time. Is that acceptable for Phase I? An opt-in `await: true` that uses `registry.whenDefined` could come later.

9. **Key order.** Insert in `Object.keys(vm)` order? That seems the obvious choice; I'm just confirming.

### Naming suggestions

"DEIsms" reads as DOM Element + `ish`. A few alternatives that say what it does:

| Name | Rationale |
|------|-----------|
| `builtIns.instantiateScopes` | Says exactly what Phase I does; keeps "instantiate" from the static method |
| `builtIns.scaffold` | Builds the DOM skeleton from the data shape |
| `builtIns.mountScopes` | "Mount" is familiar, and fits Phase II updates too |
| `builtIns.itemscopeTree` | Ties it to the itemscope registry |
| `builtIns.populate` | Short, and pairs naturally with later updates |

My preference is **`builtIns.mountScopes`**, because it still fits once updates are supported. `instantiateScopes` would only describe Phase I.

Once the questions above are settled I'll implement `handlers/<name>.ts`, add the `BUILT_IN_MAP` entry, a config type in `types/assign-gingerly/types.d.ts`, an emoji alias in `DX/emojis.ts` if you want one, and a Playwright test.


## Bruce's Response

> 1. **Expected output.**

Yes, good inferring, expected output:

```html
<details id=api-response>
    <summary>API Response</summary>
    <img itemscope=image src="https:..." alt="Lunar Surface">
</details>
```

> 2. **Also add `itemprop=image`?** 

This is an excellent question.

I'm inclined to answer this way:  If the matching element that ?. points to (details in this case) has an itemscope attribute, then yes, add the itemprop attribute.

I wonder if, bar the mapping configuration that you allude to, we should adopt a default name, so that rather than searching the registry for image, it should search for "ImageISM", so tht the developer would by default be expected to do:

```JS
customElements.itemscopeRegistry.define('ImageISM', {
    manager: ImageHandler
});
```

What do you think?

> 3. **Should the `ish` manager also be instantiated?**

Yes, good point, I think it's not too much of a stretch to include that with Phase I.

> 4. **The `instantiate` contract:**
>   - May it be **async** (return a Promise)? I'd `await` it either way.

Because of the performance issues we faced with the ManageTemplateList handler, that forced us to provide [first class support for synch processing with assignFrom](/Chats/AssignFrom/ImplementTheSynchronousAssignFrom.md), I think we should default to synchronous until we face a slam dunk case where async support is needed (later phase perhaps).

> - May it return a `DocumentFragment` or multiple nodes, or only a single `Element`? If it returns a fragment, where does `itemscope` go, given question 1?

Let's go with a single node for Phase I, with some planning thoughts where applicable to support multiple in the future.  Maybe put it into an array with a single element, so that it would be easy to add in the future.  Only the first element should get the itemscope attribute.  We would probably want to use the itemref attribute should we decide to really support multiple nodes.

>    - What should `ctx` contain? My proposal: `{ target, key, from, options, registry }`. Anything else?

Let's go with that.

- If it returns `null`/`undefined`, skip silently?

Yes, if not an instance of HTMLElement, skip silently.

> 5. **Where to insert.** Should it use `appendChild` on the target, which puts it after `<summary>` here? Should we support `method: 'prepend' | 'after'` the way `lazyLoad` does, or leave that for later?

appendChild only for now.

> 6. **"Already has an element" scope.** Should that check cover **direct children only** (`:scope > [itemscope=image]`) or any descendant? 

Agreed, children only.

7. **Which values qualify.** The example value is an object. What should happen for:

Only for NonArray Objects for Phase I.  Skip others.

>  8. **Unregistered keys.** You said "ignores it". 

Skip it.  No waiting.

> 9. **Key order.** Insert in `Object.keys(vm)` order? That seems the obvious choice; I'm just confirming.

Agreed.

Naming.  I like the `builtIns.itemscopeTree` the most.  Subject to change, but I'm 90% happy with that suggestion.
