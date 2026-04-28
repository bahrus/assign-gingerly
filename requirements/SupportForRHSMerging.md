# Support For RHSMerging

## Human Ask

An important use case this proposal is aiming to solve is to merge the dynamic values of a view model, for example the properties of hosting custom element, into another element or object, purely declaratively.

As things currently stand, the rhs each key value assignment must be explicitly provided.  

```JavaScript
const JSONSerializableMergeInfo = {hello: 'Venus', foo: 'bar'};
const objToMergeInto = {hello: 'world'};
objToMergeInto.assignGingerly(JSONSerializableMergeInfo);
```

But suppose we are passed in an object that we want to merge in, that uses other field names, or properties that are deeply nested in:

```TypeScript
sourceObjToMergeIn = {
    myPropContainer: {
        stringProp: 'Venus'
    }
    myFooString: 'bar'
}
```

We basically need to throw away the idea of pushing as much logic in JSON and just make it pure JS:

```JavaScript
const MergeObject = {
    hello: sourceObjToMergeIn.myPropContainer.stringProp,
    foo: sourceObjectToMergeIn.myFooString,
} 
```

## Minimal Requirement:  Useful Primitive function

Suppose we define our JSON to look as follows:

```JavaScript
const JSONSerializableMergePattern = {
    hello: '?.sourceObjToMergeIn?.myPropContainer?.stingProp', 
    foo: '?.sourceObjectToMergeIn?.myFooString'
};
```

This JSON could carry us to the finish line if we define an exportable function, substituteRHS:

```JavaScript
//maybe the order of the parameters should be reversed?
//is there a better name than substituteRHS?
const JSONSerializableMergeInfo = substituteRHS(JSONSerializableMergePattern, sourceObjToMergeIn);
objToMergeInto.assignGingerly(JSONSerializableMergeInfo);
```

How many lines of code would this take to write?

If it is small enough, maybe it could be baked into assignGingerly:

```JavaScript
const objToMergeInto = {hello: 'world'};
objToMergeInto.assignGingerly(JSONSerializableMergePattern, {
    // maybe there's a better name than sourceObj
    sourceObj: sourceObjToMergeIn
});
```






---

## Agent Analysis

### Understanding the Requirement

The core need: when the RHS value is a `?.`-prefixed path string, resolve it against a source object instead of treating it as a literal value. This bridges the gap between fully declarative JSON configs and imperative JS property access.

### The `substituteRHS` Function

This is quite small. The function walks each key-value pair, and if the value is a `?.`-prefixed string, resolves it against the source object using the same `parsePath` logic we already have:

```typescript
export function substituteRHS(
  pattern: Record<string, any>,
  source: any
): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(pattern)) {
    if (typeof value === 'string' && value.startsWith('?.')) {
      // Resolve path against source
      const parts = value.split('.').map(p => p.replace(/\?/g, '')).filter(p => p.length > 0);
      let current = source;
      for (const part of parts) {
        if (current == null) break;
        current = current[part];
      }
      result[key] = current;
    } else {
      result[key] = value;
    }
  }
  return result;
}
```

That's about **20 lines**. Very lightweight.

### Standalone vs. Baked In

Both approaches have merit. Here's my take:

**Standalone `substituteRHS` (recommended as primary):**
- Composable — can be used independently of `assignGingerly`
- Testable in isolation
- No weight added to `assignGingerly` for users who don't need it
- Clear separation of concerns: resolve values, then assign them
- The two-step pattern is explicit and readable

**Baked into `assignGingerly` via `sourceObj` option:**
- Convenient one-liner for the common case
- But adds conceptual weight to an already feature-rich function
- Mixes two concerns: value resolution and assignment
- Every RHS string starting with `?.` would need disambiguation — is it a literal string value or a path to resolve? Currently `?.` on the LHS means "nested path", but on the RHS it's just a string value. Adding resolution on the RHS changes that contract.

### The Disambiguation Problem

This is the key concern. Consider:

```javascript
assignGingerly(target, {
  '?.style?.color': '?.theme?.primaryColor'
}, { sourceObj: themeObj });
```

Is `'?.theme?.primaryColor'` a literal string to assign to `style.color`, or a path to resolve against `themeObj`? With `sourceObj` present, it would be a path. Without it, it's a literal. This context-dependent behavior could be surprising.

**Possible solutions:**

1. **Only resolve when `sourceObj` is provided** — simple but means the same JSON config behaves differently depending on options. Could be confusing.

2. **Use a prefix/sigil to mark RHS paths** — e.g., `'@?.theme?.primaryColor'` or `'<-?.theme?.primaryColor'`. Explicit but adds syntax.

3. **Keep it standalone only** — no ambiguity, two clear steps.

### Recommendation

**Export `substituteRHS` as a standalone utility.** Don't bake it into `assignGingerly`.

Reasons:
- Zero ambiguity
- Zero weight impact on `assignGingerly`
- The two-step pattern is clean and explicit
- Users who need it import it; users who don't aren't affected
- It's ~20 lines in its own file, trivial to maintain

### Parameter Order

You asked whether the parameter order should be reversed. I'd suggest:

```typescript
substituteRHS(pattern, source)
```

This reads naturally: "substitute the RHS values in this pattern, using this source." It also mirrors `assignGingerly(target, source)` — the thing being transformed comes first.

### Naming

`substituteRHS` is descriptive but a bit technical. Alternatives:

