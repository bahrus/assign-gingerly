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

## Bruce's Response I

1. I agree with the shape
2. Sure, throw error for old shape.
3. Stop auto-registering classes.
4.  Sounds good.

## Claude's Implementation Notes

Done: steps (a) and (b). Step (c), the shared "attach manager" helper, waits until `manageTemplateList` or the new handler needs it. Nothing is committed.

**Results** (in the scratch copy, as before):

| | |
|---|---|
| Full Playwright suite | **155 passed, 4 skipped**, Chromium, Firefox and WebKit |
| `tree.html` | 136 / 136 (6 new) |
| `itemscope-managers.html` | 41 / 41 (3 new) |
| `tsc --noEmit` | clean |

One Firefox run of `pipes` failed once under full-suite load. It passed three times alone and on the next full run, so I'm treating it as a flaky test, unrelated to this change.

### (a) The `registry` option, shaped like `CustomElementRegistry`

```JS
{ registry: { enhancementRegistry?, itemscopeRegistry?, featuresRegistry? } }   // or: registry: shadowRoot.customElementRegistry
```

- **New `utils/resolveRegistry.ts`** (untracked, so add it):
  - **`registryOption(options)`** validates the option once per object. It accepts a `CustomElementRegistry`, or a plain object with only those three keys. **Anything else throws**, with a message pointing to `{ enhancementRegistry: … }`. That includes a bare `EnhancementRegistry`, the former shape.
  - **`resolveRegistry(kind, options, ...targets)`** looks up `registry[kind]`, then each target's `customElementRegistry[kind]`, then `customElements[kind]`.
- **Who reads it now:**
  - **`assignGingerly`:** `registry.enhancementRegistry` for symbol keys. As before, only the option is read; there's no new fallback.
  - **`el.assignGingerly(…)`** (the prototype method): it fills in `enhancementRegistry` from the element when absent. It now **copies** the options rather than mutating the caller's object, as it used to.
  - **The `ish` property** (`handleIshProperty`), and its `_trackSetup` in `assignGingerly`: `registry.itemscopeRegistry`, then the element's registry, then the global one.
  - **Tree's `{ tag, ish: 'name' }`:** `registry.itemscopeRegistry`, then the tree's target's registry, then the element's, then the global one. Options flow down, so repeats and nested trees see it too.
  - **`featuresRegistry`** is accepted for symmetry, but nothing consults it per call. Features are composed when a class is defined, and `defineWithFeatures` takes its registry as an argument.
  - **`enhanceAll` / `enhance`** take no options today, so they still use the element's registry. Say if you want them to accept the option too.
- **Types:** a `RegistryOption` interface in `types.d.ts`, used by `IAssignGingerlyOptions.registry` and `AssignFromOptions.registry`, which was `any`. **This is the `types` submodule again.**
- **Migrated:**
  - **Tests:** 34 call sites in `can-spawn`, `dependency-injection`, `json-symbol-support` and `readme-examples`. The new error check caught one shorthand I'd missed, a multi-line `{ registry }` in `readme-examples`.
  - **README:** 11 places, including the *Explicit Registry Override* note, which now explains the shape and the error.
  - **`tentatively-command`'s "ignores registry"** test is unchanged: `assignTentatively` doesn't read `registry`, so nothing validates it there.
  - **Demos:** none used the option.

### (b) Tree: classes attach directly; names can be local

- **`{ tag, ish: SomeClass }` registers nothing.** The config is made once per class, in a module-level `WeakMap`. That also removes the "already registered to a different class" error.
- **`{ tag, ish: 'name' }`** resolves through `registry.itemscopeRegistry` first. A name defined only there works for that call and its nested calls, and is invisible elsewhere.
- **Tests:**
  - **Test 18 now asserts** that the class is **not** in the global registry.
  - **New Test 39** covers:
    - a local name, in a key and in a repeat;
    - nothing registered globally;
    - the name unknown without the option;
    - the old shape throwing.
  - **`itemscope-managers` Test 24** covers the same for the `ish` property, plus the error from `assignGingerly` itself.

### Docs

