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

## Bruce's Response

The next item I would like to understand is th8is identifies rough edge:

> 4. **No formatting hook.** Dates, units and string concatenation all need the adapter. That might be the right line between Tree and TreeScope ("Tree = structure, the adapter = logic"), but it's worth deciding on purpose.

Can you please explain where this shortcoming exists with the simplest possible example (derived from the demo would be great, but not required if a simpler example would be clearer).  Can you provide your recommendation for how to solve it?

## Claude's Response -- Formatting

### First, a correction

I overstated the gap. **String concatenation already works** through the ` =&` `join` op, and number formatting works through a zero-argument method call. I ran this against the current build:

```js
assignFrom(t, {
    'title =&':   { join: ['Rocket: ', '?.name'] },
    'mass =&':    { join: ['?.mass?.kg?.toLocaleString|', ' kg'] },
    'engines =&': { join: ['?.engines?.number', ' × ', '?.engines?.type', ' ', '?.engines?.version'] },
}, { from: rocket, withMethods: ['toLocaleString'] });
// → { title: 'Rocket: Falcon 9', mass: '549,054 kg', engines: '9 × merlin 1D+' }
```

So the demo's adapter does more than it has to. That said, three things in it can't be expressed in a pattern today.

### The simplest example

The launch date:

```js
const vm = { date_utc: '2026-03-14T15:09:26.000Z' };
```

```html
<!-- wanted -->
<time datetime="2026-03-14T15:09:26.000Z">March 14, 2026 at 3:09 PM UTC</time>
```

```js
date_utc: ['time', {
    dateTime: '?.',      // ✓ the raw string
    textContent: ???     // ✗ no way to say new Date(value).toLocaleString(undefined, { dateStyle: 'long', … })
}]
```

A path can navigate into a value and call one of its methods, but it can't **turn the value into a different type** (string → `Date`), and it can't **pass an options object** to a method. Hence the adapter.

### The three real gaps (all from the demo)

| Gap | Demo example | Why a pattern can't do it |
|---|---|---|
| **Type conversion / arbitrary function** | Date label | needs `new Date(…)` plus `toLocaleString` with an options object |
| **Conditional pieces inside a string** | `"B9007, flight 4 (reused); landing: success (ASDS)"` | `join` can't branch on `reused` / `landing_success`, and a ` ?=` can't sit inside a `join` |
| **Choice + formatting together** | `70 m` ↔ `229.6 ft` | ` ?=` can pick `?.meters` or `?.feet` (with `$root?.units`), but can't also append the unit |

### Recommendation: let callers register their own ` =&` ops

` =&` already has exactly the right shape. It's synchronous, it names **one op**, its config is resolved with `getValues` (so `?.`, `$root`, `$parent` and `!!` all work inside it), and the result is assigned to the LHS. The only limit is that ops come from a closed, built-in registry (`SYNC_OPS`, which just holds `join`).

So: **add a per-call option, `syncOps`, that is merged over the built-in registry**, just as `handlers` works for ` =>`:

```js
date_utc: ['time', { dateTime: '?.', 'textContent =&': { longDate: '?.' } }],
rocket: ['section', { className: 'card rocket' }, [
    spec('Height', { 'textContent =&': { length: '?.height', units: '$root?.ui?.units' } }),
    …
]],
cores: … { 'textContent =&': { coreSummary: '?.' } } …
```

```js
await assignFromAsync(launchEl, pattern, {
    from: { ...response, ui },
    syncOps: {
        longDate: iso => new Date(iso).toLocaleString(undefined, { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC',
        length: ({ meters, feet }, { units }) => units === 'metric' ? `${meters} m` : `${feet} ft`,
        coreSummary: ({ serial, flight, reused, landing_success, landing_type }) =>
            `${serial}, flight ${flight}${reused ? ' (reused)' : ''}; landing: ${landing_success ? 'success' : 'not successful'} (${landing_type})`,
    },
});
```

**Why this approach:**
- **No new syntax.** ` =&` already exists, is documented, and is synchronous by contract. That contract includes its thenable guard, which throws if an op returns a promise.
- **The config stays pure JSON.** Patterns only *name* ops (`longDate`), and the functions live in the options next to `protocols` and `handlers`. That keeps Tree's "structure as data" property and keeps TreeScope's JSON goal within reach.
- **The raw API response can be the VM.** The `toViewModel()` adapter shrinks to a set of small, named, reusable formatters (`longDate` is useful app-wide), each a pure function you can test on its own. With `$root` / `$parent` in their config, they can also read context.
- **It's a small change:** look ops up in `{ ...SYNC_OPS, ...options.syncOps }` at the one call site ([assignFrom.ts:557](../../../../assignFrom.ts#L557)), and add the option type, docs and tests. It reaches nested calls automatically, because Tree and `manageTemplateList` spread the options through. (`manageTemplateList`'s per-item `withOptions` is the exception; see the questions below.)

