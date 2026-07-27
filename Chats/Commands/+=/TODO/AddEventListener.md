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
                fromHost:{
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

All these AssignDispatchVectors (fromLHS, fromHost, fromEvent, fromTarget) x (toTarget, toHost, toLHS) are there to accommodate all possible combinations of assigning things from "A" to "B", depending on the developer needs.

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
| fromHost | toTarget | Re-resolve from source VM at event time |
| fromTarget | toHost | Two-way binding (element → VM) |
| fromEvent | toTarget | Read event properties (e.detail, etc.) |
| fromEvent | toLHS | Read event properties, set on triggering element |

That's comprehensive. But it's also a lot of options for most use cases. I'd suggest:

**Phase I:** Support the most common patterns:
- `toTarget` (no `from` — static assignments like toggles)
- `fromLHS.toTarget` (read from element, assign to component — your example)
- `fromHost.toTarget` (re-resolve from VM at event time)
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
        from: 'fromTarget' // or 'fromHost', etc.
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

---

## Human Response I

> On requiring `on`

Agreed.  I changed the type definition to reflect this (types/assign-gingerly/types.d.ts AddEventListenerConfig)

> The full matrix is:

I made a naming mistake:  fromSource should have been fromHost

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

I've updated the types.d.ts to reflect this as well as everywhere in the chat above.

Please be absolutely sure you are clear on the meaning of LHS, Source and Target.  I added comments in the first code sample indicating what these mean.

**Phase I:** Support the most common patterns:

The uniformity in structure is designed to ensure that once one full scenario (Source / Destination) is coded, all the others will fall out.  In fact, it could be done in a loop from an array ['LHS', 'Target', 'Host'] at least as far as the Destination.

So I'm hoping it won't add much to support them all at the same time?  Let me know if I'm missing something.

> Syntax simplification suggestion

This is a really good suggestion.  The uncertainty in my mind is if toHost would be more frequently used than toTarget.

In the example I gave, they are the same.

But I think a frequent usage would be that the target is the shadowRoot (easier to query from), and the host would be the custom element.

So I'm leaning towards making toHost the default.  What do you think?


---

## AI Response II

### Confirming my understanding of LHS, Target, Host

From the code sample:

```JS
assignFrom(this /* this is the target */, {
    '?.🔍?.button +=': { ... }  // button is the LHS (element the event is on)
}, {
    from: this, /* this is the Host */
});
```

- **Target** = first argument to `assignFrom` (the element being assigned *into*). In a component context, often the shadow root or the component itself.
- **Host** = `options.from` — the source/view model. Often the custom element class instance (with getters/setters).
- **LHS** = the element resolved by the left-hand-side path (`?.🔍?.button`) — the element that gets the event listener.

In the mood-stone example, target and host are the same (`this`). But in a shadow DOM scenario: target = `this.shadowRoot`, host = `this` (the custom element). Clear.

### On supporting all vectors at once

You're right — the structure is uniform enough that a loop can handle it:

```JS
const vectors = [
    { key: 'fromLHS', source: lhsElement },
    { key: 'fromHost', source: host },
    { key: 'fromTarget', source: target },
    { key: 'fromEvent', source: event },
];

for (const { key, source } of vectors) {
    const config = handlerConfig[key];
    if (!config) continue;
    const destinations = [
        { key: 'toTarget', dest: target },
        { key: 'toHost', dest: host },
        { key: 'toLHS', dest: lhsElement },
    ];
    for (const { key: destKey, dest } of destinations) {
        const pattern = config[destKey];
        if (!pattern || Object.keys(pattern).length === 0) continue;
        assignFrom(dest, pattern, { from: source, ...inheritedOptions, ...config.withOptions });
    }
}
```

That's ~15 lines to handle the entire 4×3 matrix. Each combination is just an `assignFrom(dest, pattern, { from: source })` call. So yes — supporting all vectors from day one adds negligible code. The loop handles it uniformly.

The top-level `toTarget`/`toHost`/`toLHS` (no `from`) are the "static" case — they use `assignGingerly` (no source resolution needed):

```JS
// Static assignments (no from)
for (const { key: destKey, dest } of destinations) {
    const pattern = handlerConfig[destKey];
    if (!pattern || Object.keys(pattern).length === 0) continue;
    assignGingerly(dest, pattern, inheritedOptions);
}
```

### On `toHost` as default for the shorthand

I agree with your reasoning. In the typical web component pattern:

- **target** = `this.shadowRoot` (you query from here)
- **host** = `this` (the custom element — where reactive properties live)

Most event handlers update the host's state (setter triggers re-render), not the shadow root's properties. So:

```JS
'?.querySelector?.button +=': {
    on: 'click',
    '?.isHappy =!': '.',        // implicit toHost (the common case)
    fromLHS: {
        '?.age +=': '?.dataset.diff'  // implicit toHost within fromLHS
    }
}
```

**toHost as default** makes sense because:
1. Event handlers overwhelmingly update component state (host properties/setters)
2. The target (shadow root) rarely has properties you'd want to set directly from an event
3. In the degenerate case where target === host (your mood-stone example), the default doesn't matter — they're the same object

**When you need a different destination**, use the explicit form:

```JS
'?.querySelector?.button +=': {
    on: 'click',
    toTarget: { '?.someAttr': 'value' },   // explicit: assign to target
    toLHS: { '?.disabled': true },          // explicit: assign back to the button
}
```

### One nuance: the "no from" static shorthand vs "fromX" shorthand

For the static case (no `from`, just hardcoded assignments):
```JS
'?.isHappy =!': '.'   // shorthand → toHost, no from (uses assignGingerly)
```

For the `fromLHS`/`fromHost`/`fromEvent` cases, the shorthand applies *within* those blocks:
```JS
fromLHS: {
    '?.age +=': '?.dataset.diff'   // shorthand → toHost, from = LHS element
}
```

This is consistent — the shorthand always means "toHost" regardless of nesting level. Clean.

### Summary

| Decision | Resolution |
|----------|-----------|
| All vectors at once | Yes — loop-based, ~15 lines for 4×3 matrix |
| Default destination for shorthand | `toHost` |
| Explicit destinations | `toTarget`, `toHost`, `toLHS` when you need them |
| Shorthand detection | Keys starting with `?.` or containing operators → implicit toHost |

---

## Human Response II

I forget to ask for clarification previously:

>  The handler would maintain a `Map<Element, Map<key, AbortController>>`.

I'm thinking that should be `WeakMap<Element, Map<key, AbortController>>`?

If you agree, and no other questions, please implement.



---

## AI Implementation Notes

Done. Implemented the `+=` event handler detection and `addEventListener.ts` handler.

**Files created:**
- `handlers/addEventListener.ts` / `.js` — the event binding handler (~120 lines)

**Files modified:**
- `assignGingerly.ts` / `.js` — added Element + object-with-`on` detection in the `+=` command handler. Uses `withMethods` for path evaluation (resolves the button via querySelector), then fire-and-forgets the dynamic import of `addEventListener.js`.
- `tests/inc-command.html` — updated test for new numeric-string `+=` behavior

**Behavior:**
- When `+=` resolves an LHS to a DOM Element and the RHS is an object with `on` property → dynamically imports `handlers/addEventListener.js` and attaches the listener
- `WeakMap<Element, Map<key, AbortController>>` for dedup
- Static assignments (no `from`) use `assignGingerly`
- `fromLHS`/`fromHost`/`fromTarget`/`fromEvent` vectors use `assignFrom` (dynamically imported)
- Shorthand: non-reserved keys in the config are treated as implicit `toHost` patterns
- `nudge` support via lazy import of `./nudge.js`
- Dispatch support for custom events
- All tests passing (21/21 inc-command, 12/12 merge-command)
