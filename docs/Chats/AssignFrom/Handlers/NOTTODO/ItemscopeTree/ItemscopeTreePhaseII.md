# Itemscope Tree Phase II

## Bruce's Ask

This is Phase II of the [ItemscopeTree requests](./ItemscopeTreePhaseI.md).

### Typing

Please define an interface in types/assign-gingerly.d.ts for the context:

```TS
interface ItemscopeInstantiatorContext {
     target: lhsTarget, key, from, options, registry 
}
```

I'm okay with an executive decision for a better name.

Can you add some instructions to Claude so that any such scenarios will get a type like this?

### FieldMapping

#### Scenario I -- Class Instance, not JSON serializable.

```TS
const vm = {
    mission: {

    },
    image: {
        url: 'https:...',
        description: 'Lunar Surface'
    }
}

class ImageHandler {
    static instantiate(image: Image, ctx: ItemscopeInstantiatorContext){
        const img = document.createElement('img');
        const {url, description} = image;
        img.src = url;
        img.alt = description;
        return img;
    }
}

class MissionManager {
    static instantiate(mission: Mission, ctx: ItemscopeInstantiatorContext){
        ...
    }
}


await assignFrom(document.getElementById('api-response'), {
    '?. =>': {
        do: 'builtIns.ItemscopeTree',
        map: {
            image: ImageHandler,
            filler: class Filler{static instantiate(){return document.createElement('br')}},
            mission: MissionManager
        }
    }
}, {
    from: vm
})
```

The mapping automatically does:

```JS
const name = map[key].name;
if(!registry.get(name)){
    registry.define(name, map[key]);
}

```

In the itemscope attributes will be (in this case) "ImageHandler", "MissionManager"

The order of the DOM creation, appendChild, is dictated by the order in the map, not the vm.

If the vm doesn't have a key, like the filler, create it anyway, passing in undefined.

The presence of the map means don't iterate through the keys of the vm at all.

#### Scenario II -- String

```TS
const vm = {
    mission: {

    },
    image: {
        url: 'https:...',
        description: 'Lunar Surface'
    }
}

class ImageHandler {
    static instantiate(image: Image, ctx: ItemscopeInstantiatorContext){
        const img = document.createElement('img');
        const {url, description} = image;
        img.src = url;
        img.alt = description;
        return img;
    }
}

class MissionManager {
    static instantiate(mission: Mission, ctx: ItemscopeInstantiatorContext){
        ...
    }
}

customElements.itemscopeRegistry.define('ImageManger', {
    manager: ImageHandler
});


await assignFrom(document.getElementById('api-response'), {
    '?. =>': {
        do: 'builtIns.ItemscopeTree',
        map: {
            image: 'ImageManager',
            mission: MissionManager
        }
    }
}, {
    from: vm
})
```

Please add your thoughts / concerns / clariications needed below, or if none, the implementation notes below.


---

## Feedback / Questions

### Typing

**The type already exists.** Phase I added it to `types/assign-gingerly/types.d.ts` as `ItemscopeTreeContext` (`target`, `key`, `from`, `options`, `registry`), and `ItemscopeManager` gained an optional `static instantiate(value, ctx: ItemscopeTreeContext)`.

**Naming decision:** rename it to **`ItemscopeInstantiateContext`**. The type describes the contract of the manager's static `instantiate` method, not the handler that happens to call it. Naming it after the method means it still fits if anything else ever calls `instantiate`. It's close to your `ItemscopeInstantiatorContext`, but there's no "instantiator" object in the design, only the method. I'd keep `ItemscopeTreeContext` as a deprecated alias for one release, since it was exported in 0.0.97.

**Instructions for Claude:** `CLAUDE.md` defers to `AGENTS.md` for conventions, so I'd add the following to the "Types Location" section of `AGENTS.md`:

