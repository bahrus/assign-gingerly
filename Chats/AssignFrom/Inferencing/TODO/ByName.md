# Inferenced Assignment by Name

---

## Human Ask

Strictly speaking, using itemprop attributes on input elements doesn't appear to me to be conforming 100% to the microdata specs.  Am I wrong?  I very well could be.

Primarily for that reason, I think we should 

```ts
inferredAssignments: {
    byItemprop: ['user'],  // or true
    byName: ['firstName', 'lastName'], // or true
}
```

By default, I think there should not be any donut hole scoping.  

But there are scenarios (for example, itemscope managers) that might want to support donut hole scoping.  To do so:

```ts
inferredAssignments: {
    byItemprop: ['user'],  // or true
    byName: {
        props: ['firstName', 'lastName'], // or true?
        outside: 'fieldset'
    } 
}
```

I think this will require enhancing the ['@'] method in inferencer.

---

## AI Response

### On the microdata spec question

You're not wrong to be cautious. The microdata spec ([WHATWG HTML](https://html.spec.whatwg.org/multipage/microdata.html)) says `itemprop` defines "the property of an item." For form elements, the spec does define how to extract the "value" of an itemprop'd element — e.g., `<input itemprop="email">` yields `element.value`. So it's technically *conforming* to put `itemprop` on inputs. But it's semantically awkward — you're declaring "this input IS the email property" rather than "this input receives the email value." In practice, `name` is the established attribute for form element identity, and `itemprop` is for microdata semantics (structured data for search engines).

So yes — `byName` for form elements and `byItemprop` for display/microdata elements is the correct separation.

### Design assessment

**`byName: ['firstName', 'lastName']` (simple form)**

Clean. Queries `[name="${key}"]` within the target, uses the inferencer to determine the right property (`value`, `checked`, `selectedIndex`, etc.). No donut-hole scoping by default — just a flat querySelectorAll.

**`byName: { props: [...], outside: 'fieldset' }` (scoped form)**

Makes sense for complex forms where nested fieldsets group related controls. `outside: 'fieldset'` means "don't descend into fieldset boundaries that aren't ours" — same donut-hole concept as itemscope but with a different boundary element.

### The `['@']` method already does this

Looking at the inferencer code:

```ts
['@'](nameAttr: string, scopeBoundary?: string){
    const candidates = this.enhancedElement.querySelectorAll(`[name="${nameAttr}"]`);
    const filtered = scopeBoundary
        ? Array.from(candidates).filter(el => withScopePerimeter(this.enhancedElement, el, scopeBoundary))
        : Array.from(candidates);
    return filtered.map(x => new Infer(x, nameAttr));
}
```

This is exactly the API you need. The `scopeBoundary` parameter maps directly to `outside`:
- `byName: ['firstName']` → call `['@']('firstName')` (no boundary)
- `byName: { props: ['firstName'], outside: 'fieldset' }` → call `['@']('firstName', 'fieldset')`

So the inferencer doesn't need enhancement — the `['@']` method already supports optional scope boundaries. What's needed is the glue in `inferredAssignments.ts` / `processInferredAssignments` to:

1. Detect `byName` in the options
2. Normalize the config (array form vs object form)
3. Call `['@'](propName, scopeBoundary?)` for each prop
4. For each returned `Infer` instance, read `.valueProperty` and assign the source value

### Implementation scope

This is primarily a change in `inferredAssignments.ts` (the processing logic) — not the inferencer submodule. The inferencer's `['@']` method is already ready.

Estimated work:
- ~20-30 lines in `processInferredAssignments` to handle the `byName` option
- Type update in `types.d.ts` for the config shape
- No changes to the `inferencer/` submodule needed

### One question: `true` for byName?

For `byItemprop: true`, you enumerate all keys on the source object. For `byName: true`, what does "all" mean? All keys of `options.from`? That could be noisy for complex VMs. I'd suggest:
- `byName: true` → all own enumerable string keys of `from` (same behavior as `byItemprop: true`)
- But document that `byName: true` can be expensive for large source objects since it queries `[name="x"]` for every key

### Summary

| Aspect | Assessment |
|--------|-----------|
| Inferencer changes | None — `['@']` already supports name + scope boundary |
| Processing changes | ~20-30 lines in `inferredAssignments.ts` |
| Type changes | Add `byName` to `InferredAssignmentsConfig` in types.d.ts |
| Donut hole | `outside` maps directly to `scopeBoundary` param |
| Default scoping | None (flat querySelectorAll) — correct for forms |

---

## Human Response I

> One question: `true` for byName?

Let's go with your suggestion

Please implement and update the documentation.
