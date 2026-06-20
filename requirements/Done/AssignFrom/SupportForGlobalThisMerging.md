# Support for Global This Merging

---

## Human Ask

I'm trying to figure out if assign-gingerly is the right fit for supporting the following need (legacy below):

```html
    
<script type=module>
    (await import('trans-render/lib/weave.js'))
    .weave({
        baseURL:  "globalThis://newton-microservice/href"
    })
    .into('qmywdO1vr0SwyuIe4fvzxQ')
    .andWeave({
        myCustomHeader: 'goodbye'
    })
    .into('rPpwNLcYsUOjFcg+N8lmOA');
</script>
<form id=testForm be-reformable='{
    "...": "qmywdO1vr0SwyuIe4fvzxQ",
    "path": "api/v2/:operation/:expression",
    "headerFields": ["#myHeader"],
    "headers": {
        "...": "rPpwNLcYsUOjFcg+N8lmOA"
    }
}'
>
<label>
    header:
    <input id=myHeader value=hello>
</label>
<label>
    Operation:
    <input :operation value=integrate>
</label>

<label>
    Expression:
    <input :expression value="x^2">
</label>
    <input name="hello" value=test>
</form>
<script>
    testForm.addEventListener('fetch-ready', e => {
        console.log({e});
    })
</script>
```

I'd like to couch it as something that could be more generalized:

```JavaScript
oForm.assignGingerly({
    "...": "globalThis://qmywdO1vr0SwyuIe4fvzxQ",
    "path": "api/v2/:operation/:expression",
    "headerFields": ["#myHeader"],
    "headers": {
        "...": "globalThis://rPpwNLcYsUOjFcg+N8lmOA"
    }
}, {
    protocols: {
        globalThis: myGlobalThisHandler
    }
})
```

Other protocols could include IndexedDB, SessionStorage, LocalStorage,  JsonImport, etc.

But I think maybe some of them should be built in, starting with globalThis, and I think localStorage and sessionStorage.

Or maybe we should add another subregistry in the customElementRegistry, for protocols?


---

## Kiro's Comments

Interesting idea. Let me separate the concerns:

### What's being proposed

The `"..."` key with a protocol-prefixed value (e.g., `"globalThis://someKey"`) means "spread/merge the object found at that location into this position." It's a declarative way to reference external state and merge it inline during `assignGingerly`.

### Is assign-gingerly the right home?

**Arguments for:**
- assign-gingerly already handles merging semantics (`?.` paths, `+=`, readonly detection, `assignTo`). Adding "resolve a reference before merging" is a natural extension of "merge this value into this path."
- The `"..."` spread key is analogous to `...` in JavaScript — it's a merge/spread operation, which is assign-gingerly's core competency.
- The `protocols` option fits cleanly into `IAssignGingerlyOptions`.

**Arguments against:**
- assign-gingerly has been synchronous (mostly). Resolving from IndexedDB or a JSON import is async. This would need the same fire-and-forget pattern as `withAsyncMethods`, or the `"..."` resolution would need to happen before `assignGingerly` is called.
- It adds complexity to what is otherwise a predictable, data-in/data-out function.

### My take

I think it fits, but with a clear boundary: **resolution should happen before or during** the assignment, not as a separate async step that delays everything.

### On the `"..."` key specifically

The `"..."` key as "spread from here" is elegant and JSON-friendly. It's essentially a `$ref` (like JSON Schema) but for runtime merging. The protocol prefix (`globalThis://`, `localStorage://`, etc.) tells the resolver where to find the data.

### On built-in vs registry

**Built-in protocols I'd support:**
- `globalThis://key` — `globalThis[key]` (synchronous, zero overhead)
- `localStorage://key` — `JSON.parse(localStorage.getItem(key))` (synchronous)
- `sessionStorage://key` — `JSON.parse(sessionStorage.getItem(key))` (synchronous)

These are all synchronous, which keeps `assignGingerly` synchronous. No async issues.

**Registry for async protocols:**
- `indexedDB://store/key` — async
- `fetch://url` — async
- `import://module` — async

These would require either the fire-and-forget pattern or pre-resolution.

### Proposed implementation approach

**Option A: Pre-resolve, then assign (cleanest separation)**

A `resolveRefs` utility that walks an object and resolves all `"..."` values, returning a clean object that `assignGingerly` processes normally:

