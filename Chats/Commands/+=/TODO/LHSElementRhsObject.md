# Lhs Element, Rhs Object

---

## Human Ask

When it comes to the += operator, the README.md currently lays out the following rules for how it behaves:

**Behavior by type:**

| LHS type | RHS type | Result |
|----------|----------|--------|
| number | number | addition (`2 += 3` → `5`) |
| string | any | string concatenation (`"hello" += 3` → `"hello3"`) |
| array | array | array concatenation (`[1,2] += [3,4]` → `[1,2,3,4]`) |
| array | non-array | push single item (`[1,2] += 3` → `[1,2,3]`) |
| undefined/missing | any | direct assignment |

This proposal is to deal more carefully with the scenario that the LHS resolves to a DOM Element, and the RHS is an Object.

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
            '?.🔍?.button +=': {
                get: {
                    controller: '?.abortController'
                },
                on: 'click', //default based on inferencer
                // works from assignGingerly and assignFrom
                assignToTarget: {
                    "?.isHappy =!": ".",
                    "?.age +=": '?.dataset.diff'
                },
                // works from assignGingerly and assignFrom
                assignToSource: {},
                assignToLHS: {},
                withOptions: {},
                //works from assignFrom or assignGingerly asynchronously
                fromLHS: {
                    assignToTarget: {},
                    assignToSource: {},
                    assignToLHS: {},
                    withOptions: {},
                },
                //works from assignFrom or assignGingerly asynchronously
                fromSource:{
                    assignToTarget: {},
                    assignToSource: {},
                    assignToLHS: {},
                    withOptions: {},
                },
                //works from assignFrom only because async
                fromEvent:{
                    assignToTarget: {},
                    assignToSource: {},
                    assignToLHS: {},
                    withOptions: {},
                }
                //uses ./handlers/nudge.js
                nudge: true,
                
            }, //can also be an array
                
        }, {
            from: this, /* this is the Source */
            akaMethods: {'🔍', 'querySelector'}
        });
}
customElements.define('mood-stone', MoodStone);
```

### Location of module(s) to support this

I was originally proposing this functionality to be done with a traditional assignFrom handler, but this current approach involves a lot less ceremony, for an extremely common task.

Nevertheless, I think the module, addEventListener.js perhaps, should reside in the handlers folder.

Because of the support for nudge, and since events are not expected to fire right away, and because "assigning" the event handler won't be used by subsequent calls, I think this whole functionality can be loaded asynchronously on demand, and use fire and forget.  To avoid unnecessary awaits, cache the import once it is done the first time.

This could pose problems, though, when working from fromEvent.  This can't be asynchronous from the capturing of the event, so should only be available from assignFrom. 

assignGingerly would also support this (but not the get).  Because the mode switches to async with this fire and forget handoff, the += handler could dynamically load assignFrom on demand.

I don't think an abortController / signal should be required, because typically, the handler goes away when the container does.

I've added some preliminary typing for this handler in the [types/assign-gingerly/types.d.ts file](../../../../types/assign-gingerly/types.d.ts).

## Preventing Duplicate Event Handlers

In scenarios where the same assign needs to be called multiple times, perhaps with different options / assignments, and only the last call should prevail, we need a way of identifying that.  I'm thinking another parameter to be added to get:

```JS
'?.🔍?.button +=': {
    get: {
        controller: '?.abortController',

    },
```




