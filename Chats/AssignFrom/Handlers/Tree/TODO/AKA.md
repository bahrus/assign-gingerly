# Support for AKA

## Bruce's Ask

Looking at the documentation, everything is looking quite nice, with one possible exception: the annoying wordiness of "texContent" everywhere.

If it weren't for that, defining an HTML tree with the notation we've adopted is almost as compact as HTML.

I wonder if we could either use aka for this in the options:

```JS
aka: {_: 'textContent'}
```

or maybe keep these shortcuts in a separate config setting?

What are your thoughts?

## Claude's Thoughts

### Good news: `aka` already (mostly) does this today

I tested it against the current build, through Tree in Chromium:

```js
await assignFromAsync(el, { '?. =>': { do: 'builtIns.tree', map: {
    name:   ['h2', { _: '?.' }],
    crew:   ['ul', {}, { each: ['li', {}, [['b', { _: '?.name' }]]] }],
    rocket: ['p', { '_ ?=': ['?.active', 'Active', 'Retired'] }],
} } }, { from: vm, aka: { _: 'textContent' } });
// → <h2>Demo 7</h2><ul><li><b>Avery</b></li></ul><p>Active</p>
```

`aka` aliases **bare LHS keys too** (not only `?.` paths), and Tree passes options through to every pattern, including array items. So `{ _: '?.name' }` works with no code changes.

### Three caveats I found

1. **A gap: ` =&` and ` =>` ignore `aka` on the LHS.** `{ '_ =&': { join: [...] } }` doesn't set `textContent`; the result lands on a property literally named `_`. Their LHS goes through `utils/resolveLhsPath.ts`, which never applies aliases, while plain keys, ` ?=` and ` =*` go through `assignGingerly`, which does. That's a bug in `aka` regardless of this discussion, and the fix is small: apply the alias map to the path parts in `resolveLhsPath`.
2. **`aka` is call-wide and applies to the RHS as well.** With `aka: { _: 'textContent' }`, the RHS `'?._'` reads `textContent` instead of a VM field named `_` (I confirmed this). `_` is an unlikely data key, so it's mostly harmless, but a friendlier alias like `t` *would* shadow a real field.
3. **It doesn't reach `manageTemplateList` items.** Their per-item calls get only `withOptions` (plus `fromStack` and `pipes`), so `_` wouldn't work in a `toClone` unless `aka` is repeated there. Native Tree arrays don't have this problem.

### What I'd recommend: two small things, rather than relying on `aka` alone

**1. A string in the pattern slot means `textContent`.** This is the HTML-like shorthand, and the biggest win:

```js
['h3', 'Crew'],                    // literal text
['b', '?.name'],                   // bound text
['li', '?.coreSummary'],           // bound text through a pipe
spec('Height', '?.heightLabel'),   // the spec() helper gets simpler too
```

In `tree-demo.html`, **10 of the 20 `textContent` uses** are the pattern's *only* key, and every one of them becomes `['tag', 'text or path']`. This is:
- **self-describing**, with no dependency on options;
- **pure JSON**;
- **free of alias side effects**;
- **unambiguous**, because the second tuple slot is a pattern object today, so a string there is currently invalid.

It's a few lines in Tree's `normalize`, which would turn a string pattern into `{ textContent: str }`.

**2. `aka` on the Tree config itself,** for the mixed cases (`{ className: 'name', _: '?.' }`, `'_ ?='`, `'_ =&'`):

```js
{ do: 'builtIns.tree', aka: { _: 'textContent' }, map: { … } }
```

Tree would merge it over `options.aka` for its own patterns only. That keeps the shortcut **in the JSON config** (self-describing) and **scoped to the tree**, rather than leaking into every `assignFrom` call that happens to share the options. With caveat 1 fixed, `'_ =&'` and `'_ ?='` work too.

**Plus the `resolveLhsPath` fix (caveat 1),** whichever way we go.

I'd avoid a special "shortcuts" setting separate from `aka`. It would be a second aliasing mechanism with almost the same semantics, and `aka` already exists, is documented and is understood.

### Possible extension (I'd hold off)

A **string array** in the pattern slot could mean a `join` into `textContent`: `['span', [' — ', '?.role']]`. It's tempting, but it starts to blur "pattern" versus "children" (whose slot is also an array), so I'd only add it if the join pattern keeps showing up.

### Questions

