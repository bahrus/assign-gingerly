# Tree Phase II - A formal View Model Integration

## Bruce's Ask

The way a previous iteration [tree-demo.html](../../../../demos/tree-demo.html) worked is it took the [raw data retrieved from the api call](../../../../demos/data/launch.json), and it ran it through a "toViewModel" method that replaces the raw data with a similar structure, that is completely tailored to binding the UI to it.

This approach was replaced by "pipes" which allows a formal way to apply computed values that derive from the raw data.  There is still a minimal "currentVm()" left over.

The pipes look as follows:

```JS
const pipes = {
    parseDate: Date.parse,
    longUtc: new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }).format,
    metersLabel: ({ meters }) => `${meters} m`,
    feetLabel: ({ feet }) => `${feet} ft`,
    kgLabel: ({ kg }) => `${kg.toLocaleString()} kg`,
    lbLabel: ({ lb }) => `${lb.toLocaleString()} lb`,
    coreSummary: ({ serial, flight, reused, landing_success, landing_type }) =>
        `${serial}, flight ${flight}${reused ? ' (reused)' : ''}; landing: ${landing_success ? 'success' : 'not successful'} (${landing_type})`,
    linkList: links => Object.entries(links)
        .filter(([, href]) => typeof href === 'string') // wikipedia: null → skipped
        .map(([name, href]) => ({ name, href })),
};
```

This is a perfectly fine solution, but some of these, like the metersLabel and feetLabel, I had the vague sense in my mind that those could be defined via computed properties of an itemscope manager.

The support we have so far for attaching itemscope managers works well for hydrating server rendered HTML, similar to custom attributes used to signify associated enhancement classes to instantiate, via the mount-observer.

But assign-gingerly provides a far more ergonomic way of attaching enhancements to existing elements, via the *.enh.set.myEnhancement approach, for one.

If I'm not mistaken, we definitely do not have that ability for attaching an itemscope managers.  The only way is to add the named itemscope attribute, which is quite clunky and not very performant within the context of assign gingerly, and thus DOM tree creation.

My vague (at this point) sense is that we should be able to define something similar to pipes that allows us to attach one and only one itemscope manager to an element.

So I'm thinking something like:

## Approach I -- Non JSON Serializable

```JS

class RocketManager {
    static is = 'rocket-manager';
}

const pattern = {
    ...
    rocket: ['section', { className: 'card rocket', ish: RocketManager }, 
    // [
    //     ['h3', { 'textContent =&': { join: ['Rocket: ', '?.name'] } }],
    //     spec('Height', { 'textContent ?=': ['$root?.ui?.metric', '?.height?.metersLabel', '?.height?.feetLabel'] }),
    //     spec('Mass', { 'textContent ?=': ['$root?.ui?.metric', '?.mass?.kgLabel', '?.mass?.lbLabel'] }),
    //     spec('Engines', { 'textContent =&': { join: [
    //         '?.engines?.number', ' × ', '?.engines?.type', ' ', '?.engines?.version',
    //         ' (', '?.engines?.propellant_1', ' / ', '?.engines?.propellant_2', ')',
    //     ] } }),
    // ]
    ],
}
```

So "ish" would be a specially treated property in this case.  This would take care of registering the class.  Updates to the rocket property would be passed to the section's ish property.

The RocketManager could generate its own children.

## Approach II -- JSON Serializable

```JS

class RocketManager {
    static is = 'rocket-manager';

    constructor(element, initVals, ctx){
        // use assign-gingerly's tree handler to render the children
    }
}

customElements.itemscopeRegistry.define(RocketManager.is, { manager: RocketManager });

const pattern = {
    ...
    rocket: ['section', { className: 'card rocket', ish: RocketManager.is }, 
    // [
    //     ['h3', { 'textContent =&': { join: ['Rocket: ', '?.name'] } }],
    //     spec('Height', { 'textContent ?=': ['$root?.ui?.metric', '?.height?.metersLabel', '?.height?.feetLabel'] }),
    //     spec('Mass', { 'textContent ?=': ['$root?.ui?.metric', '?.mass?.kgLabel', '?.mass?.lbLabel'] }),
    //     spec('Engines', { 'textContent =&': { join: [
    //         '?.engines?.number', ' × ', '?.engines?.type', ' ', '?.engines?.version',
    //         ' (', '?.engines?.propellant_1', ' / ', '?.engines?.propellant_2', ')',
    //     ] } }),
    // ]
    ],
}
```

