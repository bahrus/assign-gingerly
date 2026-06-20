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
 
