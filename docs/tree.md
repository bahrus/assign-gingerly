# builtIns.tree

The tree handler enables gingerly assigning dynamic HTML into a DOM node, based on the data from a view model.  It fundamentally rests on a terse, 100% declarative JSON syntax for rapid side-effect free parsing.  The DX experience, though, is a bit challenging, so a lit-like DX library is provided that compiles to this terse syntax.

The handler not only builds a tree of DOM elements from a view model, it rebinds it in place on later calls. Each `map` entry pairs a VM key with an **element specification**: a tag name, or a tuple of tag, assignFrom pattern, and static children.

## Server Side Rendering [WIP]

Rendering a tree config to HTML on a server is a separate package, **[o2h](https://github.com/bahrus/o2h)**, since this one is about bringing data *into* objects and elements. Making that HTML live on the client is this package's job: **hydration** (`adopt`, below).

```js
import { o2h } from 'o2h';

// On the server (e.g. a Cloudflare Worker), with the same config builtIns.tree takes (minus `do`)
const { html, unrendered } = o2h(config, apiResponse, { pipes, managers });
```

- **`html`** is what builtIns.tree would build: elements, attributes, text and Tree's markers. o2h uses the [pure building blocks](#pure-building-blocks-for-rendering-elsewhere) Tree itself uses to decide what renders, so it can't drift from Tree's choices.
- **Pending marks:** each element that lost something HTML can't carry (an event binding, a property without an attribute, a manager) is marked [`data-pending`](#pending-marks-data-pending): "hide this until the client restores it".
- **Managers:** given their classes, o2h renders a manager's subtree from its getters on the server. It also writes `itemscope="<name>"`, which names the manager the element needs.
- **`unrendered`** lists anything o2h couldn't render.

**Current state:** o2h renders tree-demo's definition to the **same DOM** builtIns.tree builds (apart from the marks and that `itemscope`), and builtIns.tree **adopts** it. Tests check, in Chromium, Firefox and WebKit, that every element is reused, that the result is the same DOM as Tree's own, and that managers re-render on `ctx.rebind()`.

### Hydration: `adopt`

```js
// The client, with the same config and the same data the server rendered from
await assignFromAsync(container, { '?. =>': { do: 'builtIns.tree', adopt: true, ...config } }, { from: data, pipes, registry });
```

Without `adopt`, markers Tree finds **without state** (server-rendered or cloned markup) are cleared, and the tree is built fresh. With `adopt`, the first run takes the existing elements over instead:
1. **The walk:** Tree walks the spec and the existing elements together, and builds its records (the same ones it keeps for a tree it built) around those elements. Managers are attached on the way.
2. **The bind:** the ordinary bind then runs: patterns, events and properties. Text that's already right isn't rewritten, and `microJoin` updates its elements in place, so nothing is recreated.
3. **The marks:** `data-pending` marks within what was adopted are removed, since those parts are complete now.

**Any mismatch falls back to the rebuild**, with one `console.debug` saying why, so a page is never left half-adopted. Later runs, and managers' `ctx.rebind()`, then update the adopted elements in place, as for a tree Tree built itself. `adopt` is carried down to nested trees.

#### How the walk pairs spec and markup

**Slots:** the walk only looks at the nodes a spec can occupy, which it calls *slots*:
- **elements;**
- **`<!--?switch-->` placeholders**, which a switch rendering nothing leaves in its place.

Text (including the whitespace between elements) and other comments are skipped. `slotsOf(first, end)` collects a level's slots by stepping through siblings (`firstChild` / `nextSibling`):
- **for the tree's own level,** from the start marker to the end marker;
- **for an element,** from its first child to its last (a `template`'s `.content`).

This is the walk's innermost loop: it touches every child node once.

**Pairing:** each level's slots are paired with the specs in order, using the same pure functions that decide what Tree (and o2h) renders. That way, the walk expects exactly what was rendered from that data:

| Spec | What the walk expects | Mismatch |
|---|---|---|
| **The map** | One slot per rendered key, in `mapEntries` order (`keepNullish` and `'*'` included) | Another number of slots |
| **An element** | An element with that tag. With `ish`, the manager is attached here, and its instance is what the subtree resolves against. | Another tag, or a placeholder |
| **Static children** | One slot per child spec, in order | Another number of child slots |
| **A repeat** | One slot per item from `repeatItems` (`of` and `key` resolved as when rendering), each recorded under its item's key. Or a single slot for `empty`. | Another number of slots |
| **A switch** | The case `chooseCase` picks, adopted in the slot. Or, when nothing renders, the placeholder. | No placeholder where nothing renders |
| **A nested tree** | Nothing at this point: its own run adopts its markers inside the element, when the element is bound | (the nested tree's own) |
| **Own content** (text, `microJoin`) | Nothing: an element without spec children isn't paired inside | none |

A mismatch anywhere aborts the whole walk for that tree, and Tree rebuilds it.

**The cost** is one visit per element and per child node, plus the path resolution that repeats and switches need anyway. On the [adopt benchmark](https://github.com/bahrus/o2h/blob/baseline/demo/benchmark/adopt.html) (a directory of 100 company profiles, 12,901 elements), `adopt: true` takes about 8 ms in Chromium, against about 10 ms for building the same DOM from nothing. Parsing the HTML isn't counted in either.

#### `adopt: 'pending'` (experimental): bind only what's pending

`'pending'` adopts the same way (the same walk, the same fallback), but its first run binds only what the server couldn't complete:
- **marked elements:** the elements marked [`data-pending`](#pending-marks-data-pending), and everything inside them;
- **their ancestors**, so the bind can reach the marked elements;
- **nested trees' hosts**, so nested trees are adopted on the first run too.

Everything else keeps the server's markup as it is, unbound for now. Its records exist from the walk, so later runs and `ctx.rebind()` work as usual, and its first full bind happens on the next run.

**How it works:**
1. **Before the walk,** Tree collects the marked elements in its region and their ancestors.
2. **During the walk,** each nested tree's host is added.
3. **During the first run's bind,** an adopted element that isn't in that set, and isn't inside a mark, is skipped.
4. **After that run,** the scope is dropped.

**The trade-off:** it **trusts the server**. If the client's data or formatting would produce something different (a newer value, another locale or time zone), `adopt: true` corrects it on the first run. `'pending'` only corrects it when a later run reaches that element.

Formatting differences go away if the server emits raw values and the client formats them, e.g. with [be-intl](https://github.com/bahrus/be-intl). Use `'pending'` when the server and the client render from the same data, and what changes on the client is behind a manager or an event, and so is marked anyway.

**What it saves:** the bind of everything static. On the adopt benchmark (medians; the parse isn't counted):

| Page | Elements (bound by `'pending'`) | Chromium | Firefox | WebKit |
|---|---|---|---|---|
| Company directory | 12,901 (601) | 8.2 → 3.6 ms | 19 → 6 ms | 14 → 7 ms |
| Company profile | 129 (6) | 0.10 → 0.05 ms | 0.15 → 0.10 ms | 0.15 → 0.05 ms |

Each cell is `adopt: true` → `adopt: 'pending'`. On a single page, either is well under a millisecond. The difference matters on large pages and slow devices. What's left in `'pending'` is mostly the walk.

**What it needs:** the config and the data on the client, e.g. embedded by the page as JSON (see the [hydration benchmark](../demos/hydration-benchmark/compare.html): `JSON.parse` costs well under a millisecond for hundreds of KB), or fetched.

**With `compile`:** adopted nodes aren't paired with compiled templates, so items added later are created with `createElement` rather than cloned.

### Pending marks: `data-pending`

A server marks an element `data-pending` when it rendered it without something HTML can't carry. The mark means "**hide this until the client restores it**", whatever does the restoring: Tree's `adopt` removes the marks of what it adopted, and [`builtIns.scope`](./scope.md) removes an element's mark after its first bind.

**CSS can hide the pending parts until then.** Do it only when scripts run, so crawlers and no-JS readers still see everything:

```css
@media (scripting: enabled) {
    [data-pending] { visibility: hidden; }   /* keeps the layout: nothing jumps when a part appears */
}
```

o2h emits this rule itself with `style: true`. The attribute name is exported as `PENDING_ATTRIBUTE`.

Design discussion: [Stringify.md](../Chats/AssignFrom/Handlers/Tree/WorkerRendering/Stringify.md), [StylingIncompletelyRenderedElements.md](../Chats/AssignFrom/Handlers/Tree/WorkerRendering/StylingIncompletelyRenderedElements.md) and [RebindingServerRenderedManagers.md](../Chats/AssignFrom/Handlers/Tree/WorkerRendering/RebindingServerRenderedManagers.md); o2h's own notes are in its repo.

## Compiling to a template for optimum performance

**For large lists,** see [Compiling (`compile`)](#compiling-compile-experimental): an opt-in mode that clones precompiled templates, with static parts baked in, instead of creating each element.

**Demo:** [demos/tree-demo.html](../demos/tree-demo.html) builds a launch summary from a JSON API response. Run `npm run serve`, then open `/demos/tree-demo.html`.

Design discussion: [Chats](../Chats/AssignFrom/Handlers/Tree/).

## Basic Example

```html
<details id=api-response>
    <summary>API Response</summary>
</details>
```

```JavaScript
const vm = {
    patch: { small: './data/mission-patch.svg', alt: 'Demo Mission 7 patch' },
};

assignFrom(document.getElementById('api-response'), {
    '?. =>': {
        do: 'builtIns.tree',
        map: {
            patch: ['img', { src: '?.small', alt: '?.alt' }],
        }
    }
}, { from: vm });
```

Result:

```html
<details id=api-response>
    <summary>API Response</summary>
    <!--?start name="tree"--><img src="./data/mission-patch.svg" alt="Demo Mission 7 patch"><!--?end-->
</details>
```

Use `assignFromAsync` when you need the tree to exist after the `await`. The sync `assignFrom` starts handlers fire-and-forget. The first call has to load `tree.js`, so the tree appears just after `assignFrom` returns. Once `tree.js` is loaded, later calls render synchronously.

The `🌲` emoji alias works too, when `builtInEmoji` is passed as `handlers`.

## Targets

The target can be an **element**, a **`ShadowRoot`**, or any other **`DocumentFragment`**, so a web component can render straight into its shadow root:

```JavaScript
assignFrom(this.shadowRoot, { '?. =>': { do: 'builtIns.tree', map: { … } } }, { from: this });
```

- **Managers resolve through the target's registry:** `{ tag, ish }` headers look the name up in the target's `customElementRegistry` (so a shadow root with a **scoped** registry uses its own managers), then fall back to the global one.
- **Plain fragments move:** when a plain `DocumentFragment` is appended somewhere, its content, including Tree's markers, moves with it. Later calls should target the new parent, where Tree finds its markers and rebinds in place. Calling Tree on the emptied fragment starts a new tree.

## Element Specifications

```TypeScript
type ElementSpecification =
    | Header
    | [Header, Pattern | string]
    | [Header, Pattern | string, ElementSpecification[] | Repeat | NestedTree]   // static children, a repeat (see Arrays) or a nested tree (see Nested Trees)
    | Switch                                                                       // one of several specifications, picked by the data (see Switches)
    | Snippet;                                                                     // static HTML from the snippets option (see Snippets)

type Header = tagName | { tag: tagName; ish?: string | ManagerClass };   // see Itemscope Managers below
type Repeat = { each: ElementSpecification; of?: string; key?: string; empty?: ElementSpecification };
type NestedTree = { map: Record<string, ElementSpecification>; markerName?: string; keepNullish?: boolean; aka?: Record<string, string>; compile?: boolean };
type Switch = { switch: string; cases: Record<string, ElementSpecification | null>; default?: ElementSpecification | null };
type Snippet = { snippet: string; holes?: Record<string, Hole> };   // see Snippets
type Hole = Pattern | string | [Pattern | string, (ElementSpecification[] | Repeat | NestedTree)?];
```

- **The pattern** is an [assignFrom](./assignFrom.md) pattern applied to the created element, with `from` set to **the key's VM value**. So `'?.small'` above reads `vm.patch.small`.
- **A string in the pattern slot is `textContent`**: `['h3', 'Crew']` (literal) or `['b', '?.name']` (a path, reference or pipe, resolved like any RHS value). It's shorthand for `{ textContent: … }`.
- **Shorter keys inside pattern objects:** give the tree config an `aka`, e.g. `aka: { _: 'textContent' }`, and write `{ className: 'name', _: '?.' }`, `'_ ?=': [...]` or `'_ =&': { join: [...] }`. It's merged over `options.aka` and applies to this tree's patterns only. Like any `aka`, it also rewrites RHS path segments, so pick an alias that isn't also a data key.
- **Children** are static structure. Their patterns resolve against **the same value as their parent**:

  ```JavaScript
  rocket: ['section', { className: 'card' }, [
      ['h3', { textContent: '?.name' }],     // vm.rocket.name
      ['p',  { textContent: '?.type' }],     // vm.rocket.type
  ]]
  ```

- **The whole VM** is available as `$parent` (and `$root`, for a top-level tree), at every depth: `'$parent?.upcoming'`. See [root-references.md](./root-references.md).
- **`template` elements** receive their children in `.content`, not as light-DOM children.
- **Patterns set properties** (via assignGingerly). For attributes, use the [` :=` operator](./attribute-operator.md): `{ 'class :=': 'card', 'aria-label :=': '?.label' }`. Literal ` :=` values are what a future compile step can bake into a template, so prefer them for statics.
- **Formatting** (dates, units, conditional text) comes from [pipes](./pipes.md) passed in the options: `'?.date_utc?.parseDate?.longUtc'`.
- **Don't combine `textContent` with children**: setting `textContent` replaces them. Tree puts them back on the next call, after the text.

Bare class headers and `$:` headers are reserved for a later phase and throw for now. Use `{ tag, ish }` instead.

## Authoring with a lit-like `` tree`…` `` tagged template literal (optional)

Nested `[tag, pattern, children]` arrays are easy to get wrong by hand. [`DX/tree.js`](../DX/tree.ts) provides a lit-like tagged template that **produces the same tree notation**. (In VS Code, two extensions highlight and check it; see [Editor support](#editor-support-vs-code).) 

Ideally, use of the DX library would be done during the build or server-side processing step, keeping the assign-gingerly instructions easy to digest via its terse, JSON, declarative, side-effect free syntax.  However, it can be used in the browser as well.

For example:

```JavaScript
import { tree, each } from 'assign-gingerly/DX/tree.js';
import { paths } from 'assign-gingerly/DX/paths.js';

const p = paths(); // untyped here; see "Typing the paths" below

const map = {
    launch: tree`
        <article class="card" aria-label=${p.label}>
            <h3 class="title">${p.name}</h3>
            <p>Launched ${p.date} by ${p.rocket}</p>
            <ul ${each(p.crew, { key: '?.id' })}>
                <li>${'?.name'}</li>
            </ul>
            <button @click=${{ call: 'launch' }}>Launch</button>
        </article>`,
};
// → ['article', { 'class :=': 'card', 'aria-label :=': '?.label' }, [
//       ['h3', { 'class :=': 'title', textContent: '?.name' }],
//       ['p', { '?. =&': { microJoin: ['Launched ', '?.date', ' by ', '?.rocket'] } }],
//       ['ul', {}, { each: ['li', { textContent: '?.name' }], of: '?.crew', key: '?.id' }],
//       ['button', { ' +=': { on: 'click', call: 'launch' }, textContent: 'Launch' }],
//   ]]
```

**Typing the paths.** With a type for the view model, `p.name`, `p.crew` and so on are checked and autocompleted, and a typo is an error.

In **TypeScript**, pass the type to `paths`:

```TypeScript
interface Launch { label: string; name: string; date: string; rocket: string; crew: { id: string; name: string }[] }

const p = paths<Launch>();
```

In **JavaScript with JSDoc**, annotate `p` with `PathProxy`, the type `paths<T>()` returns:

```JavaScript
// @ts-check   (or "checkJs": true in jsconfig.json / tsconfig.json)
import { paths } from 'assign-gingerly/DX/paths.js';

/**
 * @typedef {object} Launch
 * @property {string} label
 * @property {string} name
 * @property {string} date
 * @property {string} rocket
 * @property {{ id: string, name: string }[]} crew
 */

/** @type {import('assign-gingerly/DX/paths.js').PathProxy<Launch>} */
const p = paths();
```

The type can also come from elsewhere: `@typedef {import('./launch-api.js').Launch} Launch`, or `@typedef {typeof launchJson} Launch` for an imported JSON sample.

| In the template | Becomes |
|---|---|
| `name="literal"`, `name` (no value) | `'name :=': 'literal'` / `true`: an **attribute**, baked under `compile` |
| `name=${value}` | `'name :=': value` |
| `.prop=${value}` | `prop: value` (a property, as in lit) |
| `@event=${{ call: 'm' }}` or `@event=${'m'}` | an event binding (`' +='`, then `'?. +='`; at most two per element) |
| `ish=${Manager}` | the `{ tag, ish }` header |
| `${each(of, { key, empty })}` in attribute position | the repeat; the element's single child is the item |
| one `${value}`, or literal text, as content | `textContent` |
| text mixed with `${…}` | a [`microJoin`](./sync-ops.md#microjoin) (an element per value) |
| `<p itemscope>Launched ${p.date}</p>` | a `microJoin` whose values have props: `{ prop: 'date', val: '?.date' }` (see below) |
| `` ${tree`…`} `` as content | a child element (composition) |
| `${choose(on, cases, fallback)}` as content, or as a whole map value | a [switch](#switches) (`{ switch, cases, default }`) |
| `${snippet(name)}` as content, or as a whole map value | a [snippet](#snippets-static-html) (`{ snippet: name }`) |
| `${{ '_ ?=': […], … }}` in attribute position | merged into the pattern: for keys markup can't express (ternaries, handlers, sync ops) |
| `${null}`, `${undefined}`, `${false}`, `${''}` as content | nothing (e.g. an optional child) |

[`demos/tree-demo.html`](../demos/tree-demo.html) is written with `tree`, including a pattern spread for its ternaries, an optional child, and `choose` switches. [`demos/tree-demo-with-managed-template-list.html`](../demos/tree-demo-with-managed-template-list.html) writes a similar tree in raw notation, for comparison.

**Details:**
- **`${…}` values** may be `?.` strings or `paths()` proxies; proxies become their path string.
- **Whitespace:** whitespace-only text between elements is dropped, and an element's content is trimmed where the whitespace contains a line break (indentation).
- **Text and elements:** an element holds text or child elements, not both. A leading literal text before the children is the exception, as in the tree notation.
- **Microdata props (`itemscope`):** on an element with `itemscope`, each path value in its text becomes a `{ prop, val }` segment, so `microJoin` renders it with an `itemprop`:

  ```JavaScript
  tree`<p itemscope>Launched ${p.date} by ${p.rocket}</p>`
  // → ['p', { 'itemscope :=': true, '?. =&': { microJoin: ['Launched ', { prop: 'date', val: '?.date' }, ' by ', { prop: 'rocket', val: '?.rocket' }] } }]
  // renders <p itemscope>Launched <span itemprop="date">…</span> by <span itemprop="rocket">…</span></p>
  ```

  - **The prop is the path's last segment,** as with [`md`](./paths-dx.md): `?.rocket?.name` → `name`, `$parent?.site` → `site`, `!!?.reused` → `reused`. `?.` paths and `paths()` proxies work alike.
  - **Formatted values:** a pipe at the end would name the prop after the pipe, so write those explicitly, keeping the raw value as `val`: `${{ prop: 'launched', val: p.date_utc, text: '?.date_utc?.parseDate?.longUtc' }}`. Explicit `{ prop, … }` objects are used as written, with or without `itemscope`.
  - **A single value** becomes a one-segment `microJoin` rather than `textContent`, which can't carry a prop. Literal text, and literal-only content, are unchanged.
  - **Without `itemscope`,** nothing changes: values in mixed text are bare paths (no `itemprop`).
- **Attribute values:** each is a literal or a single `${…}`. Mixing them (`class="a ${x}"`) is an error.
- **Caching:** results are cached per call site, so the same template with the same values returns the same spec object. Tree's spec identity (`compile`, literal skipping on rebind) holds across calls.
- **Parser:** a small one of its own, not the browser's, so there's no `<tbody>` insertion or `<p>` auto-closing, and it runs on a server.
- **Errors:** malformed or unsupported templates (two roots, a mismatched closing tag, text after a child) throw a **`TreeTemplateError`** (exported from `DX/tree.js`). Its message has the location and a code frame:

  ```
  tree`…`: <p>: attribute "class" mixes text and ${…}; … (line 2, column 6)
    <p class="a ${…}"></p>
       ^
  ```

  For editors and tools, the error carries its location:
  - **`part` and `offset`** are exact: the index of the template's static string (the template literal's quasi) and the offset within its **raw** text (escapes as written), so they map straight to source positions;
  - **`line` and `column`** are 1-based, in the template as displayed, with each `${…}` shown as `${…}`.
- **Static analysis (`analyzeTree`):** editors and build tools can check a template without running it. `analyzeTree(strings, values)` uses the same parser and rules as the tag, but **returns** its errors instead of throwing, and caches nothing. It returns `{ spec, elements, errors }`:
  - **`spec`:** the notation;
  - **`elements`:** the parsed elements, with each attribute's and directive's location, for checks and completions;
  - **`errors`:** `TreeTemplateError`s.

  For each `${…}`, pass the value if it's known statically (a `?.` string, `each(…)`, a plain object, a nested `analyzeTree` result's `spec`, `null`…), or else a **`TreeUnknown`**. Tree treats an unknown leniently:
  - in attribute position, it may be `each(…)` or a pattern object;
  - as content, it's a child where children are expected and text otherwise;
  - as an `@event` value, it may be a method name or a config.

  It shows as `‹text›` in the notation. This is what [Gingerly Tree Analyzer](#editor-support-vs-code) uses.

### Editor support (VS Code)

Two VS Code extensions support `` tree`…` ``. They're split the way lit's are: lit-html highlights, and lit-plugin analyzes.

| | [Gingerly Tree](https://marketplace.visualstudio.com/items?itemName=andersonbruceb.gingerly-tree) ([source](https://github.com/bahrus/gingerly-tree)) | [Gingerly Tree Analyzer](https://marketplace.visualstudio.com/items?itemName=andersonbruceb.gingerly-tree-analyzer) ([source](https://github.com/bahrus/gingerly-tree-analyzer)) |
|---|---|---|
| **Does** | Syntax highlighting | Errors as you type, hovers, type checks |
| **How** | TextMate grammars, plus a script for the Markdown Preview. No extension code. | A TypeScript plugin for script files, and the extension itself for Markdown and HTML |
| **JS/TS files** | ✅ | ✅ |
| **HTML `<script>` tags** | ✅ | ✅ |
| **Markdown code blocks** (`js`, `ts`, …, and `<script>` in `html` blocks) | ✅, in the editor and in the Markdown Preview | ✅ |
| **VS Code for the Web** (vscode.dev, github.dev) | ✅ | ✅ errors and hovers (type checks need the desktop) |

Installing the analyzer installs Gingerly Tree too.

**Gingerly Tree** highlights:
- `` tree`…` ``, `` DX.tree`…` `` and `` 🌲`…` ``;
- tags and attributes as markup, with their own colors for the `.prop`, `@event` and `ish` attributes;
- each `${…}` as code;
- `?.` path strings inside `${…}` (`${'?.name'}`, `'$parent?.upcoming'`), colored as variables rather than strings.

**Gingerly Tree Analyzer** builds on [`analyzeTree`](#authoring-with-tree-optional) above, so its errors are exactly the ones the tag would throw:
- **Errors** (the `TreeTemplateError`s described above) are underlined where they are. Examples: a mismatched closing tag, text after a child, or an attribute mixing text and `${…}`.
- **Hovering a template** shows the notation it produces, written as in this page. `paths()` chains show as their `?.` paths, and values that can't be known statically show as `‹expr›`.
- **Hovering an attribute** says what it maps to (`.prop` → a property, `@event` → `' +='`, a plain name → `' :='`, `ish` → the header).
- **In JS/TS files:**
  - `.prop` names are checked against the element's type (`HTMLElementTagNameMap`, including custom elements declared there);
  - a non-standard `@event` name gets a hint (custom events are fine);
  - `ish=${…}` must be a class or a registered name;
  - a `tree` that isn't imported from `assign-gingerly/DX/tree.js` is flagged, with a quick fix.
- **Tag names:** in script files, it follows the import (`import { tree as t }` works). In Markdown and HTML snippets, it matches `tree` and `DX.tree`, plus any names added in the `gingerlyTree.tags` setting.
- **Which assign-gingerly:** it prefers the project's own copy of assign-gingerly, when that copy has `analyzeTree`. Each hover names the version in use.

GitHub's rendering of Markdown (this page included) uses its own highlighter, which neither extension can change.

## Arrays

Put a **repeat object** in the children slot, in place of the array of static children:

```JavaScript
crew: ['ul', { className: 'crew' }, {
    each: ['li', {}, [
        ['strong', { textContent: '?.name' }],
        ['span',   { textContent: '?.role' }],
    ]],
    key: '?.name',
}],

failures: ['ul', {}, {
    each:  ['li', { textContent: '?.reason' }],
    empty: ['li', { className: 'muted', textContent: 'No failures recorded.' }],
}],

links: [{ tag: 'nav', ish: 'links-manager' }, {}, [
    ['ul', {}, { of: '?.linkList', each: ['li', {}, [['a', { href: '?.href', textContent: '?.name' }]]], key: '?.name' }],
]],
```

| Field | Meaning |
|---|---|
| `each` (required) | The specification stamped once per item. It can have children, a `{ tag, ish }` header (one manager per item, each with its own `ctx.rebind()`), and nested repeats. |
| `of` | Path to the array (any iterable), relative to the element's value. Default `'?.'`: the value itself. Anything nullish or not iterable counts as empty. |
| `key` | Path into each item that identifies it across calls (`'?.id'`, or `'?.'` for primitives). Default: the index. Duplicate keys log one warning and fall back to the index for the duplicates. |
| `empty` | Rendered **instead of** the items when there are none. |

- **Inside `each`:** `?.` is the **item**, and `$parent` is the **object holding the array**: the VM for a top-level key like `crew`, or the value `of` was resolved against (e.g. the links manager). `$root` is unchanged.
- **The repeating element owns its content.** Its own pattern still applies (resolving against its value, e.g. `title: '?.length'`), but it can't also have static children.
- **Reconciliation on later calls:** items whose key is still present are rebound in place (and moved if needed), new keys are created, missing keys are removed, and `empty` comes and goes as the array empties and fills.
- **Synchronous**, like the rest of Tree, so the lists are rendered as soon as `assignFromAsync` resolves.

### When `manageTemplateList` is still the better fit

Native arrays are the default. Delegating a list to [`builtIns.manageTemplateList`](./manage-template-list.md) (as a ` =>` handler key in the list element's pattern) still makes sense when:
- **the item markup lives in HTML:** a `<template>` in the page, possibly server-rendered, and possibly filled by `infer` (e.g. by `itemprop`);
- **an item is several sibling elements**, such as `<dt>` / `<dd>` pairs (`configs`), whereas a Tree `each` is one element;
- **a very long list needs time-slicing** (`yieldEvery`), or `waitForSettled`;
- **removed items should be hidden rather than discarded** (`forget: false`).

The trade-off is that the handler runs asynchronously. Inside Tree it's fire-and-forget, so the list fills in just after the tree. [demos/tree-demo-with-managed-template-list.html](../demos/tree-demo-with-managed-template-list.html) shows that approach.

## Switches

A **switch** renders one of several specifications, picked from the data **on every render**. It goes anywhere an element specification goes: a `map` value, a static child, a repeat's `each` (so each item picks its own markup) or `empty`, or a case of another switch.

```JavaScript
mission: {
    switch: '?.phase',
    cases: {
        hold: ['section', { 'class :=': 'card hold' }, [['h3', 'Hold'], ['p', '?.reason']]],
        scrubbed: ['section', { 'class :=': 'card scrubbed' }, [['h3', 'Scrubbed'], ['p', '?.reason'], ['p', '?.newDate']]],
        success: ['p', { 'class :=': 'ok', _: 'Mission success' }],
        quiet: null,                                      // renders nothing
    },
    default: ['p', { 'class :=': 'muted', _: 'Status unknown.' }],   // optional
}
```

With `` tree`…` ``, use **`choose(on, cases, fallback?)`** (after lit's `choose` directive). It produces the same object, as a whole map value or as content, where it stands for one child:

```JavaScript
import { tree, each, choose } from 'assign-gingerly/DX/tree.js';

map: {
    mission: choose('?.phase', {
        hold: tree`<section class="card hold"><h3>Hold</h3><p>${'?.reason'}</p></section>`,
        success: tree`<p class="ok">Mission success</p>`,
    }, tree`<p class="muted">Status unknown.</p>`),

    // Per item: each()'s single child is the item, and here the item is a switch
    timeline: tree`
        <ol ${each('?.', { key: '?.t' })}>
            ${choose('?.kind', {
                milestone: tree`<li class="milestone">${'?.label'}</li>`,
                anomaly: tree`<li class="anomaly"><strong>${'?.label'}</strong><em>${'?.detail'}</em></li>`,
            })}
        </ol>`,
}
```

- **Matching:** the discriminant (`switch`) is resolved against the switch position's value, like any RHS value (`'?.phase'`, `'$parent?.mode'`, pipes too). It's matched with `String(value)` against the `cases` keys, so numbers and booleans work (`true: […]`, `2: […]`). Nullish, or no matching key, means `default`.
- **Nothing to render:** a `null` case, or no match and no `default`. A placeholder comment (`<!--?switch-->`) keeps the switch's slot, so its siblings and its parent aren't rebuilt.
- **The chosen case** renders against the **same value** as the switch: a switch is a choice, not a new scope.
- **Rebinding:**
  - **the same case as last time** is rebound in place, like any element;
  - **another case** replaces the previous one **in its slot**. The previous case is discarded, managers and their state included. (Keeping cases alive but hidden may become an option later.)
- **Why not `` ${cond ? tree`…` : tree`…`} ``?** A `${…}` is evaluated once, when the template is built, so it bakes one branch into the spec. And `' ?='` ternaries switch values (text, classes), not elements.
- **`compile`:** each case is compiled to its own template (ids `<switch id>/case:<key>` and `<switch id>/default`). A switch among static children has no element in its parent's template; its case is cloned and placed when the parent is bound.

See the *Mission status* card and the *Flight timeline* in [demos/tree-demo.html](../demos/tree-demo.html).

## Nested Trees

Put a **nested tree object**, a tree config without `do`, in the children slot. The element's value becomes the nested tree's VM:

```JavaScript
person: ['section', { className: 'card' }, {
    map: {
        name: ['h2', '?.'],                                  // vm.person.name
        tags: ['ul', {}, { each: ['li', '?.'] }],            // vm.person.tags
    },
}],
```

- **Same as a nested ` =>`**: it renders what `['section', { className: 'card', '?. =>': { do: 'builtIns.tree', map } }]` would, but without the handler dispatch.
- **Told apart from a repeat** by having `map` and no `each`. `markerName`, `keepNullish` and `aka` work as in a top-level config. `aka` is merged over the enclosing tree's.
- **Inside the nested tree:** `?.` is each key's value, as at the top level. `$parent` is the element's value (`vm.person`), and the enclosing VMs are further up the stack.
- **Keys missing from the element's value** are skipped, as in any tree. That differs from static children, which always render.
- **Rebinding:** the nested tree keeps its own state, between its own markers inside the element, so later calls rebind it in place. Switching a key between static children, a repeat and a nested tree rebuilds the element.
- **Synchronous**, always. A nested ` =>` builtIns.tree is synchronous too, once `tree.js` is loaded, which it always is while a tree is running. (` =>` handlers in general run synchronously when they can: see [sync ops](./sync-ops.md).)
- **`compile`:** an enclosing `compile` tree clones the element and renders the nested tree at bind time. The nested tree's own `compile` only takes effect once the compiler is loaded, for example by an enclosing `compile` tree.

## Snippets: static HTML

A **snippet** is a piece of static HTML: an SVG icon, a legal footer, a static table header. The config names it, and the `snippets` option supplies the HTML:

```JavaScript
await assignFromAsync(container, {
    '?. =>': {
        do: 'builtIns.tree',
        map: {
            banner: { snippet: 'banner' },                       // a whole map value
            card: ['article', {}, [
                { snippet: 'logo' },                             // a static child
                ['h3', '?.title'],
            ]],
        },
    },
}, {
    from: vm,
    snippets: {
        logo: String.raw`<svg viewBox="0 0 24 24"><path d="M2 2 L22 22"/></svg>`,
        banner: String.raw`
            <header class="banner"><strong>Example</strong></header>
            <p class="tagline">Two root elements are fine</p>`,
    },
});
```

With `` tree`…` ``, use **`snippet(name)`**, as content or as a whole map value:

```JavaScript
card: tree`<article>${snippet('logo')}<h3>${'?.title'}</h3></article>`,
```

**Where it goes:** `{ snippet: 'name' }` goes anywhere an element specification goes: a map value, a static child, a repeat's `each` or `empty`, or a switch case.

**What happens:**
- **Parsed once** per distinct string, by the browser's HTML parser, into a `<template>`, then **cloned** for each instance. Because the browser parses it, **SVG and MathML get their namespaces**. Tree's own `createElement` doesn't do that yet.
- **One record per instance,** holding all its nodes, and **never visited again**, apart from its [holes](#holes-dynamic-parts-inside-a-snippet). Later runs skip its static parts, so other code may change them freely. If the `snippets` option holds another string under that name on a later run, the instance is replaced.
- **Several root elements** are fine. The top level may only hold elements and the whitespace between them: no text, no comments. Wrap text in an element.
- **Checked when parsed,** and a refused snippet **throws**, naming it:
  - no `<script>`, no `on*` event handler attributes, and no `javascript:` URLs, including inside nested `<template>`s;
  - with a permission processor, every attribute must pass it, as Tree's own attribute writes do.
- **Missing names** throw on first render.

**Why the HTML is in the options, not the config:** the config may be JSON loaded from elsewhere, and the data comes from an API. Markup only comes from the page's own code. Snippets are author content, never data.

**`compile`:** a snippet is a template already. Among static children, it's cloned into its parent's clone when that's created.

**Hydration (`adopt`):** a snippet's root elements are matched by tag, in order, and adopted without descending into them. o2h writes the snippet's HTML as is, trimmed, from its own `snippets` option.

### Holes: dynamic parts inside a snippet

Mark elements in a snippet with **`data-hole="name"`**, and fill them from the spec's **`holes`**:

```JavaScript
snippets: {
    card: String.raw`
        <header class="card-head">
            <svg class="icon" viewBox="0 0 24 24"><path d="…"/></svg>
            <h3 data-hole="title">Untitled</h3>
        </header>
        <ul class="specs" data-hole="specs"><li>No specs</li></ul>
        <p class="note" data-hole="note">Fallback note</p>`,
},
```

```JavaScript
card: { snippet: 'card', holes: {
    title: '?.name',                                            // text
    specs: [{}, { each: ['li', '?.'], of: '?.specs' }],         // a pattern, then children (here a repeat)
    note: { 'data-state :=': '?.state' },                       // a pattern alone: binds the element, keeps its fallback
} },
```

With `` tree`…` ``: `${snippet('card', { title: '?.name' })}`.

**A hole's value** is an element tuple **without its header**, since the snippet supplies the element:
- **text** (a string, as in tuples);
- **a pattern** for the hole element;
- **`[pattern, children]`**, where the children are static children, a repeat or a nested tree.

Everything inside a hole is ordinary Tree, including other snippets. Holes resolve against the same value as the snippet's position.

**Fallback content:** what a hole holds in the snippet is its fallback.
- **Replaced** when the hole is filled with content (text or children).
- **Kept** with a pattern alone, and kept in a hole the spec doesn't name. Unnamed holes are left exactly as written.
- **Ignored:** a name in `holes` that the snippet doesn't have.

**Later runs** visit only the filled holes. If the spec fills a different set of holes, or changes a hole's structure, the instance is replaced, so a hole no longer filled gets its fallback back.

**Not supported (yet), and refused** with a throw, so supporting them later changes nothing that works today:
- a hole inside another hole;
- a hole inside a nested `<template>`;
- two holes with one name.

**`data-hole` is removed** from the DOM. o2h fills holes the same way, with a small tokenizer (`snippetParts` in `handlers/treeSpec.ts`). It needs **well-formed** hole markup: explicit end tags inside holes, and `/>` only on void elements or in SVG/MathML.

**SVG holes:** a hole can be an SVG element, and text and attributes work. But elements Tree *creates* inside a hole are HTML elements, so SVG children need namespace support, which Tree doesn't have yet.

## Itemscope Managers as View Models

An object header `{ tag, ish }` attaches an [itemscope manager](../README.md#itemscope-managers-chrome-146) to the element. The manager then acts as the **view model for that element's subtree**: the element's own pattern and its children's patterns resolve against the **manager instance** (`el.ish`) instead of the raw value. Computed values are just getters, and the structure stays in the config, so managers don't render DOM.

```JavaScript
class RocketManager {
    static is = 'rocket-manager';
    #metric = true;
    #rebind;
    constructor(element, initVals, { rebind }) {
        Object.assign(this, initVals);   // the raw vm.rocket
        this.#rebind = rebind;
    }
    get metric() { return this.#metric; }
    set metric(value) { this.#metric = value; this.#rebind(); }
    get heightLabel() { return this.#metric ? `${this.height.meters} m` : `${this.height.feet} ft`; }
}
customElements.itemscopeRegistry.define(RocketManager.is, RocketManager);   // shorthand for { manager: RocketManager }

map: {
    rocket: [{ tag: 'section', ish: 'rocket-manager' }, { className: 'card' }, [
        ['span', { textContent: '?.heightLabel' }],   // a getter on the manager
    ]],
}
```

- **`ish`** is a **registered name** (keeps the config JSON) or a **class**.
  - **A class** is attached directly and **registered nowhere**, so rendering has no side effect on any registry.
  - **A name** is looked up in the call's [`registry.itemscopeRegistry`](./code-interjection.md#the-registry-option) first, then the tree's target's registry, then the global one. An unregistered name throws. Defining names only in `registry.itemscopeRegistry` keeps them local to the call: `assignFrom(host, pattern, { from: vm, registry: { itemscopeRegistry } })`.
- **No `itemscope` attribute** is set. The manager is attached directly through the element's `ish` property.
- **The manager is structure.** It's attached once, when the element is created. A different `ish` (like a different tag) rebuilds the element.
- **Every call** assigns the key's value to `el.ish`, with the usual `ish` semantics: the first value constructs the manager, and later values merge into it (or go to a static `onAssigned`). The subtree is then re-applied against the instance.
- **`$parent` / `$root`** inside the subtree still refer to the enclosing VM(s), not to the manager.

### Local managers: `registry.itemscopeRegistry`

A module can keep its managers to itself and still write its tree as plain JSON. It defines them in its own `ItemscopeRegistry` and passes that with each call, so nothing is added to `customElements.itemscopeRegistry`, and other code can't see the names or collide with them:

```JavaScript
import { assignFrom, ItemscopeRegistry } from 'assign-gingerly';

// launch-card.js: managers private to this module
class CrewMemberView {
    constructor(element, initVals) { Object.assign(this, initVals); }
    get badge() { return `${this.name} (${this.role})`; }
}
class StageView {
    constructor(element, initVals) { Object.assign(this, initVals); }
    get summary() { return `Stage ${this.number}: ${this.engines} engines`; }
}

// Each entry is a manager class (or a full config); the same as calling define() for each
const itemscopeRegistry = new ItemscopeRegistry({
    'crew-member-view': CrewMemberView,
    'stage-view': StageView,
});

// Pure JSON: managers are referenced by name
const pattern = {
    '?. =>': {
        do: 'builtIns.tree',
        map: {
            crew: ['ul', {}, { each: [{ tag: 'li', ish: 'crew-member-view' }, '?.badge'], key: '?.name' }],
            stages: ['ol', {}, { each: [{ tag: 'li', ish: 'stage-view' }, '?.summary'] }],
        },
    },
};

export function renderLaunchCard(host, launch) {
    assignFrom(host, pattern, { from: launch, registry: { itemscopeRegistry } });
}
```

- **Names resolve only in the call's registry** when it gives one. There's no per-name fallback to the target's or the global registry, so a typo or a missing `define` fails here, instead of silently picking up a same-named manager from elsewhere.
- **It flows down:** repeats (as above), nested trees and other handlers inside the tree all get the same `registry` option.
- **Classes need none of this:** `{ tag: 'li', ish: CrewMemberView }` attaches the class directly, also with no global footprint. Use a local registry when you want the config to stay JSON (stored, sent, or generated) and still keep the names private.
- **A scoped registry works the same way:** `registry: shadowRoot.customElementRegistry` uses that registry's `itemscopeRegistry` (and its `enhancementRegistry`). See [the `registry` option](./code-interjection.md#the-registry-option).

### `ctx.rebind()`

The manager receives a context with **`rebind()`**: as the constructor's third argument, and merged into `onAssigned`'s `ctx`. Calling it re-applies the element's own pattern and its children's patterns against the manager, without a tree rerun. Call it after changing the manager's own state, typically from a setter (above: `rocketEl.ish.metric = false`). State kept on the manager survives later tree reruns.

Calls made while Tree itself is binding that element (for example from the constructor) are ignored, since Tree is about to bind it anyway.

### Async `onAssigned`

`onAssigned` may return a promise. Tree binds the subtree **immediately**, with whatever state the synchronous part of `onAssigned` set, and then **calls `rebind()` by itself once the promise settles** (after any values queued behind it). For example, a links bar can show "verifying…" right away and "✓ verified" when the check finishes.

See [demos/tree-demo.html](../demos/tree-demo.html): the rocket card and the links bar each have a manager.

## Events

An element's own pattern can bind its events with an empty ` +=` LHS. The listener's **host is the element's `from`** — inside a manager subtree, the manager instance — so a button can call a manager method directly:

```JavaScript
rocket: [{ tag: 'section', ish: 'rocket-manager' }, {}, [
    ['span', '?.heightLabel'],
    ['button', { _: 'Increase by one', ' +=': { on: 'click', call: 'increaseHeightByOne' } }],
]]
```

- No `itemscope` attribute or DOM host lookup is involved; the host comes from the data context.
- **Reruns don't stack listeners:** Tree gives each `' +='` binding without a `get.key` a default dedup key, so re-applying the pattern replaces the listener (and its host is always the current `from` — which matters outside manager subtrees, where the VM value changes between calls).
- The manager method typically updates its own state and calls `ctx.rebind()`.

See [event-binding.md](./event-binding.md) for the full ` +=` event syntax.

## Keys

| Situation | Behavior |
|---|---|
| Order | Map order, then `'*'` keys (below) in VM key order |
| Value is `null` / `undefined` | Skipped (an existing element is removed), unless `keepNullish: true` |
| Map key missing from the VM | Skipped as above, with a `console.warn` on the tree's first render (likely a typo) |

### Default specification: `'*'`

The `'*'` key applies to every VM key the map doesn't name. A `'*'` specification without a pattern gets `{ textContent: '?.' }`, so this gives a "just show me the data" view in one line:

```JavaScript
map: { name: ['h2', { textContent: '?.' }], '*': 'span' }
// { id: 'demo-7', name: 'Demo Mission 7', flight: 7 }
// → <h2>Demo Mission 7</h2><span>demo-7</span><span>7</span>
```

Object values render as `[object Object]` with the default pattern. Give `'*'` its own pattern, or map those keys explicitly.

## Second and Later Calls

Tree remembers the elements it created, keyed by its start marker. On later calls it walks the specification and those elements in lockstep, and **re-applies each pattern in place**. Nothing is queried or diffed:

- A key whose **structure** changed (a different tag, or a different number of children) is rebuilt; the rest stay untouched. Structure is compared structurally, so a config written inline (new objects on every call) still rebinds in place.
- A key whose value **appears or disappears** is created or removed, in map order.
- An element **removed or moved by other code** is rebuilt.
- Markers found **without remembered state** (cloned or server-rendered markup) are cleared and the tree is rebuilt, unless the config has [`adopt: true`](#hydration-adopt): then Tree adopts the existing elements when they match the spec.

### Several trees in one target

Give each config its own `markerName` (default `'tree'`):

```JavaScript
{ '?. =>': { do: 'builtIns.tree', markerName: 'summary', map: { /* ... */ } } }
```

## Config

```TypeScript
interface TreeConfig extends HandlerConfig {
    do: 'builtIns.tree';
    map: Record<string, ElementSpecification>;
    markerName?: string;    // default 'tree'
    keepNullish?: boolean;  // default false
    aka?: Record<string, string>;  // aliases for this tree's patterns, merged over options.aka
    compile?: boolean | string;    // experimental: clone compiled templates (see below)
    adopt?: boolean;               // adopt existing (e.g. server-rendered) markup on the first run (see Hydration)
}
```

The types live in `types/assign-gingerly/treeTypes.d.ts`.

## Compiling (`compile`, experimental)

```JavaScript
const map = { launch: ['article', { 'class :=': 'card' }, [['h3', { 'class :=': 'title', _: '?.name' }], /* … */]] };

assignFrom(host, { '?. =>': { do: 'builtIns.tree', compile: true, aka: { _: 'textContent' }, map } }, { from: vm });
```

With `compile`, Tree compiles the map once ([`handlers/compileTree.ts`](../handlers/compileTree.ts)) into flat `<template>`s, one per key and one per repeat `each` / `empty`. It then **creates each element by cloning its template**, instead of calling `createElement` and assigning every key.

**What's baked into the templates**, and so costs nothing per instance:
- literal `textContent`, including the string shorthand and keys aliased to it (`_`);
- literal ` :=` attributes;
- `microJoin`'s static text and element shells, when the first call's VM has every value. The element types come from that VM's values. If a later value has another type, `microJoin` just re-renders that element.

**Everything else is applied per instance, as before.** That includes literal *properties*: write statics as attributes (`'class :=': 'card'`, not `className: 'card'`) to get them baked.

**Rebinding, managers, events and repeats behave exactly as without `compile`.** Only creation changes.

**Rules and differences:**
- **Treat the map's specifications as immutable.** To change one, replace it with a new object. A template is used only for the exact spec object it was compiled from (anything else falls back to `createElement`), but an object edited *in place* isn't noticed. This is the same assumption Tree already makes when it skips literals on rebind.
- **Define the map once** (e.g. at module level). Compiled templates are cached per `map` object, so a map literal recreated on every call is recompiled every time. That still works, but there's no gain.
- **Custom elements** are created with `document.importNode`, which upgrades them before Tree sets any property, so setters run as with `createElement`. Two differences:
  - every element of an instance is constructed before any pattern is applied;
  - baked attributes are already present at construction, so they arrive through `attributeChangedCallback`.
- **Attribute order:** baked attributes come before per-instance ones. That's visible in `outerHTML`, though not to selectors or `getAttribute`.
- **Permissions:** with a permission processor, a literal attribute it would refuse isn't baked. It's applied, and refused, per instance, as without `compile`.
- **The value:** `compile: 'some-name'` currently works like `true`. The name is reserved for server-rendered templates (planned).
- **Loading:** the compiler (`handlers/compileTree.js`) is only downloaded for trees with `compile`, so trees without it don't pay for it.

### When it helps: measured

Compiling speeds up **creating** elements. Rebinding is unchanged, by design. How much depends on how much of the markup is static, and on how much of the time is the browser's own layout and paint.

**Static-heavy cards, build only** ([`demos/tree-benchmark.html`](../demos/tree-benchmark.html)): 16 elements, 3 bound values, 24 statics. One fresh page per approach, 3 runs × 11 samples, `?layout=0`.

| Create (vs. today's Tree) | Chromium | Firefox | WebKit |
|---|---|---|---|
| `compile`, statics written as ` :=`, 1,000 cards | 1.18–1.42× faster | 1.60–1.92× | 1.60–1.70× |
| the same, 10,000 cards | 1.19–1.21× | 1.78–1.94× | 1.71–1.83× |
| `compile` with property statics (`className: …`) | ~1.0× (no gain) | 1.30–1.39× | 1.25–1.32× |
| compiled, vs. hand-written template cloning | 1.06–1.19× of it | 1.13–1.18× | 1.17–1.25× |

**Rows with layout** ([`demos/js-framework-benchmark-tree.html`](../demos/js-framework-benchmark-tree.html)): the js-framework-benchmark rows, timed until the next frame is rendered. 9 samples per page.

| Tree → Tree `compile` (ms) | Chromium | Firefox |
|---|---|---|
| Create 1,000 | 24.0 → 23.5 | 23 → 22 |
| Append 1,000 | 46.7 → 31.2 | 34 → 28 |
| Create 10,000 | 296.9 → 261.3 | 259 → 224 |

**What this says:**
- **The gain comes from baking, not from cloning.** Write statics as ` :=` attributes and literal text. In Chromium, whose `createElement` is fast, compiling *without* ` :=` statics gains nothing.
- **Compiled Tree is close to the floor:** within ~1.1–1.25× of hand-written template cloning.
- **Layout and paint shrink the visible gain.** With rows rendered on screen, a large part of each total is the browser's work. The benchmark pages show both a **total** and a **script** time (until the rows are handed to the browser), and offer **`?cv`** (`content-visibility: auto` on rows), which removes most off-screen layout.
- **Use it for large or frequently created lists with static markup.** For small trees the one-time compile isn't worth it.

## Pure building blocks (for rendering elsewhere)

Exporting a tree, for example **server-side rendering to an HTML string**, belongs in a separate package. This one is about bringing data into objects and elements. But the decisions such a package needs are exported here, DOM-free, and **builtIns.tree uses them itself**, so other renderers render what Tree would:

| Export | From | Decides |
|---|---|---|
| `mapEntries(map, from, keepNullish?)` | `assign-gingerly/handlers/treeSpec.js` | which map keys render, in order (`'*'` included), with their spec and value |
| `chooseCase(switchSpec, value, resolve)` | same | which case a switch picks (`DEFAULT_CASE` for `default`) |
| `repeatItems(repeat, value, resolve)` | same | what a repeat stamps: items, keys (duplicates fall back to the index), `empty`, and whether items resolve one level down |
| `normalize(spec)`, `isSwitch(spec)` | same | a specification's parts |
| `classifyPatternKey(key, value, aka)`, `isLiteral`, `attributeText` | `assign-gingerly/handlers/compileTree.js` | what a pattern key does: text, attribute, property, `ish`, event, sync op, or other |
| `getValue` / `getValues` | `assign-gingerly/resolve/getValues.js` | path resolution (pipes, `aka`, `$parent` / `$root`, sync protocols) |
| `planMicroJoin` | `assign-gingerly/syncOps/microJoin.js` | `microJoin`'s elements |

- **`resolve`** is `(path, value, forItem?) => any`, typically `getValue` with the renderer's options. For a repeat's keys, `forItem` is true, and the array's holder is on the stack (`$parent`).
- **Types** are in `assign-gingerly/types/treeTypes.js`.
- **A Node test** (`tests/pure-modules.spec.ts`) imports these with no DOM present, so they stay usable in Node, Deno, Bun and Workers.

The client-side counterpart, finishing server-rendered markup, *is* this package's job: [`builtIns.scope`](./scope.md), and `assignFrom` with [`at`](../README.md#cached-element-resolution-with-x-and-pin) paths. `at` counts element children only, so markers and whitespace in server output don't shift it.

## Performance Notes

- Everything inside the handler is synchronous.
- **Fast path:** a pattern whose keys are all plain property names (after `aka`), and whose values are all literals or `?.` paths, is compiled once per pattern object and applied directly: each path is navigated, and each value assigned. `getValues` and `assignGingerly` are skipped, with the same results. That's most Tree patterns (`{ className: 'card', _: '?.name' }`, string patterns). Anything else (operator keys, `$root` / `$parent` / `$0`, `!` negation, protocols, object values) falls back as described next. So do calls with `withMethods`, `akaMethods`, substitutions, `pin` / `at`, or a permission processor. A path segment that's aliased or names a pipe is resolved through `getValue`.
- Other patterns with only plain keys skip assignFrom's key categorization (cached per pattern object) and go straight to `getValues` + `assignGingerly`. Patterns with operator keys go through `assignFrom`.
- **Literal keys aren't re-applied on rebind.** When an element is rebound with the *same pattern object* (and the same effective `aka`) as last time, its literal values (`className: 'card'`, `['dt', 'Height']`) are skipped, because they can't have changed. Only the bound values are re-applied. The one consequence: if other code changes such a property directly, a rerun won't restore it. Configs written inline (new objects on every call) always re-apply everything.
- **Unchanged text isn't rewritten.** On the fast path, `textContent` is only assigned when the text actually differs. Re-assigning the same string would replace the text node for nothing (and fire `MutationObserver`s). Other properties are always assigned, so setters keep running as before.