The discussion above is extremely hand wavy.

Can you provide your extremely, high-level, hand wavy take so far, and gauge if this:

1.  Seems like a viable approach, and
2.  There isn't a stronger alternative approach that you recommend?

Please add your thoughts below.

## Claude's Take

### 1. Viable? Yes, and most of the machinery already exists

- **The attribute isn't needed to attach a manager.** `defineIshCore(element, config, …)` in `handleIshProperty.ts` wires up `el.ish` from a manager config without reading `itemscope`. `builtIns.itemscopeTree` already uses it.
- **It maps cleanly onto Tree's model:** *create* = attach the manager once; *every rerun* = `el.ish = value` for that key. Rebinding in place is exactly what `ish` was designed for.
- **Approaches I and II don't have to compete.** Accept a **class** (auto-registered under `static is`, like the classes in itemscopeTree's `map`) *or* a **registered name** (keeps the config JSON). The same slot handles both.
- **"One manager per element" comes for free,** since an element has one `ish`.

### 2. Two adjustments I'd push for

**a. Don't spell it as `ish` inside the pattern.** Two reasons:
- **The key already means something.** In a pattern, `ish: X` already means *assign X to `el.ish`* (a value), so the same key would mean "manager type" here and "value" everywhere else.
- **Patterns rerun; attaching doesn't.** Patterns are re-applied on every call, but attaching a manager happens once. Attaching is **structure**: changing the manager should rebuild the element, just like changing its tag.

So it belongs in the **element spec header**, where Tree already compares structure. Your `treeTypes.d.ts` has this slot commented out as Phase TBD:

```js
rocket: [{ tag: 'section', ish: 'rocket-manager' }, { className: 'card rocket' }, [ /* children */ ]]
//        ^ header: structure (compared, attached once)     ^ pattern: re-applied each call
```

**b. A stronger framing: the manager is the *view model for its subtree*, not (primarily) a renderer.** After attaching, Tree would resolve the subtree's patterns against the **manager instance** (`el.ish`) instead of the raw value. `metersLabel` / `feetLabel` then become **getters**, and the children stay declarative, keeping in-place rebinding:

```js
class RocketManager {
    static is = 'rocket-manager';
    metric = true;
    constructor(el, initVals) { Object.assign(this, initVals); }   // the default merge does this
    get title()       { return `Rocket: ${this.name}`; }
    get heightLabel() { return this.metric ? `${this.height.meters} m` : `${this.height.feet} ft`; }
    get massLabel()   { return this.metric ? `${this.mass.kg.toLocaleString()} kg` : `${this.mass.lb.toLocaleString()} lb`; }
}

rocket: [{ tag: 'section', ish: 'rocket-manager' }, { className: 'card rocket' }, [
    ['h3', { textContent: '?.title' }],
    spec('Height', { textContent: '?.heightLabel' }),
    spec('Mass',   { textContent: '?.massLabel' }),
]]
```

Why I think this is stronger than "the manager generates its own children":
- **Imperative DOM inside managers is exactly what made the itemscopeTree demo heavy.** This keeps the class small: state and computed values, not DOM.
- **It gives pipes and managers clear, separate roles.** Pipes are **stateless** formatting shared app-wide (`longUtc`). Managers are **per-element state and behavior** (a per-card units toggle, events, async work like the old link verification). Neither replaces the other.
- **Rendering stays possible as an escape hatch.** A manager can still render its own children, but then the spec should have **no** children: one owner per subtree.

### 3. Open questions (none look like blockers)