- **[`code-interjection.md`](../../../docs/code-interjection.md):**
  - the `registry` row;
  - the registry table, where the itemscope local override is now **Yes** and the features entry is described as above;
  - a new section, **The `registry` option**.

  The old "side effect" warning is replaced by a note that Tree attaches classes directly.
- **`tree.md`:** the `ish` bullet. A class is registered nowhere; how names resolve; a local-registry example.
- **Code comments** in `handlers/tree.ts` and `treeTypes.d.ts` no longer say "auto-registered".

**To do on your side:**
1. **Build**, to update the `.js` for `assignGingerly`, `handleIshProperty`, `object-extension`, `handlers/tree` and the new `utils/resolveRegistry`.
2. **Commit the `types` submodule.**
3. **`git add utils/resolveRegistry.ts`.**

## Bruce's Response II

Can you add an example to tree.md showcasing use of the local registry?

## Claude's Response II

Added: [`docs/tree.md`, *Local managers: `registry.itemscopeRegistry`*](../../../docs/tree.md#local-managers-registryitemscoperegistry). It's a subsection of *Itemscope Managers as View Models*, just before `ctx.rebind()`.

**The example** is a `launch-card.js` module:
- it keeps two managers (`CrewMemberView`, `StageView`) in its own `ItemscopeRegistry`;
- its tree config is pure JSON, referring to them by name in two repeats;
- each call passes `registry: { itemscopeRegistry }`.

I ran it as written in Chromium. It renders the crew and stage lists through the managers' getters, and `customElements.itemscopeRegistry` stays untouched.

**The notes after it:**
- **Names resolve only in the call's registry** when it gives one. There's no per-name fallback to the target's or the global registry. That's how the lookup works (per registry, not per name), and I think it's the right behavior, since a typo can't silently pick up a same-named manager from elsewhere. **Say if you'd rather have a per-name fallback.**
- **It flows down** to repeats, nested trees and handlers.
- **When a class suffices,** and when to prefer a local registry instead: when the config must stay JSON.
- **`registry: shadowRoot.customElementRegistry`** works the same way.

## Bruce's Response III

Maybe this concept can be extended to other registries / scenarios, but at least in this case, what are your thoughts of continuing to support:

```JS
const itemscopeRegistry = new ItemscopeRegistry();
itemscopeRegistry.define('crew-member-view', { manager: CrewMemberView });
itemscopeRegistry.define('stage-view', { manager: StageView });
```

But also:

```JS
const itemscopeRegistry = new ItemscopeRegistry({
    'crew-member-view': CrewMemberView,
    'stage-view': StageView
});
```

## Claude's Response III

**I like it, and I'd do it.** A local registry is mostly declared all at once, so the constructor form fits that use. It also follows platform precedent: `new Map(entries)`, `new Set(values)`.

**How I'd make it work:**
- **The argument:** an optional object of name → **a class or a full config**, so both read naturally:

  ```JS
  new ItemscopeRegistry({
      'crew-member-view': CrewMemberView,                                      // shorthand for { manager: CrewMemberView }
      'stage-view': { manager: StageView, lifecycleKeys: { dispose: 'dispose' } },  // a full ItemscopeManagerConfig
  });
  ```

  A function is a class; an object is a config.
- **It's just `define` for each entry,** in order. So the rules are the same: a duplicate name throws, and `features` setup is tracked for `whenDefined`.
- **The same shorthand for `define`:** `registry.define('stage-view', StageView)`. Then the two forms agree, and the README's examples can use whichever is shorter.
- **`define` with a config stays,** unchanged. No breaking change.
- **`customElements.itemscopeRegistry`** is still created by the polyfill with no arguments, so nothing changes there.

**Extending it to other registries:**

| Registry | Constructor form? | Why |
|---|---|---|
| `ItemscopeRegistry` | **Yes:** `{ name: Class \| config }` | Keyed by name, like your example |
| `EnhancementRegistry` | **Yes:** `new EnhancementRegistry([config, …])`, the same as `push` | Its items aren't keyed by name (`enhKey` is optional), so an array, not an object |
| `ParserRegistry` | **Yes:** `new ParserRegistry({ name: parser })`, the same as `register` | Keyed by name |
| `ScopedParserRegistry` | **Yes,** the same | The same reason |
| `FeaturesRegistry` | **No** | Keyed by the *constructor being composed*, and populated by `assignFeatures` / `defineWithFeatures`. There's no name → thing map to declare. |

Together with the `registry` option, a module's private setup becomes one expression:

```JS
assignFrom(host, pattern, {
    from: launch,
    registry: { itemscopeRegistry: new ItemscopeRegistry({ 'crew-member-view': CrewMemberView }) },
});
```

(Though a module would normally create the registry once, as in the `tree.md` example, rather than per call.)

**Should I implement it,** for `ItemscopeRegistry` (constructor and `define` shorthand), `EnhancementRegistry`, `ParserRegistry` and `ScopedParserRegistry`? It would come with tests, types, and the README / `tree.md` examples switched to the short form.

## Bruce's Response IV

Please implement exactly as you recommend and add your notes below.

## Claude's Implementation Notes II

Done, as recommended. Nothing is committed.

**Results** (in the scratch copy, as before):
- **The new [`tests/registry-constructors.html`](../../../tests/registry-constructors.html):** 18 / 18 in Chromium, Firefox and WebKit.
- **The full suite:** 158 passed (155 + the 3 new browser runs), 4 skipped.
- **`tsc --noEmit`:** clean.

### The constructors

| Class | New | Behaves like |
|---|---|---|
| `ItemscopeRegistry` | `new ItemscopeRegistry({ name: Class \| config, … })` | `define` for each entry, in order |
| `ItemscopeRegistry.define` | `define(name, Class)` | `define(name, { manager: Class })` |
| `EnhancementRegistry` | `new EnhancementRegistry([config, …])` (or one config) | `push` |
| `ParserRegistry` | `new ParserRegistry({ name: parser, … })` | `register` for each |
| `ScopedParserRegistry` | `new ScopedParserRegistry({ name: parser, … })` | `register` for each |

- **The argument is optional everywhere,** so `new X()` and the global registries the polyfill creates are unchanged.
- **The rules are the same as the methods they call:**
  - a duplicate manager name throws;
  - `features` setup is tracked for `whenDefined`;
  - `push` fires its `EnhancementRegisteredEvent`, though nothing can be listening yet when it runs from the constructor;
  - re-registering a parser warns.
- **A function is a class, an object is a config.** A manager is always a class, so `typeof value === 'function'` is unambiguous.
- **Not `FeaturesRegistry`,** as discussed.

### Where

- **The classes:** `assignGingerly.ts` (`ItemscopeRegistry`, `EnhancementRegistry`), `parserRegistry.ts`, `ScopedParserRegistry.ts`.
- **Types:** in `types/assign-gingerly/types.d.ts`, the constructor and the widened `define` for both registry classes. **This is the `types` submodule.**
- **Tests:** the new `tests/registry-constructors.html` and `.spec.ts` cover:
  - both `ItemscopeRegistry` forms;
  - `define`'s shorthand;
  - duplicates still throwing;
  - `whenDefined`;
  - nothing defined globally;
  - use as a local registry for Tree;
  - `EnhancementRegistry` with an array and with one config, used through the `registry` option;
  - both parser registries.

### Docs

- **README, *ItemscopeRegistry*:**
  - the example shows the `define(name, Class)` shorthand and a local registry declared with the constructor;
  - the *Methods* list has the constructor;
  - the `user-card` and `scoped-manager` examples now use the shorthand.

  Examples with `lifecycleKeys` or `features` keep the full config, which is where it's needed.
- **README, enhancement-registry sketch:** now shows the optional constructor.
- **`docs/tree.md`:**
  - `RocketManager` is defined with the shorthand;
  - the *Local managers* example uses `new ItemscopeRegistry({ … })`.
- **`docs/withAttrs.md`:** a sentence after *Named Parsers* about declaring a `ParserRegistry` / `ScopedParserRegistry` in one go.

**To do on your side:**
1. **Build** (`assignGingerly`, `parserRegistry`, `ScopedParserRegistry`).
2. **Commit the `types` submodule.**
3. **`git add` the two new test files.**