# A Second Look At Code Interjection

## Bruce's Ask

We've introduced quite a few different ways of interjecting code into the mix.  So many that I sometimes lose track.  For starters, I wonder if we should:

1.  Provide a handy list of all the ways
2.  See if there's any redundancy between them.

I'm remembering that we have:

- Handlers passed in to third argument
- Protocols passed in to third argument
- Registry passed in to third argument for enhancements only that don't have "side effects" on other DOM manipulation.
- Pipes passed in to third argument
- withMethods
- custom element registry for custom elements (built in the browser)
- custom element registry for enhancements
- custom element registry for itemscope managers
- custom element registry for (custom element) features
- bulk enhancements

Am I missing anything else?

Does a table like that sound useful?  If so, please proceed to add one to the docs folder.

The impetus for me raising this issue was that I was going to raise one more, followed by another:

- Registry passed in to third argument for itemscope managers that don't have "side effects" on other DOM manipulation.
- Registry passed in to third argument for (custom element) features  that don't have "side effects" on other DOM manipulation.

What I'm think would make for a simpler mental model is that we break compatibility by restructuring the registry option in the third argument, so that it is structured just like the customElements object -- with a subObject for enhancements, another for itemscope manager, and another for features.

I am confident that no external packages will break by making this change, only unit tests, documentation and possibly demos.

The impetus, in turn, for wanting the very local registry for itemscope managers stemmed from wanting to support less "intrusive" ability to attach itemscope managers in the tree handler.  That idea, for swapping a sub object with a view model, is very appealing to me, and I think it could perhaps apply to other scenarios like the managed template list, and maybe another handler for providing the ability to bind a subObject to a child node (not yet fleshed out).
I recognize what I've said so far isn't yet concrete enough for a solid request.  I wanted to get your thoughts first. 

## Claude's Response

### 1. The list: yes, it's useful. It's in [`docs/code-interjection.md`](../../../docs/code-interjection.md)

The README links to it from *Custom Registries*. It's grouped by where the code goes, and each row says **how a pattern reaches it** and **how far it reaches**: one call, a registry (global or scoped), global, or a class convention. That scope column is the axis your question is really about.

**What your list was missing:**
- **The fourth argument:** the `permissionProcessor`.
- **More options:** `akaMethods` (sugar for `withMethods` + `aka`) and `withAsyncMethods`.
- **`enhance`:** you have "bulk enhancements"; it's also an option, and it loads modules named in EMC configs.
- **Parser registries for `withAttrs`:** `globalParserRegistry` / `registerParser`, `ScopedParserRegistry`, and inline `parser` / `instanceOf`.
- **Code reached by module path from data:** handler paths, EMC modules, feature `spawn` paths, all through `findClassPrototypeInPath` and the allowed-import check.
- **Code reached by name from data:** event bindings' `call` (a method on the host), and `@eachTime`, which subscribes to events.
- **Class conventions:**
  - `static assignTo`;
  - a manager's `constructor(…, ctx)` / `static onAssigned` (with `ctx.rebind()` in Tree);
  - features' `static onAssigned` and `callbackForwarding`;
  - `static canSpawn`;
  - an enhancement's constructor;
  - `installForwarding`.
- **Deliberately closed:** sync ops and the `builtIns.*` names. Worth listing, so nobody looks for a hook there.

### 2. Redundancy

Less than it feels like. Most items enter at different positions in a pattern. The real overlaps:

| Overlap | Today | Suggestion |
|---|---|---|
| `withMethods`, `akaMethods`, `withAsyncMethods` | Three options for one idea: "this path segment is a method call" | **Fold into one option later,** e.g. `methods: { name: true \| 'async' \| 'alias-target' }`. Low value, though, since each is small and documented. I'd leave it unless it keeps tripping you up. |
| `pipes` vs `withMethods` | Both are "a path segment calls a function". A pipe is yours (from options), a method is the object's own. | **Keep both.** The distinction (whose function?) matters for security, since permissions guard methods, not pipes. |
| `registry` (option) vs `customElementRegistry.enhancementRegistry` | The same thing, one local, one shared. **Only enhancements have the local form.** | **Your proposal (below).** This is the one real asymmetry. |
| `handlers` path strings vs `enhance` EMC paths vs feature `spawn` paths | Three "load a class from a module path" entry points | **Already unified** underneath, in `findClassPrototypeInPath`. Nothing to do. |