1. **Who re-renders when the manager's own state changes?** For example, `rocketEl.ish = { metric: false }` from a button. Today, Tree only rebinds when it's rerun. Options:
   - the manager calls something Tree hands it (e.g. `ctx.rebind()`) to re-apply its subtree;
   - or state changes are only allowed to flow through a Tree rerun.

   The first is what makes managers pay off.
2. **Async `onAssigned`.** Tree is synchronous. If a manager's `onAssigned` is async, children would read stale getters. I'd either require synchronous managers in Tree, or rebind the subtree when the queued value settles (which ties into question 1).
3. **`$parent` / `$root` inside the subtree.** If `from` becomes the manager, `$parent` should still be the enclosing VM. The raw value is still reachable through the manager's merged properties.
4. **Microdata.** Tree said "no microdata", so attaching via `defineIshCore` wouldn't set `itemscope` by default. That also avoids the attribute cost you mention. It could be opt-in if TreeScope wants it later.

### Bottom line

It's viable, and close to what's already built. I'd attach the manager in the **header** (class or registered name), make the manager the **subtree's `from`** so computed properties are just getters, and decide question 1 (how a manager triggers a rebind) before writing code, because that's where the design either pays off or doesn't.

## Bruce's Response I

I really like the suggestion to make the Itemscope Manager not do the rendering, and to make the manager become the view model for the subtree.  I'm all on board with that.

> **Who re-renders when the manager's own state changes?**

I much prefer the first option (e.g. `ctx.rebind()`)

> 2. **Async `onAssigned`.** Tree is synchronous. If a manager's `onAssigned` is async, children would read stale getters. I'd either require synchronous managers in Tree, or rebind the subtree when the queued value settles (which ties into question 1).

I agree.  If it makes sense, maybe let's assume synchronous onAssigned at first.  I think we had a discussion with the itemscopeTree where we allowed for asynchronous.  I think it was detected if the onAssigned returned a promise.  

I think we should document that if the onAssigned returns a promise, then we call the rebind.  If it makes sense to implement support for both synchronous and asynchronous, that would be great.

>  3. **`$parent` / `$root`

Sounds good.

>  4. so attaching via `defineIshCore` wouldn't set `itemscope` by default

I agree, until there's a compelling need for this, no need to add the attribute.  

If that's enough to proceed with the implementation, please proceed, and add the implementation notes below.  Please apply to the demo page where it makes sense.  It would still be nice to showcase pipe's, especially for formatting dates.

## Claude's Implementation Notes

Implemented as agreed:
- the manager is the **view model for its subtree**;
- **`ctx.rebind()`** handles manager-driven updates;
- an **async `onAssigned` triggers a rebind** automatically, and synchronous `onAssigned` works as before;
- `$parent` / `$root` are unchanged;
- **no `itemscope` attribute** is set.

### Syntax

The manager goes in the **object header**: the Phase TBD slot from `treeTypes.d.ts`, now live.

```js
rocket: [{ tag: 'section', ish: 'rocket-manager' }, { className: 'card rocket' }, [
    ['h3', { textContent: '?.title' }],
    spec('Height', { textContent: '?.heightLabel' }),
]]
```

- **`ish`** is a registered name (Approach II, JSON) or a class (Approach I), auto-registered under `Class.is ?? Class.itemscope ?? Class.name`. A name registered to a *different* class throws, and so does an unregistered name. Throwing gives better DX than skipping silently, since Tree is synchronous and won't wait for a later registration.
- **The manager is structure:** a different `ish` rebuilds the element, like a different tag.
- **Bare class headers and `$:` headers still throw**, but their messages now point to `{ tag, ish }`.

### How it works

