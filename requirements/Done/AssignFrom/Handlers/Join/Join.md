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

---

## Human Response II

Everything looks good, except the `j` tag utility.  I'm hoping we can provide even better ergonomics.

Instead of:

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

can we do:

```js
// In a .mts file:
import { tbd, tbd2 } from 'assign-gingerly/tags.js';

interface Person {
    firstName?: string,
    middleName?: string,
    lastName:  string
}

const deonstructedValue = (x: Person) => tbd `${x?.lastName}, ${x?.firstName}`;

// not sure if this step is necessary
const value = tbd2(deonstructedValue);

// produces:
// ['?.lastName', ', ', '?.firstName']

export default {
    '?.textContent =>': {
        do: 'builtIns.join',
        resolve: {
            value
        }
    }
};

// j`${'?.lastName'}, ${'?.firstName'}` produces:
// ['?.lastName', ', ', '?.firstName']
```

---

## Feedback on `tbd` / `tbd2` Approach

### What You're After

You want:
- Full TypeScript autocomplete on the interpolated expressions (`x?.lastName` gives you IDE suggestions based on the `Person` interface)
- Type safety (typos like `x?.lasName` are caught at compile time)
- The output is still the same JSON-friendly array (`['?.lastName', ', ', '?.firstName']`)

This is a compile-time-to-runtime extraction problem. The challenge is: at runtime, `x?.lastName` is just a property access that returns a value (or `undefined`) — it doesn't produce the string `'?.lastName'`. JavaScript doesn't have reflection over the expression text.

### Why It Can't Work As Written (Runtime)

```ts
const deconstructedValue = (x: Person) => tbd`${x?.lastName}, ${x?.firstName}`;
```

When this runs:
1. `x?.lastName` evaluates to a *value* (e.g., `'Targaryen'` or `undefined`)
2. The template tag receives the evaluated values, not the source expressions
3. There's no way to recover that the expression was `x?.lastName` vs a literal `'Targaryen'`

So `tbd` can't produce `'?.lastName'` from `x?.lastName` at runtime — JavaScript doesn't expose expression ASTs to tagged template functions.

### What Could Work: Proxy-Based Path Tracing

Instead of passing a real `Person` object, you pass a **Proxy** that records property accesses and returns path strings:

```ts
import { trace, extract } from 'assign-gingerly/tags.js';

const value = extract<Person>(x => [x.lastName, ', ', x.firstName]);
// produces: ['?.lastName', ', ', '?.firstName']
```

How it works:
- `extract<Person>(fn)` creates a deeply-proxied object that records every property access
- Calls `fn(proxy)`
- Each `proxy.lastName` access returns a special token (or the string `'?.lastName'`) instead of a real value
- The returned array is already in the right format

```ts
function extract<T>(fn: (proxy: T) => any[]): (string | any)[] {
    const paths: string[] = [];
    const proxy = createPathProxy<T>('');  // returns '?.prop' strings on access
    return fn(proxy);
}
```

This gives you:
- ✅ Full autocomplete (TypeScript sees `x` as `Person`)
- ✅ Type-checked property accesses
- ✅ Runtime path extraction
- ⚠️ Can't use `?.` optional chaining (the proxy always succeeds, so `?.` is unnecessary and would confuse things)
- ⚠️ Nested paths work (`x.address.city` → `'?.address?.city'`) but methods don't

### Alternative: Build-Time Extraction (Babel/TS Plugin)

A compiler plugin could transform the source:
```ts
// Input:
const value = j<Person>`${x => x.lastName}, ${x => x.firstName}`;

// Compiled output:
const value = ['?.lastName', ', ', '?.firstName'];
```

This is the most ergonomic but requires tooling setup. Probably overkill for now.

### My Recommendation

The Proxy approach is the most practical. Something like:

```ts
import { paths } from 'assign-gingerly/tags.js';

interface Person {
    firstName?: string;
    middleName?: string;
    lastName: string;
}

const value = paths<Person>(x => [x.lastName, ', ', x.firstName]);
// Result: ['?.lastName', ', ', '?.firstName']

// With nested/optional segments:
const value2 = paths<Person>(x => [x.lastName, [', ', x.middleName], ', ', x.firstName]);
// Result: ['?.lastName', [', ', '?.middleName'], ', ', '?.firstName']
```

**Tradeoffs vs the simple `j` tag:**
- ✅ Autocomplete and type safety on property names
- ✅ No need to manually type `'?.lastName'` strings
- ⚠️ Slightly more complex implementation (~20-30 lines for the proxy)
- ⚠️ `?.` optional chaining syntax can't be used (proxy handles everything) — just use `x.middleName` and the join handler's null filtering takes care of optionality
- ⚠️ Method calls in paths (like `withMethods`) won't work through the proxy — this is for data property access only

### Questions

1. **Does the Proxy approach match your ergonomic goals?** You get IDE autocomplete on the property names and compile-time typo detection, but you use dot notation (`x.lastName`) rather than optional chaining (`x?.lastName`).

2. **Should this support nested paths?** e.g., `x.address.city` → `'?.address?.city'`? Easy with a recursive proxy.

3. **Is this only for the `join` handler's `value` array, or do you envision using it more broadly** (e.g., for the RHS path strings in normal `assignFrom` patterns)?

## Human Response III

Let's implement:

- Return-value protocol in `processHandlerCommands` (if `assign()` returns non-undefined, assign it to LHS)
- `builtIns.join` handler in `handlers/join.ts`
- Auto-load registration in the `BUILT_IN_MAP`
- Nested sub-arrays use "all-or-nothing" for null filtering (if confirmed)

and hold off on doing anthing about:

- `j` tag utility in `tags.ts` (if confirmed)

for now.  That will be a separate requirement.