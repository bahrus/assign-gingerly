# Reverse Tree

## Bruce's Ask

This is a series of questions to see what gaps exist to be able to use the same itemscope manager whether or not the HTML is generated [in the browser via the tree handler](../../../demos/tree-demo.html) vs server-side rendered.

```html
<details id=details>
    <summary>
    <section itemscope=rocket-manager class="card rocket">
        <h3>Rocket: Falcon 9</h3>
        <div class="spec">
            <span class="label">Height</span>
            <button type="button" class="inc">Increase by one</button>
            <span itemprop=heightLabel></span>
        </div>
        <div class="spec">
            <span class="label">Mass</span>
            <span></span>
        </div>
        <div class="spec">
            <span class="label">Engines</span>
            <span></span>
        </div>
    </section>
</details>
```

```JS
const vm = {
    "id": "demo-0007",
    "flight_number": 7,
    "name": "Demo Mission 7",
    "date_utc": "2026-03-14T15:09:26.000Z",
    "upcoming": false,
    "success": true,
    "details": "Sample payload: a fictional crewed resupply flight used to demonstrate builtIns.tree. All names and values are illustrative.",
    "patch": {
        "small": "./data/mission-patch.svg",
        "alt": "Demo Mission 7 patch"
    },
    "rocket": {
        "name": "Falcon 9",
        "type": "rocket",
        "active": true,
        "stages": 2,
        "height": { "meters": 70, "feet": 229.6 },
        "mass": { "kg": 549054, "lb": 1207920 },
        "engines": {
            "number": 9,
            "type": "merlin",
            "version": "1D+",
            "propellant_1": "liquid oxygen",
            "propellant_2": "RP-1 kerosene"
        }
    },
    "crew": [
        { "name": "Avery Quinn", "role": "Commander", "agency": "Example Space Agency" },
        { "name": "Rowan Okafor", "role": "Pilot", "agency": "Example Space Agency" },
        { "name": "Mika Laine", "role": "Mission Specialist", "agency": "Demo Orbital Institute" }
    ],
    "cores": [
        {
            "serial": "B9007",
            "flight": 4,
            "reused": true,
            "landing_attempt": true,
            "landing_success": true,
            "landing_type": "ASDS"
        }
    ],
    "failures": [],
    "links": {
        "webcast": "https://example.com/webcast/demo-mission-7",
        "article": "https://example.com/articles/demo-mission-7",
        "wikipedia": null
    }
};

/**
 * View model for the rocket card: the raw rocket object is merged in, and the card's
 * patterns read these getters. `metric` is per-card state — setting it calls
 * ctx.rebind(), which re-applies the card's subtree without a tree rerun.
 */
class RocketManager {
    static is = 'rocket-manager';
    #metric = true;
    #extraMeters = 0;
    #rebind;
    constructor(element, initVals, { rebind }) {
        Object.assign(this, initVals);
        this.#rebind = rebind;
    }
    get metric() { return this.#metric; }
    set metric(value) {
        this.#metric = value;
        this.#rebind();
    }
    /** Called by the "Increase by one" button: { on: 'click', call: 'increaseHeightByOne' } */
    increaseHeightByOne() {
        this.#extraMeters++;
        log('RocketManager.increaseHeightByOne', `+${this.#extraMeters} m → ctx.rebind()`);
        this.#rebind();
    }
    get title() { return `Rocket: ${this.name}`; }
    get heightLabel() {
        const { meters, feet } = this.height;
        const extra = this.#extraMeters;
        return this.#metric ? `${meters + extra} m` : `${+(feet + extra * 3.28084).toFixed(1)} ft`;
    }
    get massLabel() {
        return this.#metric ? `${this.mass.kg.toLocaleString()} kg` : `${this.mass.lb.toLocaleString()} lb`;
    }
    get enginesLabel() {
        const { number, type, version, propellant_1, propellant_2 } = this.engines;
        return `${number} × ${type} ${version} (${propellant_1} / ${propellant_2})`;
    }
}