- `resolveValues` — generic, clear
- `mapValues` — familiar from lodash, but could be confused with `Array.map`
- `bindValues` — implies connection to a source
- `hydratePattern` — implies filling in a template

I'd lean toward `resolveValues` or keep `substituteRHS` since it's precise about what it does in the context of this library.

### Edge Cases to Handle

1. **Nested objects in the pattern** — should we recurse into object values?
   ```javascript
   { '?.a': { nested: '?.source?.prop' } }
   ```
   I'd say no for v1 — keep it flat. The user can call `substituteRHS` on nested objects separately.

2. **Non-string values** — numbers, booleans, arrays, objects should pass through unchanged.

3. **Null/undefined resolution** — if the path doesn't resolve, return `undefined` (gingerly behavior — don't throw).

4. **LHS paths** — the LHS keys should pass through untouched. Only RHS values are resolved.

### Implementation Estimate

- **New file `substituteRHS.ts`**: ~25 lines (including JSDoc)
- **Export from `package.json`**: 1 line
- **Add to `tsconfig.json`**: 1 line
- **Type definition**: ~5 lines
- **README documentation**: ~30 lines
- **Tests**: ~15 test cases

### Questions Before Proceeding

1. Should `substituteRHS` recurse into nested object values, or keep it flat (resolve only top-level RHS strings)?
2. Are you happy with the standalone approach (not baked into `assignGingerly`), or do you want both?
3. Naming preference: `substituteRHS`, `resolveValues`, or something else?

---

## Human Response I

Answers to questions

1.  Keep it flat for v1.
2.  See below
3.  Let's go with resolveValues

What if then we define another function in a separate module that combines the two:

```JavaScript
const objToMergeInto = {hello: 'world'};
someOtherName(JSONSerializableMergePattern, {
    // maybe there's a better name than afterResolving
    afterResolving: sourceObjToMergeIn
});
```

What name would you use for someOtherName, and afterResolving?



---

## Agent Response to Human Response I

Good call on keeping it flat and going with `resolveValues`.

### The Combined Function

Looking at your example again:

```javascript
someOtherName(JSONSerializableMergePattern, {
    afterResolving: sourceObjToMergeIn
});
```

Wait — I notice `objToMergeInto` is defined but the combined function doesn't reference it. The function needs three things: the target to merge into, the pattern, and the source to resolve against. Let me assume the intent is something like:

```javascript
objToMergeInto.someOtherName(JSONSerializableMergePattern, {
    afterResolving: sourceObjToMergeIn
});
```

Or as a standalone:

```javascript
someOtherName(objToMergeInto, JSONSerializableMergePattern, {
    afterResolving: sourceObjToMergeIn
});
```

### Naming Ideas

**For the combined function (`someOtherName`):**

The function does two things: resolve values from a source, then assign them gingerly. It's essentially "assign gingerly, but first resolve the RHS paths." Some options:

- `mergeResolved` — "merge the resolved values into target"
- `assignResolved` — mirrors `assignGingerly` but with resolution step
- `assignFrom` — "assign into target *from* this source, using this pattern"
- `applyPattern` — "apply this pattern using this source"
- `resolveAndAssign` — explicit about both steps, but verbose

I'd lean toward **`assignFrom`** — it's concise and reads naturally:

```javascript
// As a prototype method:
objToMergeInto.assignFrom(JSONSerializableMergePattern, {
    from: sourceObjToMergeIn
});

// Or standalone:
assignFrom(objToMergeInto, JSONSerializableMergePattern, {
    from: sourceObjToMergeIn
});
```

**For the option key (`afterResolving`):**

- `afterResolving` — implies a temporal step, slightly misleading since it's not async
- `from` — short, reads naturally: "assign from this source"
- `using` — "assign using this source"
- `via` — "assign via this source"
- `source` — plain and descriptive

I'd suggest **`from`** — it reads like English:

```javascript
objToMergeInto.assignFrom(pattern, { from: sourceObj });
// "assign from sourceObj into objToMergeInto using pattern"
```

Or **`using`**:

```javascript
objToMergeInto.assignFrom(pattern, { using: sourceObj });
// "assign from pattern, using sourceObj to resolve values"
```

### Implementation

The combined function would be trivial — just glue:

```typescript
// assignFrom.ts (~15 lines)
import { resolveValues } from './resolveValues.js';
import assignGingerly from './assignGingerly.js';
import { IAssignGingerlyOptions } from './assignGingerly.js';

interface AssignFromOptions extends IAssignGingerlyOptions {
  from: any;
}

export function assignFrom(
  target: any,
  pattern: Record<string, any>,
  options: AssignFromOptions
): any {
  const resolved = resolveValues(pattern, options.from);
  return assignGingerly(target, resolved, options);
}
```

It inherits all `assignGingerly` options (withMethods, aka, signal, etc.) while adding `from`.

### Summary of Deliverables

1. **`resolveValues.ts`** (~25 lines) — standalone utility, exported
2. **`assignFrom.ts`** (~15 lines) — combined function, exported
3. Both added to `package.json` exports, `tsconfig.json`, type definitions
4. README documentation
5. Tests for `resolveValues` (the core logic)

### Questions

1. Does `assignFrom` with `{ from: sourceObj }` read well to you, or do you prefer a different combo?
2. Should `assignFrom` also be added to `Object.prototype` (like `assignGingerly`), or keep it as an import-only function?

---

# Human Response II

1.  assignFrom sounds fine.
2.  Let's not add to Object.prototype yet.  I'm thinking this could be usefully packaged as a custom enhancement
