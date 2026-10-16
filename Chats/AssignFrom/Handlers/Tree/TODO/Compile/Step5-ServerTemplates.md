# Step 5: Server-Rendered Templates

*Outline.*

**Goal:** the server runs the same `compileTree` (it's pure: string building, no DOM) and emits the flat templates once per page:

```html
<template id="tree:launch-card" data-tree-signature="…">…</template>
<template id="tree:launch-card/crew/each" data-tree-signature="…">…</template>
```

On first use of `compile: 'launch-card'`, the client looks these up in the target's root node and checks each signature. On a match it adopts them, so **even the first instance is a clone**, and the HTML parser has done the template-building work. On a mismatch or a missing template, it compiles on the client.

**Key questions to settle then:**
- **Template id scheme** for flat templates (per key and per repeat).
- **Where to look:** the document vs. the shadow root.
- **Packaging** the compiler for Node / server use.

## Bruce's Feedback

I think the id scheme suggested in th outline looks fine to me, if it is truly unambiguous.

What I'm interested to know is:

1.  How much of this integration can be done via JS library of some sort that is expected to run on the server, that handles the id creation and template inner html, etc.

2.  How east it would be to provide the equivalent libraries for c# razor pages, php, etc  (sketch only for now, not to be done for quite a while)

Please provide more details below of what you plan to implement.

## Claude's Design

### First, an honest framing of what Step 5 buys

Templates are built **once per template per page**, not per instance. So adopting server-rendered templates saves the client one `buildTemplate` per template: small next to stamping thousands of rows. And for safety the client still has to **compile** (see "Validation" below), which is pure JS and cheap.

**So Step 5's speed gain is close to zero. Its value is structural:**
1. It puts **the templates in the HTML**, where a server, a build step, or a person can produce them. That's the groundwork for **Step 6**, adopting server-rendered *instances* (real SSR / hydration, where the speed is), and for the **"Tree from an existing template"** convergence with `manageTemplateList` discussed in Step 4.
2. It makes the compiler a **server-side library**, with a test that proves it runs without a DOM.

I'd keep Step 5 small and move on to Step 6 soon.

### The id scheme: made truly unambiguous

The compiler's template ids are already `key` for a map key and `key>n/each` / `key>n/empty` for the repeat at preorder index `n`, recursively (e.g. `list>0/each>2/each`). The outline's `launch-card/crew/each` predates that scheme.

**On its own it's ambiguous,** because map keys can contain `>` or `/`: a key literally named `a>0/each` would collide with key `a`'s repeat. The fix is to **percent-encode** the user-supplied parts, the `compile` name and each map key, with `encodeURIComponent`. That turns `/`, `>` and `:` into `%2F`, `%3E` and `%3A`:

```
tree:<encoded name>/<encoded key>[>n/each | >n/empty]…
tree:launch-card/crew              ← map key "crew"
tree:launch-card/crew>0/each       ← its repeat's item template
tree:launch-card/a%3E0%2Feach      ← a map key literally named "a>0/each" (no collision)
```

The only unescaped `/` and `>` are the scheme's own, and `n` is always digits, so every id parses back uniquely. The prefix `tree:` keeps the ids out of the way of ordinary page ids. **This is what the `compile` name is for:** `compile: 'launch-card'` names the template set. With `compile: true` there's no lookup, and the client compiles, as now.

### 1. What the server-side JS library does: all of it

A new pure module, `handlers/treeTemplates.ts`, exported as `assign-gingerly/handlers/treeTemplates.js`:

```js
import { renderTreeTemplates } from 'assign-gingerly/handlers/treeTemplates.js';

const html = renderTreeTemplates({ map, aka }, {
    name: 'launch-card',   // = the config's compile value
    sample: vm,            // optional: the data the page renders with (chooses microJoin shells)
    canBake,               // optional: the same permission rule as the client
});
// <template id="tree:launch-card/crew" data-tree-signature="3f9a…">…</template>
// <template id="tree:launch-card/crew>0/each" data-tree-signature="…">…</template>
```

- **What it does:** compiles with the same `compileTree`, then serializes each template with the existing `toHTML`, wrapped in `<template id=… data-tree-signature=…>`. The server just puts the string in the page, anywhere before the tree renders, e.g. at the end of `<body>`, or inside a declarative shadow root (below).
- **No DOM needed.** `compileTree` and everything it imports are pure. A **Node test** (run under Playwright's Node side, no browser) imports the module and renders templates, so any future DOM dependency fails CI.
- **Escaping** is already in `toHTML`: text and attribute values. Tags and attribute names are validated at compile time.

### The client side: look up, validate, adopt, or fall back

When a tree with `compile: 'launch-card'` is first used:
1. **Compile as usual.** That gives the spec pairing (the `spec` identity check from Step 3) and the expected signature per template.
2. **Look up** each template by id in **the target's root node** (`target.getRootNode()`, a `ShadowRoot` or the document), then in the document. A tree inside a shadow root therefore finds templates emitted into that shadow root (declarative shadow DOM) or, failing that, page-wide ones.
3. **Validate,** in two cheap checks, once per template per page:
   - **The signature matches** (`data-tree-signature` vs. the client's). This catches a different spec, `aka`, library version, permission profile, or `microJoin` sample.
   - **The parsed content matches the template description structurally.** That's one walk comparing tags, attributes and text, and it catches the **HTML-parser fix-ups** from Step 2 (`<tbody>` insertion, `<p>` auto-closing, SVG namespaces) for specs that don't survive parsing.
4. **Adopt** the `<template>` element as that template's built copy, so instances are `importNode`d from it exactly as from a client-built one. **Otherwise, fall back** to `buildTemplate` (silently; one debug-level note per name).

**Validation is also the security boundary.** A template that a server baked with a looser permission profile than the client's has a different signature, so it isn't adopted. That's why the client compiles and doesn't simply trust the HTML.

**Samples:** the server's `sample` and the client's first VM normally come from the same data. If they differ, `microJoin` shells may differ, the signature mismatches, and the client builds its own. That's still correct, just not adopted.

### 2. Other server languages (C# / Razor, PHP, …): a sketch

There are three routes, in order of preference:

| Route | How | Cost |
|---|---|---|
| **(a) Precompile at build time** (recommended) | Specs are static data (Step 3's "treat specs as immutable"). A small **CLI** runs the JS library during the build: `npx assign-gingerly-tree-templates specs.mjs --name launch-card > launch-card.templates.html`. Razor includes the file (`@Html.Raw(…)` / a partial); PHP `include`s it. | Almost none: no port, the same code, the same signatures. Limits: `microJoin` shells need a sample (supply a fixture, or skip baking them), and specs must be importable by Node (JSON, or a JS module without browser-only imports). |
| (b) Port the compiler | Reimplement normalize, literal detection, baking, `microJoin` shells, escaping and the FNV-1a signature in C# / PHP (~300–400 lines each). | A port has to stay byte-identical with the JS (signatures). Doable with a **shared conformance suite**: JSON fixtures of spec → expected HTML + signature, which every port must pass. Worth it only if specs are generated at runtime on the server. |
| (c) Embed a JS engine | Run the JS library inside .NET (Jint / ClearScript) or PHP (V8Js). | Heavy dependencies; mostly only sensible where a JS engine is already in use. |

The conformance fixtures from (b) are worth generating anyway, from the JS tests. They'd give any future port, or the CLI, a ready-made correctness check.

### What I plan to implement

1. **`handlers/treeTemplates.ts`** (pure): `renderTreeTemplates(config, options)` and `treeTemplateId(name, templateId)` (the encoding above). Exported in `package.json` and `tsconfig.json`; types in `treeTypes.d.ts`.
2. **Client adoption in `handlers/tree.ts`:** for string `compile` values, lookup → signature → structural match → adopt, else `buildTemplate`. Through `TreeHandler.prepare` as before, so nothing loads without `compile`. A small exported **`matchesTemplate(description, element)`** goes in `compileTree.ts`.
3. **Tests:**
   - **Node side:** the module imports and renders without a DOM.
   - **Browser:** a page with server-rendered templates (generated by the Node side of the spec):
     - **adopted:** instances are cloned from the page's `<template>`s, and no `buildTemplate` runs;
     - **fallbacks:** a tampered template (signature or content), a missing one, and a parser-unsafe spec (`table > tr`) all fall back, with **identical output** in every case;
     - **lookup:** a shadow-root target with templates inside its declarative shadow root;
     - **ids:** keys containing `/` and `>` round-trip.
   - **The whole `tree.html` suite** in a third mode: `?compile=named`, with templates rendered server-side into the page.
4. **Docs:** a "Server-rendered templates" subsection in `docs/tree.md` (the library call, the id scheme, validation and fallback), and a short note on the build-time CLI as the route for non-JS servers.
5. **Not in Step 5:** the CLI itself and other-language ports (a sketch only, as you asked), and instance adoption (Step 6).

### Questions for you

1. **Is the percent-encoded id scheme OK?** (`tree:<name>/<key>>n/each`.)
2. **Lookup order:** the target's root node, then the document. Or only the root node?
3. **Fallback visibility:** silent, or a one-time `console.debug` per name when templates are present but not adopted? (I'd do the latter, since it helps catch server/client drift.)