assignFrom(details, {
    '#[rocketManager]': {
        ish: '?.rocket'
    }
}, {
    from: vm,
    pin: {
        rocketManager: {qry: '[itemscope="rocket-manager"]'}
    },
    infer: { byItemprop: true },
    registry: {
        itemscopeRegistry: new ItemscopeRegistry({
            'rocket-manager', RocketManager
        })
    }
})
```

I haven't tried this yet.  Maybe we should.

I think the developer could very well expect that:

```html
<span itemprop=heightLabel></span>
```

would be properly set. Or am I mistaken?

Can you create such a demo page and see?  This is the first of a series of queries.

If it doesn't, how much arm twisting would it take to get it to work?

## Claude's Response

**The demo: [`demos/ssr-manager-demo.html`](../../../demos/ssr-manager-demo.html).** It has your markup and your call, nearly verbatim, and checks what a developer would expect. Three fixes were needed just to make it run:
- `</summary>` was unclosed, so the parser put the whole `<section>` inside `<summary>`;
- `{ 'rocket-manager', RocketManager }` should be `{ 'rocket-manager': RocketManager }`;
- `log` wasn't defined.

**No, `heightLabel` isn't set today.** Nothing in the chain gets that far. I ran it in Chromium:

| Expectation | As written | With the constructor made tolerant (`{ rebind } = {}`) |
|---|---|---|
| `section.ish` is a `RocketManager` | ✗: the constructor throws | ✓ |
| The manager has the rocket's data | ✗ | ✓ (and the local `registry` option was honored) |
| `<span itemprop=heightLabel>` shows `70 m` | ✗ | ✗: still empty |
| The button calls `increaseHeightByOne` | ✗ | ✗ |

### Why: three gaps

1. **`ctx.rebind` only exists under Tree.** Outside Tree, the manager's constructor gets no third argument, so `constructor(element, initVals, { rebind })` throws, and no manager is attached. Tree passes `{ rebind }` because Tree knows how to re-apply the subtree. With server-rendered markup, nothing does.
2. **Nothing binds the manager's own scope.** `infer: { byItemprop: true }` goes the other way round:
   - it iterates the **VM's keys** (`Object.keys(vm)`: `id`, `name`, `rocket`, …), and looks for elements with those itemprops;
   - and it deliberately skips anything inside a nested `itemscope` (the "donut hole").

   `heightLabel` is a getter on the manager, not a key of `vm`, and its `<span>` is inside the section's `itemscope`. So `infer` can't reach it, and that's by design: those itemprops are properties of *that item*, i.e. of the manager.
3. **Events:** server-rendered markup carries no ` +=` config, and nothing in the call declares one.

**So the expectation is reasonable.** In microdata terms, `<span itemprop=heightLabel>` inside `<section itemscope=rocket-manager>` *is* the item's `heightLabel`. Once a manager is the item, the natural reading is "fill the item's itemprops from the manager". That's the reverse of Tree: Tree goes from the spec to the DOM, while here the DOM already exists and only says which properties appear where.

### How much arm twisting: modest, for 1 and 2

Most of the parts exist. The inferencer already does the hard bits:
- it scopes by `itemscope` boundaries;
- it picks the right property per element (`textContent`, `value`, `dateTime`, nested `ish`, …).

What's missing is a **DOM-driven** pass:
- **Iterate the scope's `[itemprop]` elements** (not the source's keys);
- **read each from the manager.** `prop in manager` sees getters, which `Object.keys` doesn't.

**My proposal:**
1. **`ctx` is always passed.** `defineIshCore` always gives the manager `{ rebind }`, with Tree's meaning when Tree attached it, and "re-bind my scope" otherwise.
2. **Scope binding for managers outside Tree.** After each value is assigned to `el.ish`, and on `ctx.rebind()`, every `[itemprop]` in the element's own scope gets `manager[itemprop]`. The rules:
   - **Only names the manager has** (`name in manager`), so unrelated itemprops are left alone;
   - **the inferencer sets the property,** as `infer` does;
   - **a nested `itemscope` with an itemprop gets its `ish`,** so nested managers bind in turn, which is the same donut rule.
3. **Opt-in or default?** I'd make it **opt-in per manager**, with a static flag such as `static bindItemprops = true`, or `bind: 'itemprops'` in its registry config. That way existing managers whose subtrees are filled by other code aren't touched. (Under Tree it's unnecessary, since Tree binds the subtree from the spec.)
4. **Events (gap 3) are a separate design question.** I'd make it the next query in your series. The options I see:
   - **a pattern in the manager's config** (Tree-like, e.g. `{ 'button.inc +=': { on: 'click', call: 'increaseHeightByOne' } }`);
   - **an attribute convention in the server markup;**
   - **leaving it to an enhancement.**

**Effort:**
- **1** is a few lines in `handleIshProperty.ts`, plus tests.
- **2** is a small DOM-driven variant of `processInferredAssignments` (collect the scope's itemprops, then assign them through `Infer`), hooked into `defineIshCore`. Tests would use this demo's markup.

Together that's about the size of the `itemscope` microJoin change: a focused change in two files, with tests, docs, and this demo updated to show ✓ for the first three rows.

**Questions:**
1. **Opt-in:** a static flag on the class (`static bindItemprops = true`), a registry config option (`{ manager, bind: 'itemprops' }`), or both?
2. **Proceed with 1 and 2,** and take events up as the next query?

## Bruce's Response I

You raise a good point I had forgotten about, that  the current message is that infer by itemprop stays out of donut holes.  I'm hesitant to break that "covenant", so I'm thinking that's a good reason to explain why the example above shouldn't work.

I'd like to walk through a few more scenarios before we commit any code changes (maybe I'm being overly ambitious in my ability to come up with such scenarios), so that we adopt a clear strategic approach.

I am thinking that maybe we should keep the existing "covenant" and instead address this like this:

```JS
assignFrom(details, {
    '#[rocketManager] =&': {
        assign: {
            //infers which one from the attribute
            ish: true,
            //if no attribute present or want to override it
            //ish: rocket-manager
            options: {
                from: '?.rocket',
                infer: { byItemprop: true },
            }
            
        } 
        
    }
}, {
    from: vm,
    pin: {
        rocketManager: {qry: '[itemscope="rocket-manager"]'}
    },
    registry: {
        itemscopeRegistry: new ItemscopeRegistry({
            'rocket-manager', RocketManager
        })
    }
})
```

which seems better to you?

I'm very open to suggestions if you think of a better name than "assign" and how it should be structured.

## Claude's Response II

**Yours is better.** It keeps the covenant: `infer` never enters a nested scope *on its own*. Instead, you **explicitly step into** the scope, by targeting the itemscope element itself and binding it against its manager. That's also more general than my per-class flag:
- the choice is per call, not baked into the manager;
- the same manager works under Tree, under this op, or bare.

I'd drop my flag in favor of it.

It also lines up with Tree nicely: **whoever knows how to bind a scope supplies `ctx.rebind()`**.
- **Tree** knows it from the spec.
- **This op** knows it from its own config (`infer`, and a pattern; see below). So its `rebind()` re-runs that.
- **A bare `el.ish = …`** knows nothing, so its `rebind()` is a no-op.

**One part of my proposal I'd still keep: always pass `ctx`** (with a no-op `rebind` when nothing binds). Then a manager written for Tree, with `constructor(el, initVals, { rebind })`, doesn't throw elsewhere, as it does in the demo now. It's a few lines, and it makes managers portable among all three.

### Suggested structure

Your sketch has `options.from: '?.rocket'` doing two jobs: it's what `el.ish` receives, **and** (implicitly) what `infer` binds against. Those need to be different objects. `heightLabel` is a getter on the **manager**, not a field of `vm.rocket`. So I'd separate *the value* from *the binding*:

```JS
'#[rocketManager] =>': {
    do: 'builtIns.adopt',
    ish: true,                 // the manager named by the itemscope attribute; or 'rocket-manager', or a class
    get: { value: '?.rocket' },   // what el.ish receives (default: the whole `from`)
    bind: {                    // applied to the element against the manager: now, after each value, and on ctx.rebind()
        infer: { byItemprop: true },
        pattern: {             // anything infer can't express, e.g. events (gap 3), host = the manager
            '?.querySelector?.button.inc +=': { on: 'click', call: 'increaseHeightByOne' },
        },
        withMethods: ['querySelector'],
    },
}
```

- **`bind` is an `assignFrom` call on the element, with `from` set to the manager.** So it takes the familiar options (`infer`, `pin`, `withMethods`, `aka`, …) plus a `pattern`. That also **solves gap 3 (events)** with no new concept: a ` +=` in the pattern, whose host is the manager, exactly as in Tree.
- **`infer` with `byItemprop: true` needs one fix to see getters.** Today it takes `Object.keys(from)`, which misses a manager's getters. I'd make `true` **element-driven** instead: collect the itemprops in scope, and take each one the source has (`prop in from`). For plain objects that gives the same results, and it still never crosses a nested itemscope, so the covenant is untouched.

### A handler (` =>`) or a sync op (` =&`)?

I'd make it a **handler, `builtIns.adopt`**, rather than a sync op:

| | Handler (`do: 'builtIns.adopt'`) | Sync op (` =&`) |
|---|---|---|
| A manager **not registered yet** (lazy) | It can wait, as `ish` does today | It must already be registered (ops are strictly synchronous) |
| Loading | On first use, like `builtIns.tree` (synchronous after that) | Imported statically into every page that uses ` =&` |
| Fit | Structural work on the DOM, like `tree` and `manageTemplateList` | Ops compute content (`join`, `microJoin`) |
| Resolving the value | The `get` map, as for every handler | The op's resolved arguments |

If you prefer ` =&` for its synchronous guarantee, it can work too, with the "must be registered" limitation.

### The name

"assign" is too general: every key assigns. Some candidates:
- **`adopt`** (my pick). The docs already say "Tree doesn't adopt existing markup", and this is exactly adopting it: the markup exists, and we attach its manager and bind its scope.
- **`hydrate`.** It's familiar from SSR frameworks, but it suggests replacing or reconciling markup, which this doesn't do.
- **`bindScope`.** Accurate, but plainer.
- **`manage`.** It reads well (`manage: { ish: true }`), but it's vague about the binding.

### Before any code: more scenarios

Agreed. Here are ones I'd want this structure to survive, so we can check it against them:
1. **Nested managers in server markup:** an item inside the rocket card with its own `itemscope=…`. Can `bind` on the outer adopt the inner (an `infer` that routes `ish`, or a nested `adopt` in the pattern)?
2. **Repeated server-rendered items** (a list of crew cards, each `itemscope=crew-member-view`). Does one adopt call handle all of them, with a `qry` matching several, or does it need a repeat form?
3. **Mixed:** Tree creates part of a page, and part is server-rendered. Can the same manager class and the same `bind` config serve both?
4. **Re-running with new data:** the same call again with a new `vm`. It should rebind in place, never re-attach, as Tree does.
5. **Values the server already rendered** (e.g. `<span itemprop=heightLabel>70 m</span>`). Should the first bind skip unchanged text (Tree's fast path already does), or should the manager read its initial state *from* the markup?

Scenario 5 is the real "reverse tree" question, and maybe the next in your series.

**Questions:**
1. **The name:** `adopt`, or another?
2. **Handler or sync op?**
3. **`ctx` always passed,** with `rebind` a no-op when nothing binds?
4. **`byItemprop: true` element-driven,** so getters work?

