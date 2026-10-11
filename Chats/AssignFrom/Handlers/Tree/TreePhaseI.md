# Tree Handler Phase I


# Bruce's Ask

As suggested in the [previous discussion](./TreeScope.md#claudes-follow-up), I've created a [specialized type file](/assign-gingerly/types/assign-gingerly/treeTypes.d.ts) that may eventually get merged into the main [assign-gingerly](/assign-gingerly/types/assign-gingerly/types.d.ts) types file.

## Bare bones examples

```html
<details id=api-response>
    <summary>API Response</summary>
</details>
```

```JS
const vm = {
    patch: {
        small: "./data/mission-patch.svg",
        alt: "Demo Mission 7 patch"
    },
};
assignFrom(document.getElementById('api-response'), {
    '?. =>': {
        do: 'builtIns.Tree',
        map: {
            patch: ['img',
                // optional 
                { 
                    //assign-from
                    src: '?.small', alt: '?.alt',
                }
            ],
        }
    }
}, {
    from: vm
});
```

This would generate:

```html
<details id=api-response>
    <summary>API Response</summary>
    <img src=./data/mission-patch.svg alt="Demo Mission 7 patch">
</details>
```

## What happens on the second call?

Ideally, during the first render cycle, some sort of map tied to the matching element is established, and a way of looking up already created elements based on the tree structure would be in memory, in which case it could in this reassign the src and alt (if the vm values changed).  Is that doable?

Keep in mind, when evaluating this possibility, that the type definition mentioned initially has a way of specifying siblings (matching other keys of the vm), as well as generating children, in scenarios where 

```JS
patch: ['img',
    // optional assign-from to the newly created img element
    { 
        //assign-from
       src: '?.small', alt: '?.alt'},
    }, 
    //optional children
    [
        ['template', {...}, [...]
    ]
],
```

contains a third element of the tuple, as shown above.

If this is not possible, we can contemplate alternatives:

1.  Throw an error
2.  At least remember the top level children created, and delete them first
3.  Something else?

Please add your thoughts so far, including creative, friendly improvement suggestions.

---

## Claude's Thoughts

### The second call: yes, it's doable, and cheaper than it sounds

The key property of this design is that **the structure is static**. The spec is a fixed tree of tuples. Only the *patterns* (`src: '?.small'`) depend on the VM. That's the same insight behind lit's template parts and Solid's compiled templates: once the structure has been created, a re-render never needs to diff DOM. It just **re-runs the bindings**.

So on the first call, Tree builds a small "instance tree" next to the DOM:

```ts
interface TreeNode {
    spec: ElementSpecification;  // the tuple this node came from
    element: Element;
    children: TreeNode[];        // same order as spec[2]
}
// per target (+ per config, see below)
const state = new WeakMap<Element, Map<string /* vm key */, TreeNode>>();
```

On the second call, it walks the spec and the `TreeNode`s **in lockstep**. For each node it calls `assignFrom(node.element, spec[1], { from: value })`, then recurses into the children by index. There's no querying and no diffing. Because the spec is static, children line up by index, so they need no keys. This answers your question, and also #5 / #10 from the previous discussion: Tree holds the elements strongly in a `WeakMap` keyed by the target, so the instance needs no `WeakRef`.

### Edge cases to decide (none of them blockers)

| Situation | Suggestion |
|---|---|
| **The spec changed between calls** (different `map` object, or a different tuple for a key) | Compare spec **by reference**. If it differs, rebuild just that key's subtree; that's your option 2, scoped to one key. Reference equality is free, and a config object that's typically a module-level constant stays stable. |
| **A VM value appears or disappears** (`patch` is `undefined` on one call, set on the next) | Create or remove that key's subtree. This needs a stable **insertion point**, so... |
| **Where new elements go** | ...wrap Tree's output in **start/end comment markers**, using the existing `markerUtils` (as `manageTemplateList` and `microDataJoin` do). That gives an anchor for inserting in map order, scopes Tree's nodes away from the `<summary>` and any other content, and lets two Tree configs share one target. |
| **External code removed or moved an element** | Check `node.element.parentNode` against the expected parent before re-running bindings. If it's gone, rebuild that subtree (or ignore it; either is defensible for "simple scenarios"). |
| **Two different Tree configs on the same target** | Key the state by marker pair, not just by target. Markers make this fall out naturally. |

So my take on your list: **not 1** (throwing makes the second call useless, and it's the common case), **2 as the per-key fallback**, and **in-place rebinding as the main path**.

### Semantics worth pinning down

1. **What does a child's `from` resolve against?** I'd say the **parent's value**, so `patch`'s children see `vm.patch`. That makes `'?.small'` mean the same thing at every depth. A child that needs the root VM could use a dedicated prefix (or `ctx`) rather than changing the default.
2. **What happens with missing values?** If `vm.patch` is `undefined`, `src: '?.small'` resolves to `undefined`, and `img.src = undefined` makes the browser request a URL literally named `undefined`. I suggest: **don't create the key's element when its value is `null`/`undefined`**, unless the tuple opts in. This also gives the appear/disappear behavior above for free.
3. **`'template'` children should go into `.content`, not into `childNodes`.** Otherwise they render as live, light-DOM children of the template.

### Small notes on [treeTypes.d.ts](../../../../../types/assign-gingerly/treeTypes.d.ts)

- **`itemScopeManagerName`** is `` `$:{RegisteredItemScopeManagerName}` ``. There's no `${…}`, so this is the literal string `$:{RegisteredItemScopeManagerName}`. You probably meant `` `$:${RegisteredItemScopeManagerName}` ``.
- **`{new(): HElement}` puts `tag` / `a` / `c` on the instance**, so Tree would have to construct an instance just to learn which tag to create. Two friendlier options:
  - make them **statics** (`{ new(el: Element): any; tag: string; a?: Pattern; c?: ElementSpecification[] }`), or
  - also accept a **plain object** `{ tag, a, c }` as a header. That form is pure JSON, which would make Tree's config serializable whenever no behavior is attached. That's a nice step toward whatever TreeScope ends up being.
- **The `c: HElement[]` in `HElement` differs from the tuple's `ElementSpecification[]`.** Using `ElementSpecification[]` in both places keeps one recursive grammar.
- **The types have no notion of arrays yet** (`crew[]`). That's fine for bare bones, but worth reserving a slot. For example, a tuple whose value is an array could repeat its spec per item, keyed by index, which would be a natural place to delegate to `manageTemplateList` later.

### One reminder

The example still uses **`await assignFrom(...)`**. The sync `assignFrom` processes handler keys fire-and-forget (`import('./processHandlerCommands.js').then(...)`, [assignFrom.ts:641](../../../../../assignFrom.ts#L641)) and returns synchronously, so the `<img>` won't exist yet when the `await` resolves. The example should use `assignFromAsync`, or `assignFrom` should return the handler promise.

### Friendly extras (take or leave)

- **The "compiled" fast path pays off now.** Since the walk is "for each node: assignFrom(element, pattern, from)", the patterns could be pre-parsed once per spec (cached in a `WeakMap<spec, Parsed>`). Second calls then only resolve paths and assign values.
- **A dev-mode `console.warn` when a spec key has no matching VM key** (on the first call only) would catch typos like `pacth`.
- **`'*': TBD` from the previous round** fits this model nicely as a *default `ElementSpecification`* applied to unmapped keys, e.g. `'*': 'span'`, plus a default pattern of `{ textContent: '?.' }`. That gives an h-style "just show me the data" mode in one line.

## Bruce's Response

I started to correct the types. Feel free to update them, especially as we continue to progress down this path.  I think some of the types may become more relevant as we continue to implement features.

Please proceed with all your recommendations, including the friendly extras.

---

## Claude's Implementation Notes

### Files

| File | Change |
|---|---|
| `handlers/tree.ts` | **New**: the `TreeHandler` |
| `types/assign-gingerly/treeTypes.d.ts` | Your types, now `export`ed (they were global script declarations), plus `TreeConfig` |
| `processHandlerCommands.ts` | Registers `builtIns.tree` |
| `DX/emojis.ts` | `🌲` alias |
| `tsconfig.json` | Includes `handlers/tree.ts` |
| `tests/tree.html`, `tests/tree.spec.ts` | **New**: 15 scenarios, 42 assertions |
| `docs/tree.md` | **New** |

As CLAUDE.md asks, I **didn't touch any `.js`**. Your running `tsc --watch` has already regenerated `handlers/tree.js`, `processHandlerCommands.js` and `DX/emojis.js` from my `.ts` changes. To test, I compiled a scratch copy of the repo (`tsc` is clean under `strict`) and ran it on port 8017, because your server was on 8000:
- **tree:** 42/42 in Chromium, Firefox and WebKit;
- **itemscopeTree:** 49/49 in all three, as a regression check;
- **full suite:** passes in Chromium.

### One deviation to confirm: `builtIns.tree`, not `builtIns.Tree`

Following #6 from the earlier discussion, I registered the camelCase name to match `builtIns.itemscopeTree`, `builtIns.microDataJoin` and the rest. Your examples above still say `builtIns.Tree`. If you'd rather keep the capital T, it's a one-line change in `BUILT_IN_MAP` plus the `do` type.

### What was implemented

- **In-place rebinding.** State lives in a module-level `WeakMap` keyed by the tree's **start marker** (not by config). Each call walks the spec and the created nodes in lockstep and re-applies patterns.
- **Structure is compared structurally, not by reference.** This corrects my earlier suggestion. Reference equality would rebuild everything whenever the config is written inline, so a new object every call, and that's common. The tag and child count are compared during the walk, so the check costs nothing extra. Only the subtree that changed is rebuilt.
- **Comment markers** (`<!--?start name="tree"-->` … `<!--?end-->`), found among the target's **direct children**. That way a nested tree's markers can't be mistaken for this one's. A `markerName` option lets several trees share a target.
- **Missing values:** null/undefined values are skipped, or removed when a value disappears, and recreated in map order when it reappears. `keepNullish: true` opts out.
- **External removal:** an element that was removed or moved by other code is rebuilt. Markers without state (cloned or server-rendered markup) are cleared and rebuilt, since Tree doesn't adopt existing markup.
- **Children** resolve against the parent's value. `template` children go into `.content`.
- **Friendly extras:**
  - `'*'` default spec, with `{ textContent: '?.' }` when it has no pattern.
  - A one-time `console.warn` for map keys missing from the VM (`pacth`).
  - A "compiled" fast path. Whether a pattern is plain is cached per pattern object, and plain patterns skip `assignFrom`'s key categorization and go straight to `getValues` + `assignGingerly`. Patterns with operator keys (` ?=`, ` =>`, …), or calls using `pin`/`at`/`where_x_in`, fall back to `assignFrom`. One test covers a ` ?=` pattern.
- **Phase TBD headers** (class and `$:`) throw a clear "not supported yet" error rather than being ignored silently.

### Things you may trip over

1. **The result now includes markers.** Your expected output above shows a bare `<img>`; the actual output wraps it in `<!--?start name="tree"-->` … `<!--?end-->`.
2. **Patterns set properties, not attributes.** `{ 'data-test': 'hello' }` (from the TreeScope sketch) would set an expando property, not an attribute. `dataset` or a ` =*` call to `setAttribute` works today. If attribute support matters for Tree, it's a design question for both handlers.
3. **`textContent` + children conflict.** Setting `textContent` wipes the children. Tree re-appends them, after the text, on every call. That's documented, but it's worth deciding whether it should throw instead.
4. **`treeTypes.d.ts` isn't in `package.json` → `files`** (only `types.d.ts` is). That's fine while it's experimental; it should be added, or merged into `types.d.ts` (as AGENTS.md prefers), before publishing.

### Suggested next steps

- **Arrays** (`crew[]`): the open question from before. Repeating a child spec per item, keyed by index, would fit the lockstep model; delegating to `manageTemplateList` would get keyed reconciliation.
- **Class headers:** construct `new Header(el, ctx)` once on creation, and call `onAssigned(value, ctx)` on every rebind. The lockstep walk already has the right hook point (`syncNode`).
- A small **demo page** next to the itemscopeTree one, using the same `launch.json`, for a direct DX comparison.

## Bruce's Response -- Too early for demo?

Is it too early to create a side-by-side demo page that has the same functionality as [itemscope-tree-demo](../../../../../demos/itemscope-tree-demo.html)?  There will be more coming as we develop functionality for sure, but just wanted to see how things look so far if possible.

## Claude's Response -- Demo

Not too early. Building it was the fastest way to find where Tree is thin, and those findings are below.

**[demos/tree-demo.html](../../../../../demos/tree-demo.html)** renders the same launch summary from the same `launch.json`, with the same layout and buttons. The two demos link to each other, and `docs/tree.md` links to it.

### How it's built

- **All formatting lives in one plain `toViewModel(response, ui)` function**: the status badge, the date label, units, the null-details placeholder, and the core summaries. There are no manager classes.
- **The tree config is pure JSON.** The page prints it below the log.
- **Every button reruns the whole tree with a new view model.** "Toggle units", for example, flips `ui.units` and calls `build()` again. The log reports how many of the previous elements were reused.
- **Arrays are handled by composition.** The links, crew, cores and failures `<ul>`s carry a `builtIns.manageTemplateList` handler key in their Tree pattern. That's the delegation idea from earlier, and it works today with no changes to either handler.

### Verified

I drove it with Playwright in Chromium, Firefox and WebKit, against your dev server, clicked every button, and checked the DOM after each click:
- everything renders correctly: badge, date, links, units (`70 m` ↔ `229.6 ft`), the null-details placeholder, and the lists;
- **every rerun reuses 45 of 45 elements**, including the `manageTemplateList` items. Reruns take about 0.5–2 ms; the first build takes 25–60 ms, which includes loading the modules;
- no console errors or warnings in any browser;
- no horizontal scroll at 390px.

### Size

| | itemscopeTree demo | tree demo |
|---|---|---|
| Rendering code (managers + config, or adapter + config) | ~160 lines | ~90 lines |
| Whole `<script>` | ~253 lines | ~160 lines |

These are non-blank, non-comment lines, so treat them as rough. Part of the difference is just that formatting moved into the adapter, but having it all in one place is the DX gain.

### What's missing compared to the itemscopeTree demo

1. **Per-element updates.** There's no `el.ish = …`; every change is a whole-tree rerun. At about 1 ms that's fine here, but it is a different mental model.
2. **Async per-element behavior.** The links' "verifying… / verified" step and the ordered async `onAssigned` demo are gone. They'd come back with class headers.
3. **Microdata**, by design. Grid placement uses class names that the patterns set, instead of `[itemprop]`.
4. **"Change links twice quickly"** became "Change links", since there's no async ordering to demonstrate.

### Rough edges the demo exposed

These are candidate next steps, most valuable first:

1. **Arrays deserve first-class syntax.** Composing with `manageTemplateList` works, but each list needs a `<template id>`, a `globalThis://` protocol, `withMethods: ['querySelector']`, and `'?.querySelector?.strong?.textContent'`-style paths. The demo hides this behind a small `list()` helper. A Tree-native form could reuse the element-spec grammar, so no templates or `querySelector` paths would be needed. For example, `crew: ['ul', {}, [['li', ...]], { forEach: true, key: '?.name' }]`, or a dedicated wrapper.
2. **Nested handlers run fire-and-forget.** Tree applies patterns with the sync `assignFrom`, so the lists fill in *after* `await assignFromAsync(...)` resolves. The demo's "Change links" log has to wait 50 ms before it reads the new link. If Tree collected the promises from nested handler keys and awaited them, `assignFromAsync` would mean "fully rendered".
3. **Children can't see the root VM.** The status badge needs `upcoming` and `success` from the root, so the adapter has to build a synthetic `status` key. That's fine with an adapter, but a root reference in patterns (for example a `$root` prefix) would make Tree usable without one.
4. **No formatting hook.** Dates, units and string concatenation all need the adapter. That might be the right line between Tree and TreeScope ("Tree = structure, the adapter = logic"), but it's worth deciding on purpose.
5. **`hidden: '?.length'`** for the "No failures recorded" placeholder works, but it's a trick. An "if" or "empty" affordance would read better once arrays are first-class.