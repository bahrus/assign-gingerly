# Stringify

## Bruce's Ask

I am planning to rewrite a [CloudFlare Worker](https://github.com/bahrus/o2h-cw) to make use of the tree handler syntax.

The Worker works with any public API and allows the page to be passed the public API.  The worker returns HTML.  I would like to allow the page to be passed the url to a JSON configuration that follows the tree syntax.

An obvious stumbling block is how the server HTML can pass along the needed property settings that need setting in the client.  I would be interested in your thoughts on that.

But a more simpler starting point is just a function library that takes the tree syntax, the api response (JSON), marries them together, and then generates the HTML.

Can you provide your thoughts on this below>

## Claude's Response

*(I haven't read o2h-cw's code. This is based on your description: a Worker that fetches a public API, plus, newly, a tree config from a URL, and returns HTML.)*

### 1. The simpler starting point: spec + JSON → HTML string

**It's very feasible, and most of the pieces exist and are already DOM-free:**
- **`compileTree`** (Step 2) normalizes specs, classifies literal vs bound keys, and serializes with `toHTML`, escaping included. It was written to run on a server.
- **`getValues` / `getValue`** resolve `?.` paths, `$parent` / `$root`, pipes, `aka` and ternaries. No DOM.
- **`planMicroJoin`** decides `microJoin`'s element shells (`<span>`, `<data value>`, `<time datetime>`, `itemprop`). No DOM.

**Two ways to get the string:**

| | (a) Run Tree against a fake DOM (linkedom / happy-dom), then `outerHTML` | (b) A dedicated renderer: walk spec + data, emit strings |
|---|---|---|
| Semantics | All of Tree's, for free | Tree's, re-expressed as strings; a shared test checks both agree |
| Worker fit | A DOM library in the bundle (linkedom ~200 KB), plus Tree's dynamic imports to bundle | Small and static (no dynamic imports, which Workers don't do at runtime) |
| Properties | Set on fake elements, then **silently lost** by `outerHTML` unless they reflect to attributes | **Explicit:** each key is either rendered or reported as "can't be rendered" |
| Speed | DOM construction, then serialization | String building only |

**I'd go with (b).** The decisive point is the last row of the property question. A property that doesn't reflect is lost *silently* in (a), while (b) knows exactly what it couldn't render. That's also the answer to your harder question, below.

**How (b) maps each part of the notation:**

| In the spec | Server output |
|---|---|
| `'x :='` attributes | the attribute, escaped |
| `textContent` (and the string shorthand, `_` via `aka`) | escaped text |
| `microJoin` | its elements, via `planMicroJoin`: `<span itemprop>`, `<data value>`, `<time datetime>` |
| Reflecting properties: `className`, `id`, `title`, `hidden`, `href`, `src`, `alt`, `dateTime`, `checked`, `value` (as the default value), … | the matching attribute, from a small property→attribute table |
| `each` / `empty` | the items, in order |
| a nested `{ map }`, or a switch (`choose`) | recursion: the chosen case |
| `{ tag, ish }`, ` +=` events, non-reflecting properties (`.prop` on custom elements, `valueAsNumber`, …), ` =>` handlers, async protocols | **can't be HTML:** the "residue", below |
| Tree's `<!--?start-->` / `<!--?end-->` markers | emitted, so a client Tree can find its region |

**The API would be one pure function**, in its own module (e.g. `assign-gingerly/server/renderTree.js`), importable in a Worker or in Node:

```js
const { html, residue } = renderTree(treeConfig, apiResponse, {
    pipes,          // the Worker's own functions (a config from a URL can only *name* pipes)
    aka, canBake,   // as compileTree takes them
});
```

### 2. The stumbling block: what the client still has to do

Everything in the "can't be HTML" row needs JavaScript on the client: managers, listeners, properties. There are four ways to hand it over, from lightest to fullest:

| | How | Client cost | Later data changes |
|---|---|---|---|
| **A. Residue as an `assignFrom` pattern** | The renderer also returns the leftovers as **one JSON pattern**. It addresses each element by **child-index path**, which `assignFrom` already supports (`at` + `#[x]`). The server embeds it in a `<script type="application/json">`. | One `assignFrom` call; no Tree on the client | None: it's a one-time "finish the page" |
| **B. Microdata + `builtIns.scope`** | The renderer emits `itemscope="<manager>"` / `itemprop="<key>"` for `{ tag, ish }` elements. The client binds each scope with `builtIns.scope` (what we just built). | `builtIns.scope` per managed scope | Managers rebind their own scope (`ctx.rebind()`) |
| **C. Re-render on the client** | Ship config + data; the client runs Tree and replaces the server output | Full Tree render; possible flash | Full Tree |
| **D. Adopt (Step 6)** | The client Tree walks the server's elements alongside the plan, builds its state, then attaches the non-HTML parts | Tree's adoption walk | Full Tree, rebinding in place |

**Residue (A) in more detail**, because it's cheap and needs almost nothing new on the client:

```html
<section class="card rocket">…<button>Increase by one</button>…</section>
<script type="application/json" id="tree-residue">
{
  "pattern": {
    "#[e1]":    { "ish": { "name": "Falcon 9", "height": { "meters": 70 } } },
    "#[e1] +=": …
  },
  "at": { "e1": [0, 3], "e2": [0, 3, 1, 1] }
}
</script>
```

- **Values are resolved on the server** into literals. So the client doesn't need the API response again, only what the residue carries (a manager's initial value, for example).
- **Event configs stay declarative.** They're resolved at event time anyway.
- **The client applies it in one call:** `assignFrom(container, residue.pattern, { at: residue.at, registry })`.

**My recommendation, in phases:**
1. **The renderer with residue (A).** That covers your Worker's main case, which I'd guess is mostly display: a page rendered from a public API, with a few interactive bits. It's useful on its own, and testable against Tree directly: the server HTML plus the residue applied must equal what Tree builds in a browser.
2. **Microdata emission (B), as an option of the renderer.** It's cheap once (1) exists, and it uses the manager-binding story we just built.
3. **Adoption (D) when there's a page that changes after load** and must keep Tree's rebind-in-place. That's Step 6, and the renderer's preorder output is what makes it straightforward.

### 3. Worker-specific notes

- **Pipes and protocols can't come from the config URL.** JSON can only *name* them. The Worker supplies an allowlisted pipe library (dates, numbers, …). That's also the right security boundary.
- **The config URL is untrusted input:**
  - render with a permission profile (`canBake`), which refuses `on*` attributes, `javascript:` URLs, and so on;
  - escape everything (`toHTML` already does);
  - cap sizes and recursion.

  The [assign-permissions](../../../../../../docs/assign-permissions.md) layer is the place to define the profile.