**Alternatives I'd avoid:**
- **An expression language in strings** (`'${new Date(?.).toLocaleDateString()}'`). That needs `eval` or a parser, conflicts with CSP and the permission model (`assignPermissions/`), and is the opposite of "config is data".
- **Stretching paths further** (constructor or options-object syntax in path segments). It's clever, but it gets unreadable fast, and every new edge case becomes grammar.
- **Formatter hooks on Tree only.** Formatting isn't Tree-specific: `manageTemplateList` items, `addEventListener` and plain `assignFrom` calls all hit the same wall. ` =&` fixes it for all of them at once.

### On "where to draw the line"

With custom ops, the line between Tree and TreeScope no longer needs to be about formatting. Tree stays "structure as data, logic as named pure functions". TreeScope's distinguishing features can be the things a pure function can't give you: per-element instances, `ish`, async hooks, and microdata.

### Questions before implementing

1. **Name:** `syncOps` (matches the `syncOps/` folder) or something shorter like `ops`?
2. **Shadowing:** should a per-call op be able to override a built-in (`join`)? `handlers` lets per-call entries win, so for consistency I'd allow it.
3. **`manageTemplateList` `withOptions`:** per-item calls deliberately inherit nothing but the `fromStack`. Should `syncOps` also carry through? I'd say **yes**, for the same reason as `fromStack`: ops are pure functions, not capabilities like `withMethods`.

If you agree, I'd implement it and update the Tree demo to use the raw response plus a handful of named ops in place of `toViewModel()`.

## Bruce's Response -- Better Document =&

I was trying to remember how =& works.  The README.md has a brief example of this operator, but unlike some of the other operators, doesn't really seem to discuss it in detail, nor is there a specialized document in docs that describes what that operator supports.  If I missed it, please point me to where it is discussed in details, otherwise, please add.  Either way, please add your actions below if any.

## Claude's Response -- ` =&` Documentation

### Where it was

There *was* a fairly complete section, but it's easy to miss: **README → "Sync op: join (` =&`)"**, about 2,200 lines below the operator table, and the table row didn't link to it. Unlike ` ?=` and ` =*`, there was no `docs/` page.

### Actions

1. **New page: [docs/sync-ops.md](../../../../docs/sync-ops.md)**, written against the code rather than the README. It covers:
   - syntax and how the op is selected;
   - resolution of the whole config (`?.`, `$0`, `$root` / `$parent`, `!!`, `aka`, `withMethods`, sync protocols);
   - thenable rejection, and `undefined` meaning "don't assign";
   - the order of operator processing within one call;
   - duplicate keys under `where_x_in`;
   - `join` in full, plus formatting numbers with `toLocaleString|`;
   - where ` =&` is available, a ` =&` vs ` =>` comparison, and a pointer to the custom-ops discussion.
2. **README:** the operator table row and the "Sync op: join" section now link to the new page.

### Bugs found while writing it

1. **`assignFromAsync` silently ignores ` =&` *and* ` ?=` keys.** It only handles plain, `#[x]`, ` =*` and ` =>` keys. I verified it in Node against the current build:

   ```
   pattern: { 'name =&': { join: [...] }, 'status ?=': ['?.ok', 'yes', 'no'], plain: '?.first' }
   sync : {"status":"yes","name":"Ada Lovelace","plain":"Ada"}
   async: {"plain":"Ada"}
   ```

   `docs/ternary-assignment.md` says ` ?=` works in `assignFromAsync`, so this is a bug, not a design choice. The new doc lists it as a known bug. **I didn't fix it**, because it changes behavior (keys that are ignored today would start applying). The fix is small: hand those keys to the sync `assignFrom`, which already processes both synchronously. **Want me to fix it?** It also matters for the custom-ops proposal, because ops wouldn't work under `assignFromAsync` otherwise.
2. **My `$root` / `$parent` work missed some call paths:** `assignFromAsync` (plain keys, ` =*`, and `#[x]` keys) and the sync `#[x]` paths built their resolver options without `fromStack`. **Fixed.** I added a test for `assignFromAsync` with `fromStack`.

### Verified

- `tsc` is clean, in a scratch copy of the repo; no `.js` touched.
- Root reference tests: 33/33 in Chromium, Firefox and WebKit.
- **Full suite: 120 passed, 0 failed** across all three browsers.

The three questions from the formatting proposal above are still open.

## Bruce's Response -- Temporal

Focusing on the first use case, could something like this work?:

```JS
date_utc: ['time', { 
    dateTime: '?.', 
    'textContent =&': ['?.parseDate?.toLocaleString', ' UTC' ],
...,
{
    protocols: {
        globalThis: (key) => globalThis[key]
    },
    withMethods: ['toLocaleString'],
    pipeMethods: {
        parseDate: 'globalThis://Temporal.Instant?.from'
    },
}
```

pipeMethods means allow the method name (parseDate) to be specified on the RHS rather than the LHS, inspired by the |> TC39 proposal that hasn't gone anywhere.

