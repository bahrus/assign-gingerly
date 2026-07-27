# Lhs Element, Rhs Object

---

## Human Ask

When it comes to the += operator, README.md currently lays out the following rules for how it behaves:

**Behavior by type:**

| LHS type | RHS type | Result |
|----------|----------|--------|
| number | number | addition (`2 += 3` → `5`) |
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
                assignToTarget: {
                    "?.isHappy =!": ".",
                    
                },
                assignToSource: {},
                assignToLHS: {},
                withOptions: {},
                //works from assignFrom or assignGingerly asynchronously
                fromLHS: {
                    assignToTarget: {
                        "?.age +=": '?.dataset.diff'
                    },
                    assignToSource: {},
                    assignToLHS: {},
                    withOptions: {},
                },
                fromSource:{
                    assignToTarget: {},
                    assignToSource: {},
                    assignToLHS: {},
                    withOptions: {},
                },
                fromEvent:{
                    assignToTarget: {},
                    assignToSource: {},
                    assignToLHS: {},
                    withOptions: {},
                }
                //uses ./handlers/nudge.js
                nudge: true,
                // not relevant with assignGingerly
                // as there's no source to draw from
                get: {
                    controller: '?.abortController'
                },
                
            }, //can also be an array
                
        }, {
            from: this, /* this is the Source */
            akaMethods: {'🔍', 'querySelector'}
        });
}
customElements.define('mood-stone', MoodStone);
```

All these AssignDispatchVectors (fromLHS, fromSource, fromEvent, fromTarget) x (assignToTarget, assignToSource, assignToLHS) are there to accommodate all possible combinations of assigning things from "A" to "B", depending on the developer needs.

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

## Too complicated?

Is the use case strong enough to need to support and explain and understand this:

```JS
// works from assignGingerly and assignFrom
// no ?.s on the rhs
assignToTarget: {
    "?.isHappy =!": ".",
    
},
```

and to support the more limited assignGingerly support, which wouldn't have access to the get object?