```javascript
import { resolveRefs } from 'assign-gingerly/resolveRefs.js';

const resolved = await resolveRefs({
    "...": "globalThis://qmywdO1vr0SwyuIe4fvzxQ",
    "path": "api/v2/:operation/:expression",
    "headers": {
        "...": "globalThis://rPpwNLcYsUOjFcg+N8lmOA"
    }
}, { protocols: { globalThis: myHandler } });

oForm.assignGingerly(resolved);
```

**Pros:** assign-gingerly stays synchronous. Clear separation. Testable.
**Cons:** Two calls. Consumer has to remember to resolve first.

**Option B: Inline in assignGingerly (more convenient)**

`assignGingerly` itself detects `"..."` keys and resolves them using a `protocols` option:

```javascript
oForm.assignGingerly({
    "...": "globalThis://qmywdO1vr0SwyuIe4fvzxQ",
    "headers": {
        "...": "globalThis://rPpwNLcYsUOjFcg+N8lmOA"
    }
}, { protocols: { globalThis: (key) => globalThis[key] } });
```

For synchronous protocols only — the resolver function must return the value (not a Promise). If a protocol is async, it throws or falls back to Option A.

**Pros:** Single call. Declarative. JSON-friendly.
**Cons:** Adds a special key (`"..."`) to assignGingerly's processing. Need to handle nested `"..."` recursively.

### On the registry idea

A protocol registry on `CustomElementRegistry` makes sense if:
- Multiple enhancements/features share the same protocols
- You want the protocols to be scoped (different shadow DOMs use different resolvers)
- The protocol set is stable per application

```javascript
customElements.protocolRegistry.define('globalThis', (key) => globalThis[key]);
customElements.protocolRegistry.define('localStorage', (key) => JSON.parse(localStorage.getItem(key) || 'null'));
```

Then `assignGingerly` auto-uses the registry if no `protocols` option is passed:

```javascript
// Uses element.customElementRegistry.protocolRegistry
element.assignGingerly({
    "...": "globalThis://myConfig"
});
```

### My recommendation

1. **Start with Option B for sync protocols only** — built-in `globalThis`, `localStorage`, `sessionStorage` support via a `protocols` option on `IAssignGingerlyOptions`. Keep it synchronous.
2. **The `"..."` key means "spread the resolved value here"** — works at any nesting level.
3. **Defer the registry** until scoped protocol support is needed. For now, `protocols` on the options is sufficient.
4. **Defer async protocols** — if needed, provide `resolveRefs` as a pre-processing utility (Option A) for async sources.
5. **Don't make this a priority** — it's a nice-to-have. The `weave().into()` pattern works today without assign-gingerly being involved.

### One concern: the `"..."` key

Is `"..."` the right key name? Considerations:
- It's valid JSON ✓
- It's unlikely to conflict with real property names ✓
- It visually resembles `...` spread ✓
- It could conflict if someone actually has a `"..."` property (very unlikely)
- Alternative: `"$ref"` (JSON Schema convention), `"@spread"`, `"...spread"`

I think `"..."` is fine — it's short, visually clear, and JSON-safe.

---

## Human Response I

On reflection, after thinking about your input, I'm leaning towards:

1.  Making the function resolveValues, and therefore assignFrom, asynchronous.  I'll take care of adjusting all the references to this function to work with that in external packages with dependencies on this package.
2.  Only add the protocols option to type ResolveValuesOptions
3.  Add an async function resolveProtocolValue, parallel to resolveValue, that gets invoked if the rhs starts with one of the supported protocols.
4.  The convention should be that the protocol string ends at the first ?. in the rhs.  If there is an ?. in the right hand side, call resolve value, passing in the rhs starting with ?.
5.  Support "..." in assignFrom only.
 


---

## Kiro's Response I

This is a clean design. Let me make sure I understand the flow:

### The model

```javascript
const resolved = await resolveValues({
    baseURL: 'globalThis://newton-microservice/href?.href',
    headers: 'localStorage://myHeaders?.authToken'
}, source, {
    protocols: {
        globalThis: (key) => globalThis[key],
        localStorage: (key) => JSON.parse(localStorage.getItem(key) || 'null')
    }
});
```

For `'globalThis://newton-microservice/href?.href'`:

1. Extract protocol: `globalThis`
2. Extract key (between `://` and first `?.`): `newton-microservice/href`
3. Call protocol handler: `protocols.globalThis('newton-microservice/href')` → returns the object at `globalThis['newton-microservice/href']`
4. Remaining path: `?.href` → call `resolveValue('?.href', resolvedObject)` → returns the `href` property
5. Final value: the resolved `href`