### 3. Restructuring `registry`: agreed, and I'd mirror `CustomElementRegistry` exactly

**Proposal:** the `registry` option takes **anything shaped like a `CustomElementRegistry`'s addenda:**

```JS
assignFrom(target, pattern, {
    from: vm,
    registry: {
        enhancementRegistry: myEnhancements,   // an EnhancementRegistry
        itemscopeRegistry: myManagers,         // an ItemscopeRegistry
        featuresRegistry: myFeatures,          // a FeaturesRegistry
    },
});
```

- **The same property names** as on `customElements`, rather than new ones (`enhancements`, `itemscope`, …). So **a real scoped registry works as is:** `registry: shadowRoot.customElementRegistry`. And there's one mental model: "the option is a registry; the target's registry and `customElements` are its fallbacks".
- **Lookup, per kind:** `options.registry?.X` → the target's `customElementRegistry.X` → `customElements.X`. Each kind is independent: a call can override managers and inherit enhancements.
- **Breaking change:** `registry: anEnhancementRegistry` becomes `registry: { enhancementRegistry: … }`. Since you're confident nothing external depends on it, I'd make a clean break, but **throw a clear error** when the old shape is passed ("pass `{ enhancementRegistry }`"), rather than silently ignoring it. That catches stale tests, docs and demos.
- **Who reads it:**
  - `assignGingerly` / `assignTentatively`, for enhancements;
  - the `ish` property and Tree's `{ tag, ish }`, for managers;
  - the enhancement registry's `features` setup, for features;
  - nested calls (Tree, `manageTemplateList`, handlers), which already pass options down, so it flows through.

### 4. Less intrusive managers in Tree, and beyond

You're right that this is the motivation, and it shows up in the table: **`{ tag, ish: SomeClass }` registers `SomeClass` in the target's or the global `itemscopeRegistry` today**. It's a global side effect of rendering. Two complementary fixes:

1. **A class needs no registry at all.** When `ish` is a class, Tree could attach it directly (it has the class already) and register nothing. Registration only matters for **names**, which is what keeps a config JSON.
2. **Names resolve through `options.registry.itemscopeRegistry` first.** A JSON config (`ish: 'rocket-manager'`) can then use managers that exist only for that call: no `define` on `customElements`, nothing visible to other code.

Together, those give the "swap a sub-object for a view model" model you describe, with no global footprint. **The same two rules carry over** to the other places you mention:
- **`manageTemplateList`:** an `ish` per item;
- **the not-yet-designed "bind a sub-object to a child node" handler.**

So I'd treat "attach a manager by class or by locally-registered name" as **one shared helper**. Tree's `attachManager` / `resolveManagerConfig` are most of it already, and these handlers would reuse it.

### Questions before I do anything beyond the doc

1. **The shape:** mirror `CustomElementRegistry`'s property names (`enhancementRegistry`, `itemscopeRegistry`, `featuresRegistry`, so a real registry can be passed), as I recommend? Or shorter names?
2. **The break:** a clean break with a clear error for the old shape (recommended), or accept both for a release?
3. **Class `ish` without registering:** should Tree stop auto-registering classes? That's a small behavior change: today, after rendering, the name is defined globally, and the README's Tree example relies on registering by name anyway.
4. **Order of work:**
   - (a) the `registry` restructuring, with tests, docs and demos;
   - (b) Tree's non-registering class `ish` and local names;
   - (c) a shared "attach manager" helper, when `manageTemplateList` or the new handler needs it.

   Agreed?
