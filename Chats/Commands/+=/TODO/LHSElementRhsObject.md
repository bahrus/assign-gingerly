# Lhs Element, Rhs Object

---

## Human Ask

When it comes to the += operator, README.md currently lays out the following rules for how it behaves:

**Behavior by type:**

| LHS type | RHS type | Result |
|----------|----------|--------|
| number | number | addition (`2 += 3` → `5`) |
| number | string (numeric) | parse + addition (`5 += '3'` → `8`) |
| number | string (non-numeric) | string concatenation (`5 += 'px'` → `'5px'`) |
| string | any | string concatenation (`"hello" += 3` → `"hello3"`) |
| array | array | array concatenation (`[1,2] += [3,4]` → `[1,2,3,4]`) |
| array | non-array | push single item (`[1,2] += 3` → `[1,2,3]`) |
| undefined/missing | any | direct assignment |

This proposal is to deal more carefully with the scenario that the LHS resolves to a DOM Element, and the RHS is an Object, or an array of objects.  In that scenario, we was to merge in an event handler.

```html
<mood-stone>
    <div>
        Is Happy: <span id=happy></span>
        Age: <span id=age></span>
    </div>
    <button disabled data-diff=10>Merge</button>
</mood-stone>
```

```JS
class MoodStone extends HTMLElement{
    #isHappy;
    get isHappy(){
        return this.#isHappy;
    }
    set isHappy(nv){
        this.#isHappy = nv;
        this.querySelector('#happy').textContent = nv ? '😊' : '😢'
    }
    #age;
    get age(){
        return this.#age;
    }
    set age(nv){
        this.#age = nv;
        this.querySelector('#age').textContent = nv;

    }
    #abortController = new AbortController();
    get abortController(){
        return this.#abortController;
    }
    connectedCallback(){
        this.isHappy = true;
        this.age = 0;
        assignFrom(this /* this is the target */, {
            //LHS points to the "LHS"
            '?.🔍?.button +=': {
                on: 'click', //default based on inferencer
                // works from assignGingerly and assignFrom
                // no ?.'s on the rhs for this group
                toTarget: {
                    "?.isHappy =!": ".",
                    
                },
                toHost: {},
                toLHS: {},
                withOptions: {},
                //works from assignFrom or assignGingerly asynchronously
                fromLHS: {
                    toTarget: {
                        "?.age +=": '?.dataset.diff'
                    },
                    toHost: {},
                    toLHS: {},
                    withOptions: {},
                },
                fromSource:{
                    toTarget: {},
                    toHost: {},
                    toLHS: {},
                    withOptions: {},
                },
                fromTarget:{
                    toTarget: {},
                    toHost: {},
                    toLHS: {},
                    withOptions: {},
                },
                fromEvent:{
                    toTarget: {},
                    toHost: {},
                    toLHS: {},
                    withOptions: {},
                },
                //uses ./handlers/nudge.js
                nudge: true,
                // not relevant with assignGingerly
                // as there's no source to draw from
                get: {
                    controller: '?.abortController'
                },
                
            }, //can also be an array
                
        }, {
            from: this, /* this is the Host */
            akaMethods: {'🔍', 'querySelector'}
        });
}
customElements.define('mood-stone', MoodStone);
```

All these AssignDispatchVectors (fromLHS, fromSource, fromEvent, fromTarget) x (toTarget, toHost, toLHS) are there to accommodate all possible combinations of assigning things from "A" to "B", depending on the developer needs.

### fromTarget?

Is there a use case for fromTarget?

### Location of module(s) to support this

I was originally proposing this functionality to be done with a traditional assignFrom handler (builtIns.react), but this current approach involves a lot less ceremony, for an extremely common task.

Nevertheless, I think the module, addEventListener.js perhaps, should reside in the handlers folder, and should follow similar patterns, for example, in resolving the get property and passing that in to some sort of class.

Because of the support for nudge, and since events are not expected to fire right away, and because "assigning" the event handler won't be used by subsequent calls, I think this whole functionality can be loaded asynchronously on demand, but not wait until an actual event fires, but rather during the hydration handshake.  

assignGingerly would also support this (but not the get).  Because the mode switches to async with this fire and forget handoff, the += handler could dynamically load assignFrom on demand.

I don't think an abortController / signal should be required, because typically, the handler goes away when the container does.

I've added some preliminary typing for this handler in the [types/assign-gingerly/types.d.ts file](../../../../types/assign-gingerly/types.d.ts).

Note that some of what is in the types relates to a phase II requirement to support dispatching another event with a unique name (perhaps) from a generic event, for more targeted handling.  Please consider that and give your initial impressions of how this would impact this requirement, getting ready for it.

## Preventing Duplicate Event Handlers

In scenarios where the same assign needs to be called multiple times, perhaps with different options / assignments, and where we only want the last call should prevail, we need a way of identifying that, so that previous event handlers can be aborted.  I'm thinking another parameter to be added to get the identifier:

```JS
'?.🔍?.button +=': {
    get: {
        controller: '?.abortController',
        key: 'J1blM83YNEGtLm71Kvic_w',
    },
```

## Require on setting?

If we require the on setting, then we can limit the assumption that if the lhs is a DOM Element, and the rhs is any object, then it is an event handler.  We can instead conclude it is an event handler only if an on setting is there.  Does that seem prudent?  It might be easier to read and reason about.

## Options inheritance

I think the parent options should apply to inner assigns by default, unless an explicit withOptions is specified