> - **Callback / hook contexts get a named type.** Whenever library code calls a user-supplied function or method (a static `instantiate`, a handler's `assign`, a protocol handler, an event callback) with a context or parameter object, define an exported interface for that object in `types.d.ts`. Name it after the method it's passed to (e.g. `ItemscopeInstantiateContext`), and reference it in that method's signature. Never pass an anonymous object literal type.

### Scenario I — class values in `map`

1. **`do: 'builtIns.ItemscopeTree'` (capital I).** The built-in is currently `builtIns.itemscopeTree`. Is that a typo, or do you want to rename it? I'd keep the lowercase form, to match the other built-ins.

2. **Typos to confirm.** I assume these were slips:
   - The `map` uses `MissionHandler`, but the class shown is `MissionManager`, and you expect `itemscope="MissionManager"`.
   - In Scenario II, `define('ImageManger', …)` vs `map: { image: 'ImageManager' }`. As written, the lookup would miss.

3. **`registry.define(name, map[key])`.** `define` takes a config object, so this would be `registry.define(name, { manager: map[key] })`. I'm assuming that, and that it defines into the same registry Phase I resolves (the target's scoped registry first, then the global one).

4. **Relying on `Class.name`.** This is my main concern.
   - **Minification** renames classes (`class e{}`), so `itemscope="e"` would appear in production. Worse, unrelated classes from different bundles can minify to the same short name.
   - **Name collisions:** two different classes both called `Handler` (from different modules) would share one registry entry. As written, the second would silently use the first's manager.
   - **Anonymous classes:** `filler: class { … }` gets `name === 'filler'` from the property, which is fine. But a class created elsewhere and passed through can have `name === ''`.

   Proposal:
   - If `registry.get(name)` exists and its `manager !== map[key]`, **throw** with a clear message ("itemscope name "X" is already registered to a different class").
   - If `name` is empty, throw.
   - Document that the class name becomes the public itemscope name, so production builds should keep class names (e.g. `keep_classnames`), or use the string form from Scenario II.

   Does throwing (rather than warning) suit you?

5. **The same class under two keys.** For example, `{ hero: ImageHandler, thumb: ImageHandler }`. Both elements get `itemscope="ImageHandler"`. Phase I skips a key when a direct child already has that `itemscope` value, so **`thumb` would never be created.** The duplicate check needs to identify the *key*, not the manager. Options:
   - (a) When `map` is present, always set `itemprop=<key>` and check for duplicates on `itemprop`. This relaxes your Phase I rule of "itemprop only when the target has itemscope". An `itemprop` outside any item is valid HTML; it just doesn't belong to an item.
   - (b) Check duplicates on the pair (`itemscope`, `itemprop`), and only allow the same class under multiple keys when the target has `itemscope`. Otherwise throw.
   - (c) Mark generated elements with a `data-` attribute holding the key.

   I lean toward (a), because it also gives Phase III (updates) a reliable key → element lookup that survives server-side rendering.

6. **Which values are passed.** Phase I only instantiated non-array objects. With an explicit `map`:
   - `undefined` (your `filler` case) gets passed through, as you said.
   - Should primitives and arrays also be passed through? I'd say yes: the `map` is an explicit opt-in, so `instantiate` decides what to do with them.

7. **`ish` when the value isn't an object.** The `ish` setter merges values as `Object.assign({}, ...values)`. With `undefined` that works (an empty `initVals`), but a string would get spread into its characters. Proposal: always instantiate the manager, so there is an instance to update later, and pass the value as `initVals` only when it's a non-array object, otherwise `{}`. Is that OK, or should non-object values skip the `ish` manager entirely?

8. **Order.** Elements are appended in `Object.keys(map)` order, as you said. One JavaScript caveat: integer-like keys (`'1'`, `'2'`) always come first, in numeric order, whatever order they were written in. I'll just document it.

9. **`map` vs `get` / `resolve`.** `map` holds class references, so it's read from the handler config (`this.config.map`) as-is and never resolved against the VM. The handler constructor already receives the config, so `processHandlerCommands` needs no changes.

### Scenario II — string values in `map`

10. **An unregistered name** gets skipped without waiting, consistent with Phase I. Agreed?

11. **`itemscope` value.** It's the string itself (`itemscope="ImageManager"`), and there's no automatic definition.

12. **Mixing** strings and classes in one `map` works per entry. A class whose `name` equals a string used elsewhere is caught by the "different class" check in point 4.

### Without `map`

13. Phase I behavior is unchanged: iterate the VM and use the `<Key>ISM` convention. Agreed?

### Proposed type

```ts
export interface ItemscopeTreeConfig extends HandlerConfig {
    do: 'builtIns.itemscopeTree';
    /** Ordered key → manager (class, auto-defined under its .name) or registered itemscope name. */
    map?: Record<string, ItemscopeManager | string>;
}
```

