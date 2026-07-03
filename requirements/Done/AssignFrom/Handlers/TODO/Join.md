# Join Handler

---

## Human Ask

One of the features that assignFrom gives us is that we can define a large swath of behavior in a 100% disciplined, constrained, declarative way, where the entire transaction can be represented by JSON.

In practice, these JSON modules are built from *.mjs files, so we can make use of the easier syntax, type checking etc.

It's very important to me that when it comes to building composible strings, we provide a way for the *.mjs to be able to define the pattern with a (tagged) template literal, with the best possible developer experience, even if the final "compiled" artifact is a JSON file.

The specification below focuses on the JSON target structure, but I would like to make sure we have a strategy for getting there as well.

## The proposal

```JavaScript
const vm = {
    lastName: 'Targaryen'
    firstName: 'Helaena'
};
assignFrom(oElement, {
    '?.textContent' : {
        do: 'builtIns.join',
        resolve: {
            value: ['?.lastName', ', ', '?.firstName']
        }
    }
});
```

Support for nested arrays might make sense, particularly if maps well to the (tagged) template literal generation mentioned above.

---

## Feedback / Questions

### The Handler Itself

The `builtIns.join` handler is dead simple at the runtime level:
1. Receive `resolvedParams.value` (an array, already resolved by `resolveValues` — paths replaced with actual values)
2. Flatten nested arrays (if present)
3. Join into a string (default separator: `''`, empty string)
4. Assign the result to `lhsTarget`

But this raises an architectural question:

### LHS Without ` =>`?

The example uses `'?.textContent': { do: 'builtIns.join', ... }` — no ` =>` suffix. Currently, only ` =>` keys invoke handlers. Without ` =>`, this object would be passed to `resolveValues` → `assignGingerly`, which would try to merge `{ do: 'builtIns.join', resolve: { ... } }` into `element.textContent` — that's wrong.

Options:

**A. Require ` =>`** — the example becomes:
```js
'?.textContent =>': {
    do: 'builtIns.join',
    resolve: { value: ['?.lastName', ', ', '?.firstName'] }
}
```
This is consistent with existing handler semantics but reads oddly — `textContent` isn't really a "target to hand off to a handler," it's a property to assign the result into.

**B. Add a new dispatch mechanism** — detect `{ do: ... }` objects on any RHS and treat them as handler invocations, with the result assigned to the LHS. This would be a new capability where handlers *return* a value rather than performing side effects on a target.

Option B is arguably cleaner for `join` (and future computed-value handlers), but it's a larger change: handlers would need a `compute()` method (or `assign()` would return a value), and `assignFrom` would need to detect `{ do: ... }` objects during normal key processing, not just ` =>` keys.

**My suggestion:** Start with option A (require ` =>`), and if the ergonomics bother you, we can introduce a `compute`-style handler protocol later. The `join` handler under ` =>` would call `lhsTarget` assignment internally:

```ts
// In JoinHandler.assign():
const joined = resolvedParams.value.flat(Infinity).join(resolvedParams.separator ?? '');
// But how does it assign to textContent? lhsTarget IS the element...
```

Wait — actually this reveals a deeper issue. With ` =>`, the LHS path resolves to the *target* the handler operates on. For `'?.textContent =>'`, `lhsTarget` would be the current value of `element.textContent` (a string), not the element. The handler can't assign back to `textContent` from there.

So either:
- The LHS should be the *parent* (`?.` or the element itself), and the handler assigns to a property named in config, or
- We need a new protocol where the handler returns a value that gets assigned to the LHS path.

**Proposed solution — return-value handlers:**

Add an optional `returns` semantic: if `handler.assign()` returns a value (not `undefined`), that value is assigned back to the LHS path. This would require the path evaluation to preserve the parent + key rather than fully dereferencing:

```ts
// Handler invocation for: '?.textContent =>': { do: 'builtIns.join', ... }
// lhsParent = element, lhsKey = 'textContent'
const result = await handler.assign(lhsParent[lhsKey], resolvedParams, options);
if (result !== undefined) {
    lhsParent[lhsKey] = result;
}
```

This way `join` returns the joined string, and `processHandlerCommands` assigns it to `element.textContent`. The existing `lazyLoad` handler returns nothing (operates by side effects), so it's backward-compatible.

### Separator

Should `join` support a configurable separator? Default `''` (no separator) makes sense for the template-literal use case, but `', '` or `'\n'` might be useful. Options:
- Hardcoded to `''` (simplest, template-literal aligned)
- A `separator` field in the config or resolve: `{ do: 'builtIns.join', separator: ', ', resolve: { value: [...] } }`

I'd suggest supporting it in config (not resolve — it's a handler setting, not a dynamic value).

### Nested Arrays

You mention nested arrays could map to tagged template literal structure. The natural representation of a tagged template literal is:

```js
// Template: `${lastName}, ${firstName}`
// Tagged template args: strings=['', ', ', ''], values=[lastName, firstName]
// Interleaved: ['', lastName, ', ', firstName, '']
```

So a flat array with interleaved static/dynamic parts is already the right shape:
```js
value: ['?.lastName', ', ', '?.firstName']
```

Nested arrays would be useful for **conditional or optional segments** — e.g., a middle name that might be undefined:
```js
value: ['?.lastName', ['?.middleName', ' '], '?.firstName']
// If middleName is undefined, flatten + join would produce "Targaryen  Helaena" (extra space)
```

For that, you might want `filter(Boolean)` or `filter(x => x != null)` before joining. Should `join` automatically strip `null`/`undefined` from the flattened array?

### Tagged Template Literal Authoring

For the `.mjs` → JSON compilation story, a tagged template function could produce the array format:

```js
// In a .mjs file:
import { j } from 'assign-gingerly/tags.js';

export default {
    '?.textContent =>': {
        do: 'builtIns.join',
        resolve: {
            value: j`${'?.lastName'}, ${'?.firstName'}`
        }
    }
};

// j`${'?.lastName'}, ${'?.firstName'}` produces:
// ['?.lastName', ', ', '?.firstName']
```

The `j` tag function is trivial:
```ts
function j(strings: TemplateStringsArray, ...values: string[]): string[] {
    const result: string[] = [];
    for (let i = 0; i < strings.length; i++) {
        if (strings[i]) result.push(strings[i]);
        if (i < values.length) result.push(values[i]);
    }
    return result;
}
```

This gives you:
- IDE syntax highlighting for the template
- Type-checked `?.` expressions in the interpolations
- Output is a plain JSON-serializable array

**Should this tag utility be part of this package?** It's ~5 lines, and it's the authoring bridge you're describing. Could live in `assign-gingerly/tags.js`.

### Summary of Decisions Needed

1. **` =>` required or detect `{ do }` objects?** — Suggest ` =>` for now.
2. **Return-value protocol for handlers?** — Needed for `join` to assign back to `textContent`. Propose: if `handler.assign()` returns a non-undefined value, it's assigned to the LHS path.
3. **Separator support?** — Suggest yes, via `config.separator` (default `''`).
4. **Null/undefined filtering before join?** — Suggest yes by default (skip nullish values in the flattened array).
5. **Include `j` tag utility?** — Suggest yes, in `assign-gingerly/tags.js`.

# Human Response I

> ### LHS Without ` =>`?

Big mistake on my part.  Absolutely, we need =>, I just forgot to include it in my example.

As much of the discussion from stems from that mistake, can you please rephrase your comments / questions / concerns with that misunderstanding behind us below?

---

## Revised Feedback (post-clarification)

Good — with ` =>` confirmed, this simplifies things considerably.

### How `join` Works With ` =>`

The corrected example:

```js
assignFrom(oElement, {
    '?.textContent =>': {
        do: 'builtIns.join',
        resolve: {
            value: ['?.lastName', ', ', '?.firstName']
        }
    }
}, { from: vm });
```

With the current `processHandlerCommands` flow:
1. LHS `'?.textContent'` is evaluated — `lhsTarget` = `oElement.textContent` (a string)
2. `resolve.value` is resolved → `['Targaryen', ', ', 'Helaena']`
3. Handler's `assign(lhsTarget, resolvedParams, options)` is called

**The problem remains:** `lhsTarget` is the *value* of `textContent` (a string primitive). The handler needs to assign back to `oElement.textContent`, but it only receives the dereferenced value, not a reference to the parent + key.

### Return-Value Protocol (Still Needed)

For `join` to work, `processHandlerCommands` needs to preserve the *parent object and property name* rather than fully dereferencing the path. Then the result can be assigned back.

**Proposed change to `processHandlerCommands`:**

If `handler.assign()` returns a non-`undefined` value, `processHandlerCommands` assigns it to the LHS path:

```ts
const result = await handler.assign(lhsTarget, resolvedParams, options);
if (result !== undefined) {
    lhsParent[lhsKey] = result;
}
```

This is backward-compatible — `lazyLoad` returns `undefined` (void) so nothing changes for it. `join` returns the joined string, and `processHandlerCommands` handles the assignment.

### The Handler Implementation

With the return-value protocol:

```ts
export class JoinHandler implements AssignFromHandler {
    config: any;
    
    constructor(config: any) {
        this.config = config;
    }

    async assign(lhsTarget: any, resolvedParams: Record<string, any>): Promise<string> {
        const { value } = resolvedParams;
        const separator = this.config.separator ?? '';
        
        // Flatten nested arrays, filter out null/undefined, join
        const flat = Array.isArray(value) ? value.flat(Infinity) : [value];
        return flat.filter(item => item != null).join(separator);
    }
}
```

~10 lines of logic.

### Remaining Questions

1. **Separator** — default `''` (empty string), configurable via `config.separator`. Agree?

2. **Null/undefined filtering** — if a resolved path returns `undefined` (e.g., `?.middleName` doesn't exist), should it be silently omitted from the join? I'd say yes — this makes optional segments natural without needing explicit conditionals.

3. **Nested arrays** — `flat(Infinity)` handles them. A nested array like `['?.lastName', [', ', '?.middleName'], ', ', '?.firstName']` would flatten before filtering. If `middleName` is `undefined`, it gets filtered out, but the surrounding `, ` literals stay. That might produce `"Targaryen, , Helaena"`. 
   
   Should nested arrays have "all-or-nothing" semantics — i.e., if any element in a nested sub-array resolves to `null`/`undefined`, the *entire* sub-array is dropped? That would handle optional segments cleanly:
   ```js
   value: ['?.lastName', [', ', '?.middleName'], ', ', '?.firstName']
   // middleName undefined → sub-array dropped → 'Targaryen, Helaena'
   // middleName = 'D' → 'Targaryen, D, Helaena'
   ```
   This maps nicely to tagged template optional interpolation patterns.

4. **The `j` tag utility** — still think it's worth including? It's trivial (~5 lines) and bridges the `.mjs` authoring experience to the JSON artifact.

### What I'd Implement (Pending Your Answers)

- Return-value protocol in `processHandlerCommands` (if `assign()` returns non-undefined, assign it to LHS)
- `builtIns.join` handler in `handlers/join.ts`
- Auto-load registration in the `BUILT_IN_MAP`
- Nested sub-arrays use "all-or-nothing" for null filtering (if confirmed)
- `j` tag utility in `tags.ts` (if confirmed)
