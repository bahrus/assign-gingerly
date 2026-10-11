# TreeScope

## Bruce's Ask

This is brainstorming to replace the ItemscopeTree handler with two handlers:

A readonly "Tree" handler, inspired by h.

A read/write "TreeScope" handler that replaces [ItemscopeTree](../ItemscopeTree/), where the configuration can be JSON based.


## Phase I Readonly Tree

```html
<details id=api-response>
    <summary>API Response</summary>
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
    "details": "Sample payload: a fictional crewed resupply flight used to demonstrate builtIns.itemscopeTree. All names and values are illustrative.",
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
class HElement {
    static attrs = {};
    static children = [];
    static a(name, value){
        this.attrs[name] = value;
        return this;
    }
    static c(children){
        this.children = [...this.children, ...children];
    }
    #weakRef;
    get ref(){
        return this.#weakRef.deref();
    }
    constructor(el){
        this.#weakRef = new WeakRef(el);
    }
}

class Div extends HElement{
    static tag = 'div';
}

class TextInput extends HElement {
    static tag = 'input';
    static attrs = {type: 'text'}
}

class Img extends HElement {
    static tag = 'img';
}

interface Patch {
    small: string,
    alt: string,
}

class Patch extends Img {
    static onAssigned(instance, value: Patch, ctx){
        const {small: src, alt} = value;
        Object.assign(instance, {src, alt});
    }
}

await assignFrom(document.getElementById('api-response'), {
    '?. =>': {
        do: 'builtIns.Tree',
        map: {
            patch: Patch
        }
    }
}, {
    from: vm
})
```

Phase I again doesn't consider what happens on a second call.

Please provide below only very high level concerns / pushback / clarifications needed to start with, in case I missed something big or wasn't clear due to a typo or something bigger.

---

## Claude's High-Level Concerns

### Likely bugs / typos in the sketch

1. **The static builder state is shared through inheritance.** `Div` has no `attrs` of its own, so `Div.a('class', 'x')` writes into `HElement.attrs`. Every subclass without its own `attrs` then gets `class="x"`. And since the class *is* the config, two uses of `Div` with different attributes can't coexist. I suspect the intent is for `a()` / `c()` to **return a new derived class** each time (`class extends this { static attrs = { ...super.attrs, [name]: value } }`), so that `Div.a('class', 'spec')` is a fresh, immutable "element spec". Is that right?
2. **`c()` doesn't `return this`**, unlike `a()`, so chaining breaks after it.
3. **`Patch.onAssigned` writes `src`/`alt` onto the manager instance, not the `<img>`.** It should be `instance.ref`, unless the plan is for `HElement` to forward properties to its element. That would be a significant design choice in itself.
4. **`interface Patch` + `class Patch`** in the same scope triggers TypeScript declaration merging, so `Patch` instances are typed as having `small`/`alt`. That's probably unintended. Something like `PatchData` would avoid it.
5. **`await assignFrom(...)`:** the sync `assignFrom` loads handlers with a fire-and-forget `import().then(...)`, so the tree won't exist yet when the `await` resolves. Did you mean `assignFromAsync`?
6. **Naming:** `builtIns.Tree` breaks the existing camelCase convention (`builtIns.itemscopeTree`, `builtIns.microDataJoin`). Also, the folder is `Treescope` but the file is `TreeScope.md`, which is harmless on Windows but can break links on case-sensitive systems.

### Clarifications needed

7. **What does "readonly" mean for Tree?** One-way VM → DOM, with no `ish` and no write-back? If so, why do the classes have `onAssigned(instance, …)` and a manager instance (`ref`) at all? Or is "readonly" only about not reacting to later VM changes? This decides whether Tree depends on the itemscope / `ish` machinery or is fully standalone.
8. **What does the tree do with unmapped keys?** The example maps only `patch`. Are the other 14 keys ignored (as `map` does today), or is there a default rendering (`h`-style: strings → text, objects → nested elements)? "Inspired by h" suggests a default rendering; the example suggests the opposite.
9. **How do `children` bind to the VM?** `static children` is a flat list with no link to sub-keys. How would `rocket.height` or the `crew[]` array be expressed? Nesting and arrays are where the ItemscopeTree demo got painful, so the Phase I design should at least sketch them, even if it doesn't implement them.
10. **Why `WeakRef`?** The element → manager (`ish`) → element cycle doesn't leak, because GC handles cycles. `WeakRef` adds a `deref()` that can return `undefined`, so every access needs a guard. It only earns its keep if something long-lived (a registry or cache) holds managers. Does something?
11. **Identity on the second call.** Deferring re-run semantics is fine, but Phase I should still stamp *something* (`itemprop=<key>`?) on created elements. Otherwise Phase II has no way to find them without a breaking change.

### Pushback on the split

12. **Tree's class-based config vs TreeScope's "JSON-based" config.** Classes aren't JSON. If TreeScope is JSON, its entries must be **names resolved through a registry**, which is what ItemscopeTree's string entries already are. That makes it worth spelling out what TreeScope gains over ItemscopeTree beyond a rename, and whether Tree's `HElement` specs will be registrable by name, so that one shape works in both handlers.
13. **Replacing ItemscopeTree:** it's documented, tested, and has a demo. Do you want to **deprecate** it once TreeScope reaches parity, or delete it outright? That decides whether TreeScope has to be backward compatible with ItemscopeTree's `map` semantics (class / string entries, `<Key>ISM` convention, always setting `itemprop`).