Once you've answered these, I'll write the implementation notes, or implement directly if the answers don't change the shape.

## Bruce's Response I

> The type already exists

Great, I missed it, sorry.  Ignore that whole section then.

> 1. **`do: 'builtIns.ItemscopeTree'` (capital I).**

My bad again.  No change, typo.

> 2. **Typos to confirm.** 

Confirmed.  Typos.

> 3.

Agreed.

> 4.

Good point.  We should document that for a reliable name, export the class.  That would make it stable, correct?

I agree with your proposal.

> 5.

I agree.  5a.

> 6-7.  **Which values are passed.**

I was actually going to create another document to reverse course on my earlier recommendation that we only support non array objects.  I think we should treat all types the same.  Will that work okay?

You almost destroyed that request when you brought up how to merge in updates.  

Can we make sure that the logic that merges in ish values looks for the static onAssigned, and if not found, lets strings get spread into characters (at least the developer has a way to fix it)?

Sorry for all the typos.

Let's do at least one more round of making sure we are on the same page before implementing.  You raised great points.
---

## Feedback / Questions II

No apology needed. Below I go through each of your answers, then the open points.

### 4. Does exporting the class make `Class.name` stable?

**Unfortunately not.** `export` keeps the *binding* name only at a bundle's public boundary, i.e. when the module is the entry point of a library build. Inside an application bundle, exported classes are ordinary internal identifiers:

- **Minifiers rename them.** esbuild (`--minify`) and terser rename class declarations unless told not to, giving `class e{}` and `e.name === 'e'`.
- **Even without minification, bundlers rename on collisions.** Rollup and esbuild "scope-hoist" all modules into one scope. If two modules each declare `ImageHandler`, one becomes `ImageHandler$1` or `ImageHandler2`, and its `.name` changes too.

The reliable options are:
1. **A build setting:** esbuild `keepNames: true`, or terser `keep_classnames: true`. This keeps `.name`, but the developer has to remember it, and it doesn't fix the collision rename.
2. **An explicit static name on the class.** I propose the handler looks for it first:
   ```ts
   class ImageHandler {
       static itemscope = 'ImageHandler';
       static instantiate(image, ctx) { ... }
   }
   ```
   The name is resolved as **`map[key].itemscope ?? map[key].name`**. Builds don't affect it, and the code still works without it, falling back to `.name`.

So the documentation would say: "the class name becomes the public itemscope name; for a name that survives bundling, declare `static itemscope = '…'`, or use the string form." Is the name `static itemscope` OK? I picked it because it matches the attribute it ends up in. An alternative is `static itemscopeName`.

The throw rules from point 4 still apply to the resolved name: throw if it's empty, or if it's already registered to a different class.

### 5. Agreed: 5a

When `map` is present, `itemprop=<key>` is always set, and duplicates are detected on `itemprop` among the direct children.

**Follow-up:** without `map`, should duplicates still be detected on `itemscope` (Phase I), or should we switch to `itemprop` there too? That would also mean always setting `itemprop` there. I'd keep Phase I as is: there, a key maps 1:1 to a `<Key>ISM` name, so the collision can't happen. But having one rule everywhere is also appealing. Your call.

### 6–7. Treat all value types the same: yes, it works

Here is what happens today for each value type, measured against the current code:

| Value | `Object.assign({}, v)` (used for `initVals` on first set) | `assignGingerly(instance, v)` (later sets) |
|---|---|---|
| `'ab'` | `{0:'a', 1:'b'}` | `{0:'a', 1:'b'}` |
| `['x','y']` | `{0:'x', 1:'y'}` | `{0:'x', 1:'y'}` |
| `42`, `true` | `{}` | no-op |
| `null`, `undefined` | `{}` | **throws** "Cannot convert undefined or null to object" |

So "spread strings into characters" already happens by default. The one real problem is `null`/`undefined` on a **later** set, which would throw inside the async queue. Proposal: without `onAssigned`, skip the merge for `null`/`undefined` (nothing to merge). Everything else behaves as in the table.