1. **The string-pattern shorthand:** go ahead?
2. **Tree-level `aka`:** go ahead, or is the call-wide `options.aka` enough for you?
3. **The `resolveLhsPath` alias fix:** OK to include? It changes behavior for anyone relying on an aliased-looking ` =&` / ` =>` LHS *not* being aliased, which seems unlikely.

## Bruce's Response I

Yes to all three questions.  Please proceed and add implementation notes below, and apply to tree-demo.html.

## Claude's Implementation Notes

All three are done, plus one pre-existing bug fix that turned up along the way.

### 1. A string in the pattern slot = `textContent`

```js
['h3', 'Crew'],          // literal
['b', '?.name'],         // path / reference / pipe — resolved like any RHS value
```

In `handlers/tree.ts`, `normalize` turns a string into `{ textContent: str }`. The resulting objects are cached per string, so the plain-pattern cache still hits and there's no allocation on rebind. In types, the pattern slot is `PatternOrText = Pattern | string`.

### 2. `aka` on the Tree config

```js
{ do: 'builtIns.tree', aka: { _: 'textContent' }, map: { name: ['h2', { className: 'name', _: '?.' }], … } }
```

- **Scoped to the tree:** it's merged over `options.aka` for the tree's patterns only, including array items, manager subtrees, and the `of` / `key` paths. The caller's options object isn't modified (tested).
- **Types:** `TreeConfig.aka?: Record<string, string>`.

### 3. `resolveLhsPath` now honors `aka` / `akaMethods`

**What changed:**
- **` =&` and ` =>` LHS paths are aliased**, both bare (`'_ =&'`) and `?.` paths (`'?.🔍?.ul =>'`), just like plain keys.
- **`akaMethods` targets count as methods** there too.
- **`applyAliases` is now exported** from `resolve/getValues.ts`, so the alias logic isn't duplicated.

### 4. A pre-existing bug, fixed in the same function

While testing `'?.🔍?.ul =>'`, I found that **the unaliased `'?.querySelector?.ul =>'` didn't work either**.
- **The cause:** when an LHS path ends in a method's *argument*, `evaluatePathWithMethods` consumes it and returns the call's result (flagging `lastSegmentConsumed`). `resolveLhsPath` ignored that flag and looked up `ul['ul']`, which is `undefined`, so the handler silently got no target.
- **The impact:** this is the documented pattern in `docs/manage-template-list.md` (`'?.querySelector?.tbody =>'`) and in `manageTemplateList`'s own header example. No test covered it.
- **The fix:** when `lastSegmentConsumed` is set, the target is the call's result, and there's nothing to assign back to. I added a regression test.

### Demo

`tree-demo.html` now uses both forms:
- **10 text-only patterns are now plain strings:** `['h3', 'Crew']`, `['strong', '?.name']`, `['li', '?.coreSummary']`, and the `spec()` helper's value (`spec('Height', '?.heightLabel')`).
- **Mixed patterns use `_` via the config's `aka`:** `{ className: 'name', _: '?.' }`, `'_ ?='` (badge, details), `'_ =&'` (date, crew role, failures) and `{ className: 'muted', _: 'No failures recorded.' }`.
- **`textContent` no longer appears in the config,** apart from the `aka` definition itself.

The `manageTemplateList` variant is unchanged: its item patterns run outside Tree, so the tree's `aka` doesn't apply to them.

### Verified

- **`tests/tree.html`:** 3 new scenarios (33 in total, **103 assertions**). They cover string patterns (literal, path, reference, rebinding), config `aka` (plain / ` ?=` / ` =&`, merged with options, caller not mutated), aliased ` =&` LHS (bare and `?.` path), and ` =>` LHS with `akaMethods` and the `querySelector` regression.
- **Full suite: 120 passed** in Chromium, Firefox and WebKit. `tsc` is clean, in a scratch copy; no `.js` touched.
  - The console errors in the run ("Element must have itemscope attribute…", "expected async failure") come from the existing `itemscope-managers` tests, which trigger them deliberately. None come from the tree tests.
- **Demo,** in all three browsers: identical content to before for every button, no console errors, and no horizontal scroll at 390 px.

### Docs

- **`docs/tree.md`:** the string shorthand and config `aka` (with the "pick an alias that isn't a data key" caveat), the updated spec type, and `aka` in the config type.
- **README (Example 3d, aliasing):** a note that in `assignFrom`, `aka` also applies to the LHS of operator keys.