## Bruce's Response -- high level corrections

Good points.

First, I want to be 100% clear -- despite tests, documentation, etc, if this alternative approach proves better, there is not yet any package that depends on ItemscopeTree, so I'm thinking one of these approaches will prevail, which means we will totally rollback the other, including documentation and tests, no backwards compatibility technical debt whatsoever.  But we will do that when if/when we get there.  For now, they co-exist in parallel.

Second, the readonly distinction might be a little too vague.  Let's see how this plays out, as we dig deeper.  At a minimum, I'm thinking that the Tree handler doesn't attempt to add microdata, and also has no interest in being able to seamlessly transition from server-rendered html.  The basic idea is that Tree starts from being able to handle simple scenarios, and there may be a line drawn where "beyond that, we move on to TreeScope".

Does this make more sense?:

```JS
interface Attrs = Record(string, string);
class HElement {
    // gets merged into instances
    static attrs: Attrs : undefined;
    //gets merged into instances
    static children = [];
    attrs: Attrs: undefined;
    a(attrs){
        return this;
    }
    children = [];
    c(children){
        this.children = [...this.children, ...children];
        return this;
    }
    #weakRef;
    get ref(){
        return this.#weakRef.deref();
    }
    constructor(el){
        this.#weakRef = new WeakRef(el);
    }
}

class Div extends HElement{
    static tag = 'div';
}

class TextInput extends HElement {
    static tag = 'input';
    //this gets merged into attrs
    static attrs = {type: 'text'}
}

class Img extends HElement {
    static tag = 'img';
}

interface Patch {
    small: string,
    alt: string,
}

class Patch extends Img {
    //might only be called once for Tree, but we will see 
    //as we dig further
    static onAssigned(instance, value: Patch, ctx){
        const {small: src, alt} = value;
        Object.assign(instance.ref, {src, alt});
    }
}

await assignFrom(document.getElementById('api-response'), {
    '?. =>': {
        do: 'builtIns.Tree',
        map: {
            patch: [Patch,
                // optional 
                { 
                    a: {'data-test', 'hello'},
                    // doesn't really make sense for the image element
                    c: ['template', {
                        a: {},
                        c: []
                    }]
                }
            ],
            // if not specified, non keys are ignored for Tree
            '*': TBD
        }
    }
}, {
    from: vm
})
```

## Claude's Follow-up

Yes, this makes more sense. The parallel / winner-takes-all plan and the scope of Tree (no microdata, no hydration, simple cases, with TreeScope beyond that) answer #7 and #13. Moving per-use config into the `map` tuple fixes the shared static state from #1. Remaining high-level points:

1. **There are now two places to configure an element: instance `a()`/`c()` and the map tuple `{ a, c }`.** The instance is constructed with the element, so `a()`/`c()` on it would run *after* the element exists. What would call them, and when? I'd suggest a single model:
   - `static tag` / `static attrs` / `static children` hold the **class defaults**;
   - the tuple's `{ a, c }` is the **per-use override**, merged over the defaults at creation time;
   - the instance carries no builder methods, only `ref` and whatever behavior it adds.

   A side benefit is that the tuple's second element is pure JSON. That gives Tree and TreeScope a natural point of convergence later (#12).
2. **The node-spec grammar needs pinning down.** `c: ['template', { a: {}, c: [] }]` is ambiguous: is it **one** child (tag + options, the same shape as the `[Patch, {…}]` tuple), or **two** children (a `'template'` and an anonymous object)? I'd suggest defining one recursive type and using it everywhere:

   ```ts
   type NodeSpec = string /* tag */ | HElementClass | [string | HElementClass, { a?: Attrs; c?: NodeSpec[] }];
   ```

   Then `c` is always a list of `NodeSpec`s, so the example becomes `c: [['template', { a: {}, c: [] }]]`.
3. **There's still no link between children and the VM (#9).** In the sketch, `c` describes **static** structure. How does a child get a value: `rocket.height`, or one `<li>` per `crew[]` item? Even if Phase I only does static children, it's worth deciding now whether VM-driven nesting happens by recursion (a child spec is itself a `map` over the parent's value) or by delegation (for example, arrays go to `manageTemplateList`).
4. **Who constructs the instance, and is `ish` involved?** With no microdata, I'd assume Tree does `new Patch(el)` itself and calls `onAssigned` directly, with no itemscope registry and no `ish`. If so, `onAssigned` could simply be an instance method, `onAssigned(value, ctx)`, since the static `(instance, …)` form only existed to fit the `ish` machinery. Please confirm, because this decides whether Tree depends on `handleIshProperty` at all.
5. **The second call.** With no attributes stamped (no `itemprop`), the only options for a rerun are "clear and rebuild" or "Tree remembers what it created", for example in a `WeakMap<target, Map<key, element>>`. Both fit "simple scenarios"; it's just worth choosing one so Phase I doesn't block it. The same choice also answers #10: if Tree keeps that `WeakMap`, the instance doesn't need a `WeakRef` to its own element.
6. **Small things still open from before:** `await assignFrom` vs `assignFromAsync` (#5), `interface Patch` merging with `class Patch` (#4), and a few typos in the sketch: `interface Attrs = Record(...)` should be `type Attrs = Record<string, string>`; `static attrs: Attrs : undefined` should be `static attrs?: Attrs`; `{'data-test', 'hello'}` should be `{'data-test': 'hello'}`.