What this changes:
- **itemscopeTree, with and without `map`:** the "non-array object" filter goes away, and every value, including `null`/`undefined`, is passed to `instantiate`. (Without `map`, keys only exist if they're in the VM, so `undefined` only shows up if the VM literally has `key: undefined`.) The Phase I tests that assert skipping for arrays, primitives and `null` get rewritten to assert that they're passed.
- **`handleIshProperty`** (the `assignGingerly(el, { ish: v })` path) currently **throws** "ish property value must be an object". For consistency, I'd remove that check so both paths accept anything. Agreed?

### `static onAssigned`: proposal

This changes the `ish` setter in `defineIshCore`, so it affects **every** `ish` user, not just itemscopeTree. I think that's what you want.

```ts
class ImageHandler {
    constructor(element, initVals) { ... }
    static onAssigned(instance: ImageHandler, value: any, ctx: IshAssignContext) {
        // developer decides how a value (string, array, object, undefined…) is applied
    }
}

/** In types.d.ts — named per the new AGENTS.md rule */
export interface IshAssignContext {
    /** The element whose `ish` was set */
    element: HTMLElement;
    /** Whether this is the value that constructed the instance */
    initial: boolean;
    /** The options in effect */
    options: IAssignGingerlyOptions | undefined;
}
```

Behavior when `manager.onAssigned` exists:
- **First set:** `new Manager(element)`, with **no `initVals`**. Then `Manager.onAssigned(instance, value, { initial: true, … })`. This gives the developer a single code path for both the first value and updates.
  - If several values were queued before construction (the lazy-registration path in `defineIshProperty`), `onAssigned` is called once per value, in order, rather than merging them first.
- **Later sets:** `Manager.onAssigned(instance, value, { initial: false, … })`, in place of `assignGingerly`.
- **Return values:** if it returns a Promise, it's awaited inside the existing queue, so values stay in order. The first call remains synchronous unless `onAssigned` itself is async.

Behavior when it doesn't exist: unchanged (the table above), plus the null/undefined skip.

Questions:
- **A.** Should the constructor get no `initVals` when `onAssigned` exists? The alternative is passing `initVals` *and* calling `onAssigned`, but then the developer has to avoid applying the value twice. I recommend no `initVals`.
- **B.** Is the `ctx` shape OK, and the name `IshAssignContext`?
- **C.** Should this go in as part of Phase II, or as its own small change first? It's independent of `map`, so landing it separately keeps each diff easy to review. Same chat doc, two commits?

### 13. Without `map`

You didn't comment, so I'm assuming the Phase I behavior stands (VM iteration + `<Key>ISM`), apart from the value-type change above.

### Open items, summarized

1. `static itemscope` (or a different name) as the override for `.name`.
2. Duplicate detection without `map`: keep `itemscope`, or switch to `itemprop`?
3. Remove the "must be an object" check in `handleIshProperty`?
4. `onAssigned`: A (no `initVals`), B (ctx shape and name), C (separate step or not).
5. Skip the merge for `null`/`undefined` when there's no `onAssigned`.
6. **Typing section:** you said to ignore it. Does that include the proposed `AGENTS.md` rule ("context objects passed to user-supplied methods get a named interface in `types.d.ts`")? That was your original ask, so I'd still add it, and keep the existing `ItemscopeTreeContext` name.

## Bruce's Response II

> **Follow-up:** without `map`, should duplicates still be detected on `itemscope` (Phase I), or should we switch to `itemprop` there too? That would also mean always setting `itemprop` there. I'd keep Phase I as is: there, a key maps 1:1 to a `<Key>ISM` name, so the collision can't happen. But having one rule everywhere is also appealing. Your call.

I agree with your recommendation.  Leave as is.

Regarding the name, I think we should go with this approach, that you suggested:

```ts
class ImageHandler {
    static itemscope = 'ImageHandler';
    static instantiate(image, ctx) { ... }
}
```

> Proposal: without `onAssigned`, skip the merge for `null`/`undefined` (nothing to merge). Everything else behaves as in the table.

Sounds good.

> - **`handleIshProperty`** (the `assignGingerly(el, { ish: v })` path) currently **throws** "ish property value must be an object". For consistency, I'd remove that check so both paths accept anything. Agreed?

Agreed.

> This changes the `ish` setter in `defineIshCore`, so it affects **every** `ish` user, not just itemscopeTree. I think that's what you want.

It is.

> Questions:
> - **A.** Should the constructor get no `initVals` when `onAssigned` exists? The alternative is passing `initVals` *and* calling `onAssigned`, but then the developer has to avoid applying the value twice. I recommend no `initVals`.
> - **B.** Is the `ctx` shape OK, and the name `IshAssignContext`?
> - **C.** Should this go in as part of Phase II, or as its own small change first? It's independent of `map`, so landing it separately keeps each diff easy to review. Same chat doc, two commits?

I agree with your recommendations, but if it is easy to do, let's make this discussion be Phase III so I can think about it a little further.

> You didn't comment, so I'm assuming the Phase I behavior stands (VM iteration + `<Key>ISM`), apart from the value-type change above.

Yes, naming convention still stands.

> 6. **Typing section:** you said to ignore it. Does that include the proposed `AGENTS.md` rule ("context objects passed to user-supplied methods get a named interface in `types.d.ts`")? That was your original ask, so I'd still add it, and keep the existing `ItemscopeTreeContext` name.

Sure, it is important to me.  It was done anyway, but I think erring on the side of being explicit seems like a good idea.

If no more clarifications needed, please proceed with implementation, and include notes below.  Otherwise, please list what I may have missed below.


---

## Implementation Notes

Everything agreed above is implemented. `onAssigned` has moved to [Phase III](./ItemscopeTreePhaseIII.md), which is written up for your review and not implemented.

### Changes

| File | Change |
|------|--------|
| `handlers/itemscopeTree.ts` | `map` support (see "Behavior" below); every value type is passed through; header doc rewritten |
| `handleIshProperty.ts` | Removed the "ish property value must be an object" check; later `null`/`undefined` sets are skipped; **bug fix** in the setter (see below) |
| `types/assign-gingerly/types.d.ts` | `ItemscopeManager.itemscope?: string` (static name override); `ItemscopeTreeConfig.map?: Record<string, ItemscopeManager \| string>` |
| `AGENTS.md` | New "Types Location" rule: callback/hook contexts get a named exported interface in `types.d.ts` |
| `tests/itemscope-tree.html` | Rewrote the skip test (arrays, strings and `null` are now passed through) and added `map` tests: **49 assertions** (was 24) |
| `tests/itemscope-managers.html` | Comments only: Tests 12–13 were documented as "throws" but asserted nothing; they now describe the new behavior |
| `README.md` | itemscopeTree section: value types, a `map` subsection, the bundler/`static itemscope` note, the integer-key ordering caveat; the ish "Validation" section updated |

### Behavior

- **Without `map`:** unchanged from Phase I (VM iteration, `<Key>ISM`, duplicates detected by `itemscope`), except that every value type is passed through.
- **With `map`:**
  - Only the map's keys are processed, in map order. `from?.[key]` is passed, so a key missing from the VM gets `undefined`.
  - **Class entry:** the name is resolved as `Class.itemscope ?? Class.name`.
    - It throws if the name is empty, or if it's registered to a different class.
    - If it isn't registered yet, `registry.define(name, { manager: Class })` runs, in the same registry Phase I resolves (the target's scoped registry first, then the global one).
  - **String entry:** `registry.get(name)`. If the name isn't registered, the key is skipped without waiting.
  - **Anything else:** throws.
  - `itemprop=<key>` is always set, and duplicates are detected by `itemprop` among direct children (5a).
  - `from` may be absent when `map` is used. Without `map`, a non-object `from` is still a no-op.
- **Errors** are thrown synchronously from `assign()`, so they reject the `assignFromAsync` promise.

### Bug found and fixed: `ish = null` as the first value

The `ish` setter starts with `managerInstance = null` and has an early `if (newValue === managerInstance) return;`, there to ignore re-setting the same instance. With `null` now allowed, a **first** set of `null` matched that check, and the manager was never constructed. The check is now `managerInstance !== null && newValue === managerInstance`.

### Verified

- `tsc --noEmit -p .` is clean.
- `npx playwright test itemscope`: 6/6 (chromium, firefox, webkit). itemscope-tree is 49/49, itemscope-managers 22/22.
- Full `npx playwright test`: **114/114 passed**.

The `.js` files were regenerated by your running `tsc` watcher; I didn't edit any.