| Moment | What Tree does |
|---|---|
| Create | `defineIshCore(el, config, options, assignGingerly, { ctx: { rebind }, onSettled: rebind })`, then `el.ish = value`; the subtree binds against `el.ish` |
| Every rerun | `el.ish = value` (the usual merge, or `onAssigned`), then re-applies the subtree against `el.ish` |
| `ctx.rebind()` | Re-applies the element's own pattern plus its children, with the latest spec and options |
| Async `onAssigned` | Tree binds immediately with whatever state the synchronous part set, then `onSettled` → `rebind()` once the promise (and anything queued behind it) settles |

**Two details:**
- **Re-entrancy guard.** `rebind()` is a no-op while Tree itself is binding that node. Without it, a manager that calls `rebind()` from its constructor (or from a setter that the merge triggers) would duplicate children during creation. There's a test for this.
- **Children of a manager node** receive the manager instance as their `from`. A nested child with its own `ish` would get that instance as *its* value.

### Changes to `defineIshCore` (backward compatible)

It takes an optional fifth argument, `extension: IshExtension`:
- **`ctx`** is passed as the constructor's **third argument** and **merged into `onAssigned`'s ctx**.
- **`onSettled`** is called at the end of the async drain loop. Errors in it go to the same `reportAsync` as other async errors.

itemscopeTree doesn't pass an extension, so nothing changes for it.

### Types

| File | Change |
|---|---|
| `types.d.ts` | `ItemscopeManager` gains `static is?` and an optional `ctx` constructor argument. `IshAssignContext` gains `rebind?`. New `IshManagerContext` and `IshExtension`. |
| `treeTypes.d.ts` | New `ElementHeader { tag, ish? }` added to `ElementSpecificationHeader` |

### Demo

[tree-demo.html](../../../../demos/tree-demo.html) now shows all three mechanisms side by side:

| Mechanism | Used for |
|---|---|
| **Pipes** (stateless) | The date (`join: ['?.parseDate?.longUtc', ' UTC']` with your `pipes`), core summaries |
| **`RocketManager`** (registered name) | The rocket card's view model: `title`, `heightLabel`, `massLabel` and `enginesLabel` getters. "Toggle units" now sets `rocket.ish.metric`, whose setter calls `ctx.rebind()`. There's **no tree rerun**, and the setting **survives "Run again"** (it's manager state). |
| **`LinksManager`** (async `onAssigned`) | Brings back the "verifying… → ✓ verified" step that the first Tree demo lost. Tree binds "verifying…" right away, then rebinds by itself when the simulated check settles. |

The `$root?.ui?.metric` ternaries and the `metersLabel` / `feetLabel` / `kgLabel` / `lbLabel` / `linkList` pipes are gone; managers own that now. The config is still pure JSON, because the managers are referenced by name.

### Verified

- **`tests/tree.html`:** 6 new scenarios (21 in total, 62 assertions):
  - class header + getters, with the manager constructed once across reruns;
  - `ctx.rebind()` from a setter;
  - registered-name header, and an unregistered name throwing;
  - async `onAssigned`: immediate bind, then rebind on settle, with `rebind` in the ctx;
  - changing the manager rebuilds the element, while `$parent` stays the enclosing VM;
  - no duplicate children when the constructor calls `rebind()`.
- **Full suite: 123 passed** in Chromium, Firefox and WebKit, across five runs. One earlier run had a single failure I couldn't reproduce. The likeliest cause was my async test's fixed 80 ms wait, so it now polls (up to 2 s) instead.
- **Demo,** in all three browsers:
  - every button works, with no console errors;
  - the links go "verifying" → "verified";
  - "Toggle units" switches the card to `229.6 ft` / `1,207,920 lb` with the same spec rows (no rebuild), and that sticks after "Run again";
  - every tree rerun still reuses 45 of 45 elements.

  **Note:** your `tsc --watch` and the dev server on :8000 weren't running this time, so I verified the demo against my compiled scratch copy (served on :8017). The repo's `.js` is untouched, as usual, and is **stale until you rebuild**.

### Docs

[docs/tree.md](../../../../docs/tree.md) has a new "Itemscope Managers as View Models" section, covering the header syntax, `ctx.rebind()` and async `onAssigned`, and the element-spec type now shows the object header.