For values without a `?.` after the protocol:
- `'globalThis://qmywdO1vr0SwyuIe4fvzxQ'` → just returns `globalThis['qmywdO1vr0SwyuIe4fvzxQ']` directly

### On `"..."` in assignFrom only

Makes sense — `assignFrom` already combines `resolveValues` + `assignGingerly`. The `"..."` spread key would be handled during the resolve phase: if a key is `"..."`, the resolved value is spread into the parent object rather than assigned to a property named `"..."`.

```javascript
await assignFrom(target, {
    "...": "globalThis://qmywdO1vr0SwyuIe4fvzxQ",
    path: "api/v2/:operation/:expression",
    headers: {
        "...": "globalThis://rPpwNLcYsUOjFcg+N8lmOA"
    }
}, { from: source, protocols: { globalThis: (key) => globalThis[key] } });
```

The `"..."` key would cause the resolved object to be merged (spread) into the parent rather than assigned to a `"..."` property.

### Implementation plan

1. **Make `resolveValues` async** — change return type to `Promise<Record<string, any>>`. For values that don't use protocols, resolution is still instant (just awaiting a resolved Promise is negligible overhead).

2. **Add `protocols` to `ResolveValuesOptions`:**
   ```typescript
   protocols?: Record<string, (key: string) => any | Promise<any>>;
   ```

3. **Add `resolveProtocolValue` function:**
   ```typescript
   async function resolveProtocolValue(
       value: string,
       protocols: Record<string, (key: string) => any | Promise<any>>,
       options?: ResolveValuesOptions
   ): Promise<any> {
       // Extract protocol name (before ://)
       const protoEnd = value.indexOf('://');
       const protocol = value.substring(0, protoEnd);
       const rest = value.substring(protoEnd + 3);
       
       // Split at first ?. to separate key from path
       const pathStart = rest.indexOf('?.');
       const key = pathStart === -1 ? rest : rest.substring(0, pathStart);
       const path = pathStart === -1 ? null : rest.substring(pathStart);
       
       // Resolve via protocol handler
       const handler = protocols[protocol];
       if (!handler) throw new Error(`Unknown protocol: ${protocol}`);
       const resolved = await handler(key);
       
       // If there's a remaining path, resolve it against the result
       if (path) {
           return resolveValue(path, resolved, options);
       }
       return resolved;
   }
   ```

4. **In `resolveValues`**, when a value is a string and matches a protocol pattern (contains `://`), call `resolveProtocolValue` instead of the normal path resolution.

5. **Make `assignFrom` async** — it already calls `resolveValues`, so it just needs `await`.

6. **Handle `"..."` in `assignFrom`** — after resolving, if any key is `"..."`, spread its value into the result before passing to `assignGingerly`.

### Questions

1. **Should `resolveValue` (singular) also become async?** It's used in `installForwarding` getters, which are synchronous. I'd keep `resolveValue` synchronous and add a separate `resolveProtocolValue` that's async. The getter in `installForwarding` doesn't need protocol support.

2. **Should protocol handlers be allowed to be async?** You said "asynchronous" — so yes, the handler signature should be `(key: string) => any | Promise<any>`. Built-in ones (globalThis, localStorage) are sync but custom ones (IndexedDB, fetch) could be async.

3. **Detection heuristic** — a value is a protocol reference if it's a string containing `://` and the part before `://` matches a key in the `protocols` option. This is safe — normal `?.`-prefixed paths and plain strings don't contain `://`.

Shall I implement?

---
## Human Response II

I suggest the following changes to the implementation (but I may be missing something, don't assume anything if it doesn't make sense):

```typescript
async function resolveProtocolValue(
    value: string,
    protocols: Record<string, (key: string) => any | Promise<any>>,
    options?: ResolveValuesOptions
): Promise<any> {
    // Extract protocol name (before ://)
    const protoEnd = value.indexOf('://');
    const protocol = value.substring(0, protoEnd);

    // Resolve via protocol handler
    const handler = protocols[protocol];
    if (!handler) return value; // false flag.  Coincidentally looks like a protocol

    const resolved = await handler(key);

    const rest = value.substring(protoEnd + 3);
    
    // Split at first ?. to separate key from path
    const pathStart = rest.indexOf('?.');
    const key = pathStart === -1 ? rest : rest.substring(0, pathStart);
    const path = pathStart === -1 ? null : rest.substring(pathStart);
    


    
    // If there's a remaining path, resolve it against the result
    if (path) {
        return resolveValue(path, resolved, options);
    }
    return resolved;
}
```

I agree with all of the ways you are leaning with all three questions.

Please implement if the code changes above make sense.