- **Caching:** the config is static. The Worker can cache the *compiled* config per URL (Step 2's plan) and re-render only with new API data.
- **Placement in the page:** Cloudflare's `HTMLRewriter` can stream the rendered HTML into a page shell at a selector, e.g. a `<details id=api-response>`, without parsing the page.
- **Bundling:** the renderer must use only static imports. Tree's runtime loads handlers with dynamic `import()`, which is one more reason for (b) over running Tree itself.

### 4. Where this leaves Step 5

Step 5 (server-rendered *templates*) and this (server-rendered *instances*) share the same foundation, the pure compiler on the server. But this delivers far more: real HTML for the user, crawlers and no-JS clients, and Step 5's speed gain was close to zero. **I'd do this first, and fold Step 5 into it** as an option: also emit the templates, so client-side additions are cloned.

### Questions

1. **After load, is your Worker's page mostly static** (residue A is enough)? Or does it need live updates with Tree's rebind-in-place (adoption, Step 6)?
2. **Which manager / event needs do you foresee in o2h configs?** Few would make A the whole story; many make B attractive.
3. **Should microdata (B) be emitted automatically** for `{ tag, ish }` elements, or only with an option? Note that the tree demo is "no microdata, by design".
4. **Packaging:** a module inside assign-gingerly (`server/renderTree.js`), or a separate small package for Workers?
5. **Should I start with a renderer prototype,** plus the equivalence test (server HTML + residue = Tree's DOM), against the launch demo's config?

## Bruce's Response I

I reminded myself that really this entire request, with the possible exception of things related to:

> ### 2. The stumbling block: what the client still has to do

... doesn't really fit in this package / library / proposal.  I think this proposal should be focused on absorbing / importing things into objects / DOM elements, and should adhere to not allowing scope to creep beyond that.  Stringifying is focused on exporting.

So if stringifying were moved to another package (that can reference this project and certainly the typings), are there any tweaks, presumably minor, that this package could make to make stringifying easier?

## Claude's Response II

**Agreed: importing here, exporting elsewhere.** It's a clean line, and it also sorts the residue question:
- **Producing** HTML and residue goes in the stringify package.
- **Consuming** the residue (`assignFrom` with `at`), `builtIns.scope`, and eventually adoption (Step 6) are imports, so they stay here.

These are the tweaks I'd make here. Most are small, and they all make the other package **reuse** this one's decisions rather than re-implement them. That's what keeps server output and client behavior from drifting apart.

### 1. Export what's needed (trivial)

`package.json`'s `exports` already has `compileTree.js`, `resolve/getValues.js`, `syncOps/microJoin.js` (`planMicroJoin`) and `DX/tree.js`. It's missing:
- **`./handlers/treeSpec.js`:** `normalize`, `isSwitch`, `wildcardSpecOf`, `isLiteralString`. These are the spec-reading helpers.
- **The types:** `types/assign-gingerly/treeTypes.d.ts` (`ElementSpecification`, `TreeConfig`, `SwitchSpecification`, …), as an export with a `types` condition.

### 2. Move Tree's structural *decisions* into pure functions (the important one)

Today the decisions about **what renders** live inside `handlers/tree.ts`, interleaved with DOM code:
- which map keys render, in what order (wildcard, `keepNullish`, nullish values skipped);
- which case a switch picks;
- which items a repeat stamps (`of`, `key`, duplicate keys falling back to the index, `empty`).

A stringifier would have to copy them, and copies drift.

I'd move them into `handlers/treeSpec.ts` as pure functions, with **Tree itself using them**:

```ts
mapEntries(config, from)                  // [[key, spec, value], …] in render order
chooseCase(switchSpec, value, resolve)    // { caseKey, spec } (spec null → nothing)
repeatItems(repeat, value, resolve)       // { items: [{ key, item }], empty?: spec }
```

`resolve` is "resolve this path against that value". In practice it's `getValue` with the call's options, so pipes, `aka` and `$parent` behave identically. **Server and client then agree by construction,** and Tree's existing tests cover the shared code.

It's a moderate refactor of `tree.ts`, with no behavior change. The 136-check `tree.html` suite and the switch suite guard it.

### 3. Export the pattern-key classification (small)

`compileTree` already decides, per key, whether it's:
- a literal attribute;
- literal text;
- a `microJoin`;
- or something to apply per instance.

A stringifier needs the same split, extended: **render** (attributes, text, `microJoin`, reflecting properties) versus **residue** (events, `ish`, other properties, handlers, sync ops it can't run). I'd export the classifier (today the private `bakeKey` logic) as `classifyPatternKey(key, value, aka)`, along with `attributeText`. Then "what counts as an attribute or as text" has one definition.

(The **property → attribute** reflection table, e.g. `className → class` and `htmlFor → for`, is HTML knowledge used only for output. That belongs in the stringify package.)

### 4. A "pure modules" guarantee (small, cheap insurance)

A Node-side test, like the one `dx-tree.spec.ts` already has for `DX/tree.js`, that imports, with no DOM present:
- `compileTree.js`;
- `treeSpec.js`;
- `resolve/getValues.js`;
- `syncOps/microJoin.js`;

and exercises them. Then a future change that touches `document` at import time (or in these paths) fails CI here, not in a Worker.

### 5. The import side of residue: nothing new needed

- **Element children only:** `at` paths count **element** children (`resolveIdRef` walks `.children`). So Tree's marker comments and whitespace text in server output don't shift them. That's exactly what a residue needs.
- **A one-liner I'd add to the docs:** applying a residue is a single `assignFrom(container, residue.pattern, { at: residue.at, … })`.

### 6. Later, for Steps 5 / 6 (not now)

- **Export `signatureOf`.** Server-emitted templates or instances can carry the compiler's signature, which the client validates before adopting.
- **A version constant**, stamped by the stringifier, so the client can tell output from an incompatible library version.

### Suggested order

**1, 4 and 3 first** (an hour or two together), **then 2.** 2 is the one that really pays off, because it makes "the server renders what Tree would" a property of shared code rather than of discipline.

**Questions:**
1. Go ahead with 1–4 as listed?
2. For 2, do you agree that **Tree must use the extracted functions itself** (so they can't diverge), even though it's a refactor of working code?