I think where we would still fall short with this is to be able to specify the second argument of toLocaleString:   {dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' } correct?  Or is there already a way around this?

Is that already too close to "An expression language in strings"?

## Claude's Response -- Pipes

### Short answers

1. **Can it work?** Yes. The mechanism is sound, and it needs no new grammar: a path segment whose name is registered as a pipe calls `fn(current)` instead of reading a property. Your sketch needs three small fixes, listed below.
2. **The second argument of `toLocaleString`:** correct, there's no way to pass it today. A method call takes at most **one string** argument, taken from the next segment (`?.toLocaleString?.en-US` calls `toLocaleString('en-US')`). There's also a subtler problem: with no options, `Instant.prototype.toLocaleString()` formats in the **viewer's** time zone, so the appended `' UTC'` would be wrong for anyone not in UTC. But there's a clean way around it, shown below.
3. **Is it an expression language?** No, as long as pipes stay **unary, named functions registered in JS**. The config only *names* them, exactly as it names `withMethods`, `aka` entries and protocols. The step that *would* cross the line is adding argument syntax to paths (objects, multiple args). The way around #2 doesn't need it.

### Fixes to the sketch

| Sketch | Issue | Fix |
|---|---|---|
| `'textContent =&': [ … ]` | ` =&` needs a config object naming an op | `'textContent =&': { join: [ … ] }` |
| `'globalThis://Temporal.Instant?.from'` | A protocol key ends at the first `?.`, so this looks up `globalThis['Temporal.Instant']` (`undefined`) | `'globalThis://Temporal?.Instant?.from'`, or just pass the function (see below) |
| `?.toLocaleString` (last segment) | Fine. A listed method in the last segment is called with no arguments. | n/a |

There's also a portability caveat: Temporal isn't shipped everywhere yet (Node 24 doesn't have it, for example). `Date.parse` does the same job here and works everywhere.

### The way around the second argument: curry it in JS

The options object belongs in JS, where objects are natural. Configure the formatter once and pipe into its `format`:

```js
date_utc: ['time', {
    dateTime: '?.',
    'textContent =&': { join: ['?.parseDate?.longUtc', ' UTC'] },
}],
```

```js
{
    pipeMethods: {
        parseDate: Date.parse,
        longUtc: new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }).format,
    },
}
```

I checked the JS half in Node: a detached `format` (it's a bound getter, so detaching is safe) applied to `Date.parse('2026-03-14T15:09:26.000Z')` gives `"March 14, 2026 at 3:09 PM"`. `Intl.DateTimeFormat#format` also accepts Temporal objects where Temporal exists, so `parseDate: Temporal.Instant.from` would work there too.

### Pipes cover all three gaps, so I'd drop the `syncOps` proposal

Pipes compose wherever paths go: inside `join`, in ` ?=` conditions and results, in Tree patterns, in handler `get` / `resolve` maps. A ` =&` op can't sit inside a `join` or a ternary. Taking the three gaps one at a time:

| Gap | With pipes |
|---|---|
| Date label | `join: ['?.parseDate?.longUtc', ' UTC']` (above) |
| Conditional text from several fields (core summary) | A unary pipe over the **object**: `textContent: '?.coreSummary'`, with `coreSummary: ({ serial, flight, reused, … }) => …` |
| Choice + formatting (units) | A ternary chooses, and pipes format: `'textContent ?=': ['$root?.ui?.metric', '?.metersLabel', '?.feetLabel']` (`height` is the current value) |

So I'd **implement pipes instead of custom ` =&` ops**. ` =&` stays as it is: a closed set of built-in, multi-argument computations like `join`.

### Proposed semantics

- **Values are functions** (`Date.parse`, a bound `format`, an arrow function). I'd skip protocol-string values for now. They add a level of indirection, and since `protocols` are already functions, options aren't JSON either way. They're easy to add later if needed.
- **Strictly unary:** `fn(current)`, with **no argument from the next segment**. This keeps the grammar unchanged and the slope un-slippery.
- **Called with `this` undefined:** pass bound functions. Static functions like `Date.parse` and `Temporal.Instant.from`, and `Intl`'s bound `format`, are already fine.
- **`null` short-circuits.** Path navigation already stops at `null` / `undefined`, so a pipe is never called with nullish. Use ` ?=`'s `'??'` chain for placeholders: `['?.details', '??', 'No details provided.']`.
- **Collisions:** if a pipe's name matches a real property on the current value, I'd let the **pipe win**. It's registered per call, so that's the author's intent, and it should be documented. An explicit marker (e.g. `?.|>longUtc`) is an option if collisions turn out to bite, but it's new syntax, so I'd hold off.
- **It travels with the other path options** (`withMethods`, `aka`), so Tree passes it through automatically. `manageTemplateList`'s per-item `withOptions` raises the same question as before.

### Questions

1. **Name:** `pipeMethods`, or `pipes`? They're functions, not methods of the value, so `pipes` reads more accurately to me.
2. **Collision rule:** should the pipe win (as I recommend), or the property?
3. **Implement now?** If so, I'd also fix the `assignFromAsync` ` =&` / ` ?=` bug first, since the date example uses ` =&` and the units example uses ` ?=`. Then I'd update the Tree demo to the raw response plus a few pipes, which should remove most of `toViewModel()`.