Let's do this in baby steps and first finalize on the syntax before getting into the weeds.


---

## AI Response

This is a substantial and well-thought-out proposal. Let me address each question and give initial impressions on the syntax.

### On requiring `on`

**Yes, absolutely require `on`.** This is prudent for several reasons:

1. **Disambiguation** — Without `on`, any object RHS on an element LHS becomes an event handler. That's too broad. What if someone legitimately wants to `+=` an object onto an element property (e.g., dataset merging)?
2. **Readability** — `on: 'click'` immediately tells the reader "this is an event binding." Without it, you have to infer intent from the shape of the nested objects.
3. **Type narrowing** — TypeScript can discriminate: `if ('on' in rhs)` → event handler config, else → normal `+=` behavior.

### On `fromTarget`

Use case: yes — when you want to read the element's *current state* at event time and assign it somewhere. Example: a form element that reads its own `value`/`checked` at the time the event fires and pushes it back to the host (two-way binding):

```JS
'?.querySelector?.input +=': {
    on: 'input',
    fromTarget: {
        toHost: {
            '?.username': '?.value'
        }
    }
}
```

"When input fires, read `value` from the target (the input) and assign it to `host.username`." This is the classic "push from form element to view model" pattern.

### On the AssignDispatchVectors

The full matrix is:

| Source (`from`) | Destination (`to`) | Use case |
|----------------|-------------------|----------|
| (none) | toTarget | Static assignments on event (toggle, set class) |
| (none) | toHost | Static assignments to host |
| (none) | toLHS | Static assignments to the event target element |
| fromLHS | toTarget | Read from element, assign to component |
| fromLHS | toHost | Read from element, assign to host VM |
| fromSource | toTarget | Re-resolve from source VM at event time |
| fromTarget | toHost | Two-way binding (element → VM) |
| fromEvent | toTarget | Read event properties (e.detail, etc.) |
| fromEvent | toLHS | Read event properties, set on triggering element |

That's comprehensive. But it's also a lot of options for most use cases. I'd suggest:

**Phase I:** Support the most common patterns:
- `toTarget` (no `from` — static assignments like toggles)
- `fromLHS.toTarget` (read from element, assign to component — your example)
- `fromSource.toTarget` (re-resolve from VM at event time)
- `fromEvent.toTarget` (read from event, assign to component)

**Phase II:** Add `toHost`, `toLHS`, and the full cross-product.

### On phase II dispatch (re-dispatching with unique name)

If the goal is to emit a custom event from a generic event (e.g., `click` → `mood-changed`), this fits naturally as another vector:

```JS
'?.querySelector?.button +=': {
    on: 'click',
    dispatch: {
        name: 'mood-changed',
        detail: { /* ... */ },
        from: 'fromTarget' // or 'fromSource', etc.
    }
}
```

This doesn't conflict with the current design — it's just another action in the handler alongside the assign vectors. The handler processes assigns first, then dispatches if configured.

### On duplicate prevention with `key`

The `key` in `get` is clean:

```JS
get: {
    controller: '?.abortController',
    key: 'J1blM83YNEGtLm71Kvic_w',
}
```

The handler would maintain a `Map<Element, Map<key, AbortController>>`. When a new binding with the same `key` is applied to the same element, the previous controller is aborted first. This is essentially "named event subscriptions" — same concept as how Angular/Vue handle template re-renders without stacking listeners.

### On options inheritance

Agreed — parent options should flow down. The `withOptions` in each vector overrides specific fields, not replaces the whole object. So `withMethods`, `aka`, `protocols` from the parent `assignFrom` call are available inside the event handler's inner assigns unless explicitly overridden.

### Syntax simplification suggestion

For the 80% case (simple reactive binding), the full verbosity feels heavy. Most bindings are:
- "On click, toggle this property" — `toTarget` with `=!`
- "On click, read dataset from element, add to component" — `fromLHS.toTarget`

Could we support a shorthand for the common case?

```JS
// Full form
'?.querySelector?.button +=': {
    on: 'click',
    toTarget: { '?.isHappy =!': '.' },
    fromLHS: {
        toTarget: { '?.age +=': '?.dataset.diff' }
    }
}

// Equivalent shorthand — when there's only toTarget assignments:
'?.querySelector?.button +=': {
    on: 'click',
    '?.isHappy =!': '.',                    // implicit toTarget
    fromLHS: {
        '?.age +=': '?.dataset.diff'        // implicit toTarget within fromLHS
    }
}
```

If the config object has keys that start with `?.` (or contain operators), they're implicitly `toTarget` assignments. This eliminates one level of nesting for simple cases while keeping the explicit `toTarget`/`toHost`/`toLHS` for complex scenarios.

### Summary of my recommendations

| Question | Recommendation |
|----------|---------------|
| Require `on`? | Yes — essential for disambiguation |
| `fromTarget` use case? | Yes — two-way form binding |
| Location | `handlers/addEventListener.js` — lazy-loaded, fire-and-forget |
| AbortController required? | No — optional, for manual cleanup or `key`-based dedup |
| `key` for dedup | Good — `Map<Element, Map<key, controller>>` |
| Options inheritance | Yes — parent flows down, `withOptions` overrides |
| Phase II dispatch | Fits as a `dispatch` field alongside assign vectors |
| Shorthand | Consider implicit `toTarget` for `?.` keys in the config |

Ready to proceed with baby steps on syntax finalization when you are.
