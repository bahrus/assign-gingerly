# Step 2: `compileTree(spec)`, a Pure Compiler

*Outline; to be detailed after Step 1.*

**Goal:** a pure function, with no DOM required, that turns an element specification into:

- **templates:** HTML strings, **flat** (one per top-level key, plus one per repeat `each` / `empty`). No template contains another.
- **a plan:** the spec nodes in preorder, each with its **dynamic** pattern keys only, its `ish`, its event bindings, and its repeat references (by template id).
- **a signature:** the structural fingerprint (preorder tag / `ish` / repeat shape), used later to validate cached or server-rendered templates.

**Key questions to settle then:**
- **The static-key allowlist.** Which literal keys can be baked into HTML (`className` → `class`, `textContent` → text, `id`, `title`, `hidden`, `aria*`, `dataset.*`, …) versus applied per instance.
- **`aka` at compile time.** Aliases must be applied when classifying keys, and templates keyed by config + `aka`.
- **Escaping rules** for baked text and attributes.
- **The walk contract:** a clone's elements in document order ↔ plan nodes in preorder. Repeat containers are empty in their template; `template`-tag children are reached through `.content`.

**Tests:** equivalence. `compileTree` HTML parsed + plan applied ≡ today's `createNode` output, for every scenario in `tests/tree.html`.

## Bruce's Feedback

I'm thinking we are ready to move on to this step now. 

> **The static-key allowlist.** Which literal keys can be baked into HTML (`className` → `class`, `textContent` → text, `id`, `title`, `hidden`, `aria*`, `dataset.*`, …) versus applied per instance.

I think it would be helpful to create a performance benchmark to compare how converting properties that must be applied after cloning vs the equivalent attribute (which may be difficult to determine).  If the difference is minimal, I'm inclined to forgo it.

I am interested in knowing how you will codify the binding so you can locate the node in the cloned template -- will you do so via child indices?

## Claude's Response: Benchmarks and Binding Design

I built **[`demos/compile-benchmark.html`](../../../../../../demos/compile-benchmark.html)**. It uses raw DOM only (no library), with the same static-heavy card as `tree-benchmark.html`: 16 elements, 3 bound values, and **24 static values** (classes, `aria-label`, `role`, literal text). It answers both questions. Every variant is checked to build *identical* DOM before it's timed; that check caught a bug in my own preorder positions on the first run. Medians, Chromium / Firefox / WebKit, ms:

### B3: baking statics into the template vs. applying them after cloning

| Variant | 1k build | 1k + layout | 10k build | 10k + layout |
|---|---|---|---|---|
| **Baked** (attributes / text in the template) | **5.6 / 11 / 7** | 29.5 / 45 / 74 | **51.5 / 113 / 218** | 445 / 550 / 2,624 |
| Statics as **properties** after clone | 9.7 / 21 / 12 (**1.7–1.9×**) | 36.7 / 52 / 78 (1.05–1.24×) | 120 / 197 / 384 (**1.7–2.3×**) | ≈ same (noise) |
| Statics as **`setAttribute`** after clone | 8.5 / 19 / 12 (1.5–1.7×) | 35 / 51 / 265\* | 285 / 168 / 386 (1.5–5.5×) | ≈ same (noise) |

\* The layout columns are noisy. WebKit's identical "baked + layout" measured 74 vs. 239 ms in different groups. I'd read the build columns.

**Finding:** the difference is **not minimal for construction.**
- **Baking makes building ~1.7–2.3× faster** for this card. That's ~4 µs (Chromium) to ~10 µs (Firefox) per card, which is about the same size as the whole Tree-vs-clone gap that's left after Step 1b.
- **Once layout is included, it shrinks** to 5–25% (1k) and disappears into the noise at 10k, as with everything else.
- Assigning properties and calling `setAttribute` after cloning cost about the same.

**Recommendation:** bake, but **only through a small allowlist** where the property ↔ attribute equivalence is unambiguous, which addresses the "difficult to determine" concern:

| Pattern key (literal value) | Baked as |
|---|---|
| `className` | `class="…"` |
| `textContent` / `_` (string pattern) | a text node (only if the element has no spec children) |
| `id`, `title`, `lang`, `dir`, `role` | the same-named attribute |
| `ariaFoo` (ARIA reflection) | `aria-foo="…"` |
| `hidden: true` / `false` | `hidden` present / absent |
| `dataset.foo` (if we allow dotted keys) | `data-foo="…"` |

**Everything else stays a per-instance literal:** `href` / `src` (URL resolution), `value` / `checked` (property ≠ attribute), custom-element properties, `tabIndex`, `style`, anything unknown. It's still correct, just applied after cloning. Step 1b's literal-skip already makes these free on *rebind*, so baking only matters for creation. If profiling later shows a common key worth adding, it's a one-line allowlist entry.

### B4: locating bound nodes in a clone

| Strategy (3 bound nodes) | 1k build | 10k build |
|---|---|---|
| Index paths via `children[i]` | 4.9 / 10 / 24 (1.00×) | 46.7 / 79 / 216 (1.00×) |
| **Index paths via `firstElementChild` / `nextElementSibling` stepping** | **3.6 / 8 / 16 (0.67–0.80×)** | **35 / 63 / 161 (0.75–0.80×)** |
| Preorder walk, recursive | 4.6 / 8 / 16 | 39 / 70 / 192 |
| Preorder walk, `TreeWalker` | 4.2 / 8 / 20 | 35 / 70 / 169 |
| Marker attributes + `querySelectorAll('[data-b]')` | 3.7 / 7 / 17 | 36 / 64 / 140 |

**Findings:**
- All strategies are within ~±25% of each other, and locating three nodes costs ~1 ms per 1,000 cards at most. It's invisible once layout is included. So the choice should be driven by design, not speed.
- **`children[i]` (an `HTMLCollection` lookup) is consistently the slowest.** Stepping through element siblings is consistently among the fastest.
- Marker attributes are competitive, but they add an attribute per bound node to the output DOM, and they'd have to be stripped or tolerated.

### So: yes, child indices, encoded like this

**The plan stores, for each node that needs per-instance work** (dynamic keys, non-bakeable literals, a manager, an event binding, or a repeat), **a short child-element index path relative to the nearest *previously located* node** in preorder (usually its parent or an earlier sibling). It doesn't store an absolute path from the root.

```js
// The card's plan (sketch)
[
  { from: 'root', path: [0, 0], keys: [['textContent', ['name']]] },          // h3.title
  { from: 'root', path: [1, 0, 1], keys: [['textContent', ['height']]] },     // dd (height)
  { from: 1, path: [], up: 1, next: 1, keys: [['textContent', ['mass']]] },   // dd (mass), relative to the previous one
]
```

The exact relative encoding is a Step 2 detail. The principles:
1. **Element-only indices.** Indices count element children only, so whitespace text nodes in a template, or server-rendered whitespace in Step 5, can't shift them.
2. **Stepping, not `children[i]`:** `firstElementChild`, then `nextElementSibling` × *i*, per B4.
3. **Only nodes that need work are located.** Nodes whose statics were all baked are never visited, so a mostly static card locates 3 nodes, not 16.
4. **Paths are used once, at clone time.** Located elements are stored as references (as `TreeNode`s do today), so rebinding never re-walks anything, and DOM changes after creation (managers, events, other code) can't break paths.
5. **No marker attributes** in the output.

**One knock-on design point for Step 3:** with baking, a compiled instance doesn't need a `TreeNode` for every element, only for the located ones (plus repeat containers). That makes the `TreeNode` tree **sparse**. Rebinding walks only those nodes, which is a further rebind win for static-heavy components. Structure changes are detected by the template signature instead of per-node child counts.

### Decisions for you

1. **Baking:** proceed with the allowlist above, or forgo baking despite the ~1.7–2.3× construction gain?
2. **`dataset.foo` keys:** allow dotted keys in the fast path / allowlist, or keep the allowlist to plain identifiers for now? I'd keep it to plain identifiers first.
3. **Sparse `TreeNode`s for compiled instances (Step 3):** agree in principle?

## Bruce's Response

Interesting, significant finding.

I've been quietly asking myself if we shouldn't support something, and your findings have "pushed me over the edge" to the point where I think the benefits outweigh the costs.

textContent I won't question, I think it makes sense to bake in textContent.  I actually think that we should look carefully at =& with join also, and maybe use markers so that more of the static part can be baked in.  And/or also support a second sync processor, "microjoin" that automatically slips in spans, so again more og the template can be baked in (with the benefit of more semantic, search engine friendly output, but probably a small performance cost).

By that I've been questioning is if we shouldn't explicitly allow setting attributes, without the "setAttribute" withMethods approach:

```JS
'type :=': 'number' 
```

Of course, I'm open to suggestions if := is the right operator.  Then we document the performance benefits to the developer of using this fpr statics, and let the developer, with the assistance of DX tools perhaps, make this choice, and not have to maintain an allow list.

Some attributes, like itemprop don't even have property equivalences.

What do you think?  This would be a much more sweeping enhancement, affecting everything, not just the tree.

## Claude's Response: An Attribute Operator, and Baking More of `=&`

### Short version

I think an explicit attribute operator is the right call, and **better than an allowlist**:

- **The developer decides what gets baked,** because a literal `:=` is unambiguously an attribute. No property ↔ attribute equivalence table to maintain, and no guessing.
- **It covers attributes with no property at all** (`itemprop`, `itemscope`, `slot` on some elements, `part`, custom `data-*`, ARIA without reflection in older engines).
- **It's useful far beyond Tree and compiling,** since it works everywhere `assignGingerly` runs.
- **The cost after cloning is the same as for properties** (B3: properties vs. `setAttribute` after cloning were within noise), so using `:=` for *dynamic* values has no performance penalty either.

So: **yes to `:=`, yes to baking `textContent`, measure before baking `join`, and a sync `microJoin` op looks like the better route for "more of the template baked in".** Details below.

### 1. The operator: ` :=`

**The name.** ` :=` fits the existing suffix-operator family (` +=`, ` =!`, ` -=`, ` Y=`, ` ?=`, ` =>`, ` =&`, ` =*`). I checked: it's not used anywhere. The colon reads naturally as "markup attribute". Alternatives I'd avoid:
- an `@name` prefix, because `@` already means `@each` / `@eachTime`;
- Lit-style `.prop` vs. bare attribute, which would invert today's default (bare = property) and break everything.

**Proposed semantics:**

| Pattern | Effect |
|---|---|
| `'type :=': 'number'` | `target.setAttribute('type', 'number')` |
| `'?.querySelector?.input?.aria-label :=': '?.label'` | Navigate the path (with `withMethods`, `aka`, `@each` as usual); **the last segment is the attribute name** |
| value is a string or number | `setAttribute(name, String(value))` |
| value `true` | `setAttribute(name, '')` (a boolean attribute) |
| value `false`, `null` or `undefined` | `removeAttribute(name)` |
| value is an object or array | ignored, with a dev warning (or an array → space-joined tokens, e.g. for `part` / `class`? **your call**) |

### 2. Security: this is the one real risk

Setting `onclick` *as a property* from a string is harmless: it isn't compiled. Setting `onclick` *as an attribute* compiles the string into a live handler. So `:=` makes data-driven XSS easier than properties do. The good news is that the machinery already exists: `DX/strictDefaultPermissions.ts` lists `xssSensitiveAttrs` (the `on*` names), and `PermissionProcessor` already applies `isAllowedUrl` to URL settings. I'd propose:

1. **`:=` always goes through `permissionProcessor.redirectRestrictedProp(target, attrName, value)`,** like property assignment does, so the strict profile covers it automatically.
2. **And, regardless of permissions, `:=` refuses `on*` attribute names** (with a clear error that points to ` +=` event binding). There's no legitimate use for setting inline handler attributes from a pattern, and it's cheap defense in depth.

### 3. In Tree and compiling: no allowlist

| Key | Compiled as |
|---|---|
| `textContent` / `_` / string pattern, **literal** | **baked** (a text node) |
| `name :=` with a **literal** value | **baked** (an attribute) |
| any other literal **property** (`className: 'card'`, …) | applied per instance (it's still skipped on rebind, per Step 1b) |
| dynamic values (properties or `:=`) | applied per instance |

**DX and docs:**
- **Document** the measured trade-off: statics written as `:=` (and text) are free at creation, while statics written as properties cost ~4–10 µs per element-instance.
- **Optionally, a dev-mode hint** listing literal properties that have a known attribute equivalent ("`className: 'card'` could be `'class :=': 'card'` and be baked"), so the choice stays the developer's.
- **Tree's runtime fast path** should handle ` :=` too (literal and path values), so nothing falls back to the slow path just because it's an attribute.

**One open choice:** `className` is by far the most common static, and its equivalence is unambiguous. **Bake `className` too, as the single exception next to `textContent`, or keep it strictly "use `class :=`"?** I lean slightly towards the strict rule (one mental model), but it would mean rewriting most existing patterns to get the benefit.

### 4. Baking more of `=&` / `join`

**`join` into text nodes is possible without markers:**
- The element is located by its element path, and its text children are fully owned by the join, so `childNodes[i]` indices are stable *within that element*.
- Static pieces become baked text nodes, and dynamic pieces become placeholder text nodes whose `.data` is set per instance.
- Optional (all-or-nothing) segments set their static separators to `''`.
- No comment markers are needed; they'd only add nodes.

**But I'm not sure it's faster:** one `textContent` assignment of a concatenated string, vs. cloning N text nodes and setting several `.data` values. That could easily be a wash, or slower. **I'd benchmark it (it's a small addition to `compile-benchmark.html`) before building it.**

**`microJoin` as a sync ` =&` op** is, I think, the stronger idea:
- **Static text is baked,** and each dynamic value goes into its own **element** (`<span itemprop=…>`, `<data value=…>`, `<time datetime=…>`), reusing `builtIns.microDataJoin`'s type → element mapping.
- **Those elements are locatable by element path,** so it fits the compile walk with no text-node handling.
- **The output is semantic and search-engine friendly.** That's the bridge back to the microdata idea Tree set aside, and to TreeScope.
- **Cost:** a few more elements per instance, which I'd also measure.
- **Precedent:** `builtIns.microDataJoin` is an *async* ` =>` handler with comment markers today. A sync ` =&` op would follow the same move `join` already made (handler → sync op), and could eventually supersede it.

### 5. Suggested sequencing

This is a core feature, so I'd treat it as **its own step, ahead of the compiler**, since Step 2's design depends on it:

1. **Core ` :=`** in `assignGingerly`: parsing, path navigation, the semantics above, permissions plus the `on*` guard, `@each` support. Tests for every entry point (`assignGingerly`, `assignFrom` / `assignFromAsync`, Tree, event vectors), plus docs, including the performance guidance.
2. **Tree fast-path support for ` :=`.**
3. **Step 2 compiler,** baking `textContent` and literal ` :=`.
4. **Later, separately:** a `microJoin` sync op, and the `join` text-baking benchmark.

### Questions for you

1. **Operator name:** ` :=`?
2. **Value semantics:** `false` / `null` / `undefined` → remove, `true` → `''`. And arrays: ignore, or space-join?
3. **Always refuse `on*` names in `:=`,** even without a permission processor?
4. **`className`:** bake it as an exception, or strictly `class :=`?
5. **Where to track the core `:=` work:** a new doc (e.g. `Chats/AssignFrom/TODO/AttributeOperator.md`) as its own step, then come back to Step 2?

# Bruce's Response II

1.  Yes.
2.  Arrays: space join (useful for "for", aria attributes)
3.  Makes sense.
4.  Strictly class :=
5.  Yes, let's create a separate doc AttributeOperator

Also, please create separate ones for benchmarking and either discarding baking in partial textContent with join and implementing microJoin (and also benchmark it).  Before coming back to this step.

## Claude's Note

I created the three docs, with your answers recorded as settled decisions. They're also listed in the [README](./README.md) roadmap as steps 1c–1e:

| Step | Doc | Contents |
|---|---|---|
| 1c | [AttributeOperator.md](../../../../AttributeOperator.md) | Full spec, with your five decisions; entry points (`assignGingerly`, `assignFrom`, `@each`, Tree's fast path, compiled baking); docs; tests; three small open questions |
| 1d | [JoinTextBaking.md](./JoinTextBaking.md) | A B5 benchmark (today's `textContent` vs. baked static text nodes), with a ≥ 1.2× create / no-rebind-regression bar for building it; otherwise discard |
| 1e | [MicroJoin.md](../../../../TODO/MicroJoin.md) | A sync ` =&` op reusing `microDataJoin`'s type → element mapping; a B6 benchmark (`join` vs. runtime `microJoin` vs. baked `microJoin`); open question on how the op applies its result (fragment vs. writing into the element) |

Step 2 resumes after these. 

## Bruce's Response III

Can implementation proceed now?  Anything else that needs clarifying/ resolving first?


## Claude's Response III: Ready, Pending Four Decisions

**Short answer:** yes. Steps 1c–1e are done, and nothing earlier in the roadmap blocks Step 2. I re-read `handlers/tree.ts` against the design, though, and four things came up that change what the compiler outputs. Each has a recommended default (marked **(rec.)**), so you can just say "go with the defaults".

### What gets baked (settled by your earlier answers)

| Key (after `aka`) | Literal value | Compiled as |
|---|---|---|
| `textContent` (including the string shorthand and `_`) | a string, number or null | **baked** text, placed before any spec children, as today |
| `name :=` | a string, number, boolean, null, or an array of those | **baked** attribute (`true` → `''`; `false` / null → absent; an array is space-joined) |
| any other property, including `className` | — | applied per instance (and skipped on rebind, as now) |
| anything dynamic: paths, `$root` / `$parent`, `!`, protocols, ` =&`, ` +=`, managers, repeats | — | per instance |

"Literal" uses the same test as Tree's fast path (`isLiteralString`).

### Decision 1: how a template is built on the client, given HTML parser fix-ups

This is the important one. **Parsing an HTML string doesn't always give the DOM that `createElement` + `appendChild` gives:**
- `['table', {}, [['tr', …]]]`: the parser inserts a `<tbody>`;
- `['p', {}, [['div']]]`: the parser closes the `<p>` before the `<div>`;
- nested `<a>`, `<li>` / `<option>` outside their parents, and others;
- `['svg', …]`: Tree's `createElement` gives an HTML-namespace element, but the parser gives a real SVG element.

Any of these would break equivalence, and with it the element-index walk.

- **(a) (rec.)** `compileTree` stays pure, but its main output is a **template description**: a small JSON tree of tags, baked attributes and baked text. It also has a `toHTML()` serializer.
  - The **client builds each template once with DOM calls** from the description, so the result is exactly what `createNode` builds, fix-ups and namespaces included. It's then cloned, so per-instance cost is unchanged.
  - The **HTML strings are for the server** (Step 5) only. There, the signature check (which records the preorder tags) catches any template the parser changed, and the client falls back to building that one itself.
- **(b)** Parse the HTML on the client too, and refuse to compile specs with parser-unsafe nesting. That means maintaining a list of HTML content-model rules, which is the same kind of "difficult to determine" table we avoided with ` :=`.

### Decision 2: full or sparse `TreeNode`s (still open from my earlier list)

The roadmap's principles 2 and 3 say a compiled instance has the **same `TreeNode` tree** as today. A sparse tree would need a second rebind path.

- **(rec.)** Step 3 starts with **full `TreeNode`s**. The clone is walked once in preorder (`firstElementChild` / `nextElementSibling`), and every element gets its `TreeNode`. Rebinding, structure checks and managers then stay exactly as they are.
  - Per B4, walking a whole 16-element card costs about the same as locating 3 nodes by index path.
  - The plan is then simply the preorder node list, where most entries have "no per-instance work".
  - **Sparse nodes become a Step 4 option,** only if the numbers are marginal.
- This also makes relative index paths unnecessary for now. They'd come back with sparse nodes, or with Step 6's adoption.

### Decision 3: baking `microJoin`

A pure compiler **can't know the element types**: whether a value renders as `<span>`, `<data>` or `<time>` depends on the value at runtime.

- **(rec.)** **Bake speculatively.** The compiler bakes the static text plus a `<span>` shell for each reference or segment (with `itemprop` and `itemscope` where there's a `prop`), assuming all optional groups are present.
  - That's safe because `microJoin` already checks the structure: when a value turns out to be a number or `Date`, or a group is missing, it just re-renders that element's content. A wrong guess is never wrong output, only a bit slower.
  - **Optionally, later:** a segment type hint (`{ prop, val, as: 'number' | 'date' }`) to bake the right shell. I wouldn't add it until a benchmark asks for it.
  - **One fix this needs:** the parser merges adjacent literal strings into one text node, so `microJoin` should merge adjacent text items too. Otherwise baked shells never match. It's a small change to `microJoin.ts`.
- **(alt.)** Don't bake `microJoin` in Step 2, and keep it per instance. That's simpler, but it gives up the reason it was built.

### Decision 4: permissions for baked attributes

At runtime, ` :=` goes through `permissionProcessor.redirectRestrictedProp`. Baked literals would skip it.

- **(rec.)** `compileTree` takes an optional `canBake(attrName, value)` predicate. Step 3 wires it to the active permission processor, so a literal the profile would refuse (e.g. a `javascript:` URL) **stays per instance** and gets refused there as usual. Compiled templates are cached per (spec, `aka`, permission profile).
- `on*` names are already refused by ` :=` itself, at compile time too.

### Smaller points (no decision needed unless you object)

- **Ordering edge case:** baked statics behave as if applied *before* every dynamic key. That differs from today only when a pattern sets the same attribute both statically and dynamically, with the dynamic key first. I'll document it rather than detect it.
- **Managers** see baked attributes and text already present when they attach (today they attach first). That's the same as Step 6's server-rendered adoption, and arguably better.
- **Wildcard `'*'`:** its spec is static, so it compiles to one template like any key.
- **Template ids:**
  - `key` for a top-level key;
  - `key>n/each` and `key>n/empty` for the repeat at preorder index `n`, recursively.
  - Step 5 can revisit the format.
- **Location:** `handlers/compileTree.ts`, with the pure output types in `treeTypes.d.ts`, exported from `package.json` for server use.
- **Tests:** equivalence needs something that applies the plan. Step 2 will include a minimal `instantiate(compiled, vm)` (clone + preorder walk + per-instance keys), and the tests compare its output with `createNode`'s for every `tests/tree.html` scenario. Step 3 then puts that into Tree with `TreeNode`s.

### To proceed

If you're fine with the four recommendations, I'll start on Step 2 as described, beginning with the `microJoin` text-merge fix.

## Bruce's Response IV

**Decision 1**

a. sounds right, especially with a recommendation below

**Decision 2**

I need to read through this more carefully.  You mentioned some previous discussion which I guess I should review.  I may ask for a dumbed-down explanation of it.  I'm likely to defer to your recommendations.

** Decision 3**

This is the one I've been thinking about the most.  Tying this to Decision 1, I wonder if we can insist that we only compile the template after we have a sample vm with actual data.  If the vm indicates what type of data is there (say with the first element of any applicable array), then we compile the built baked in static text nodes and the empty span / data / time tags for dynamic data.  If any of the object is missing a property, don't bake it in.

Another thought is to put a template placeholder where the span / data / time tag will go in the template.

Let me know if any of those ideas would help, or if we should just not bother and leave all such slots empty (basically the alt)

**Decision 4**

The recommended approach sounds promising.  Can you illustrate that with a simple example, or point me to whee you already did?

## Claude's Response IV

### Decision 1

Noted: (a).

### Decision 2, in plain terms

Today, Tree keeps a small JavaScript record (a `TreeNode`) **for every element it created**. On a rebind, it walks those records alongside the spec and updates each element. That walk is how it finds elements without querying the DOM.

The question is what a **cloned** instance should get:

- **Full (rec.):** after cloning, walk the clone once and make a `TreeNode` for every element, exactly as `createNode` would have.
  - Everything that happens afterwards (rebinding, managers, `ctx.rebind()`, structure checks) is today's code, unchanged.
  - The walk is cheap. B4 showed that visiting all 16 elements of a card costs about the same as jumping to just the 3 that have data.
- **Sparse:** make `TreeNode`s only for elements that have per-instance work (the 3 of 16), and skip the purely static ones.
  - That would save a little memory and some rebind time.
  - But rebinding would need a second implementation that understands "gaps", and that duplicates the most delicate part of Tree.

"The previous discussion" was just Decision 3 in my *Benchmarks and Binding Design* response above, where I first floated the sparse idea. **Recommendation:** full now, and sparse only if Step 4's numbers say compiling is marginal.

### Decision 3: your ideas

**A sample VM: yes, and it fits naturally.** Step 3 already compiles lazily, on first use, so the first instance's data is right there. The server (Step 5) renders with data too. So:

- `compileTree(spec, { sample })` stays pure. The sample is just one more input.
- For each `microJoin`, the compiler resolves its references against the sample and bakes a shell of the matching type, plus the static text:
  - number → `<data>`
  - `Date` → `<time>`
  - otherwise → `<span>`
- **If anything in it resolves to null or undefined** (including a missing optional group), **that `microJoin` isn't baked.** The element stays empty in the template and renders per instance, exactly as you suggest.
- **Repeats:** the first item of the array is the sample for the `each` template. With an empty array there's no sample, so nothing in that template's `microJoin`s is baked.
- **Safety:** if a later instance's types differ from the sample's, `microJoin`'s structure check re-renders that one element, so the output is always correct. The sample only decides how often baking pays off.
- **What isn't resolved at compile time:** a `microJoin` whose references use protocols or `$root` / `$parent` isn't baked. Pipes need the same `pipes` option as at runtime, which Step 3 has.

**A placeholder where each tag goes:** I'd skip it. Each instance would have to *replace* the placeholder with the real element, which costs as much as creating the element. It also adds a node to every clone, and `microJoin` would see a structure it doesn't recognize. The sample idea gets the real tag in without a placeholder.

**Summary:** sample-based baking, with "don't bake" as the fallback, so the alt is only the fallback. I'd still make the small `microJoin` fix (merging adjacent literal strings into one text node), because baked text gets merged by the template.

### Decision 4: an example

```js
// A pattern with three literal attributes
['a', { 'class :=': 'link', 'href :=': 'javascript:alert(1)', 'aria-label :=': '?.label' }]
```

- `class :=` is a literal, and the permission check allows it → **baked**: `<a class="link">` is in the template.
- `href :=` is a literal, but the strict profile refuses `javascript:` URLs → **not baked**. It stays a per-instance key, where the normal runtime check refuses it with the usual warning. The result is identical to today: no `href`.
- `aria-label :=` is dynamic → per instance, as always.

In code, it's roughly:

```js
compileTree(spec, {
    sample,
    canBake: (name, value) => !permissionProcessor || permissionProcessor.allows(element, name, value),
});
```

`allows` here stands in for whatever check `redirectRestrictedProp` makes (Step 3 will expose it as a side-effect-free check). Without a permission processor, every literal ` :=` is baked. I haven't illustrated this anywhere else before; this is the first concrete example.

### Status

With your answers, the only item still open is **Decision 2**. Unless you say otherwise, I'll proceed with "full". Ready to start when you are.

## Bruce's Response V

Let's go with the recommended "full" for Decision 2.  Please proceed and add your implementation notes below.

## Claude's Implementation Notes

Step 2 is done. The compiler is **[`handlers/compileTree.ts`](../../../../../../handlers/compileTree.ts)**, exported from `package.json` as `./handlers/compileTree.js` and added to `tsconfig.json`. **Tests:** 43 / 43 pass in Chromium, Firefox and WebKit. **Full suite: 133 passed, 2 skipped, 0 failed.** `tsc` is clean, in the scratch copy; no `.js` touched.

### API

```js
import { compileTree, buildTemplate, toHTML } from 'assign-gingerly/handlers/compileTree.js';

const compiled = compileTree({ map, aka }, { sample: vm, resolveOptions: { pipes }, canBake });
// compiled.keys            → map keys in order ('*' included)
// compiled.templates[id]   → { id, element, node, signature }
buildTemplate(compiled.templates.launch);   // client: an HTMLTemplateElement, built with DOM calls (Decision 1a)
toHTML(compiled.templates.launch.element);  // server: the same template as an HTML string
```

| Output | What it is |
|---|---|
| `element` (`TemplateElement`) | The template as pure data: `{ tag, attrs, content }`, with baked attributes, text and `microJoin` shells. |
| `node` (`CompiledNode`) | Nested like the spec: `spec`, `tag`, `ish`, `pattern` (the whole pattern, the same object Tree normalizes to), `dynamic` (the keys left to apply per instance), `children`, and `repeat` (`{ spec, each, empty }` template ids). Full nodes (Decision 2): every spec element has one, and a clone's element children match `children` in order. |
| `signature` | 32-bit FNV-1a, as 8 hex digits, of the markup plus the node shape (tags, managers, repeat references). It's for Step 5 (validating server copies). |

**Template ids:**
- a map key's template has the key as its id;
- the repeat at preorder index `n` of template `T` has `T>n/each` and `T>n/empty`;
- e.g. `list`, `list>0/each`, `list>0/each>2/each`.

### What's baked

| Key | Baked when | Notes |
|---|---|---|
| `textContent` (including the string shorthand and `aka` aliases such as `_`) | The value is a literal | Not for `script` / `style` (raw text). |
| `name :=` | The value is a literal, or an array of literals, and `canBake(name, text)` allows it | `false` / `null` bake as "absent". Never `on*`, and never an aliased name; those are left to runtime, which applies its own rules. |
| `'?. =&': { microJoin }` | A sample is given, the element has no spec children or repeat, every reference is a plain `?.` path (optionally `!` / `!!`), and every value is present in the sample | The static text, plus empty `<span>` / `<data>` / `<time>` shells chosen from the sample's types, with `itemprop` and `itemscope`. The key itself stays per instance, and its first run fills the shells in place. |

**Everything else stays in `dynamic`:**
- properties, **including `className`** (the strict `class :=` rule);
- paths, `$root` / `$parent`, protocols;
- events, ops and handlers.

**Two identity details:**
- When nothing in a pattern is baked, `dynamic` *is* the original pattern object, so Tree's per-pattern caches (the fast path, `plainPatterns`, event keys) still hit.
- When everything is baked, `dynamic` is `undefined`.

### Samples (Decision 3)

- **The top-level sample** is `sample[key]`. Within a **repeat**, it's the first item of the array at `of` (only for `?.` paths). `empty` uses the repeat's own value.
- **No sample:**
  - for `'*'`, since any key can use it;
  - under a manager (`ish`), whose subtree resolves against the manager instance;
  - for an empty array.
- **Resolution:** sample values are resolved with `getValues`, with the given `resolveOptions` (e.g. `pipes`). Anything that throws isn't baked.

### Changes elsewhere

- **`handlers/treeSpec.ts` (new, pure):** `normalize`, `isLiteralString`, `WILDCARD` and `DEFAULT_WILDCARD_PATTERN` moved here from `tree.ts`. Tree and the compiler now share one definition of the spec format and of "literal". `ManagerRef` / `NormalizedSpec` moved to `treeTypes.d.ts`.
- **`syncOps/microJoin.ts`:**
  - new exported `planMicroJoin(args, rawArgs, protocols)`, the pure item/shape planning, used by the op and by the compiler;
  - adjacent literal strings are now merged, and empty ones dropped, so the op's text nodes match a baked template.
  - Its item, shape and plan types moved to `types.d.ts`.
- **Types:** `TemplateElement`, `CompiledNode`, `CompiledRepeat`, `CompiledTemplate`, `CompiledTree` and `CompileTreeOptions` are in `treeTypes.d.ts`.
- **Docs:** `docs/sync-ops.md` notes the text merging. `compileTree` gets user docs in Step 3, when the `compile` option makes it useful on its own.

### Tests: [`tests/compile-tree.html`](../../../../../../tests/compile-tree.html) (+ spec), 12 scenarios

**Equivalence check:**
- The page has a minimal clone-and-bind instantiator, which builds each template, imports a clone, walks it alongside the nodes, applies `dynamic`, and stamps repeats.
- Its output is compared with `builtIns.tree`'s, via a canonical serialization (text-node boundaries kept, attributes sorted).

**Scenarios:**
1. A static-heavy card: baked markup, `dynamic` per node, `className` not baked, pattern identity kept.
2. `aka` (`_` → baked text).
3. Repeats: flat item templates, ids, nested repeats, `empty`, and baked text in a repeat container (items go before it, as in Tree).
4. Parser-unsafe specs: `table > tr` (no `<tbody>`), `p > div`, `svg`, and `template` content.
5. `microJoin` with a sample:
   - typed shells and merged text;
   - the first run fills the shells *in place* (same elements);
   - a missing sample value, no sample, or a manager → not baked;
   - a wrong type guess still renders correctly.
6. `microJoin` in a repeat (the first item is the sample).
7. `canBake` refusing `href`; `on*` never baked.
8. Nothing static: `dynamic === pattern`.
9. `toHTML` escaping and void elements; HTML round-trips for parser-safe specs.
10. Signatures: stable, and they change with markup and with managers.
11. The wildcard (`'*'`), with its default pattern.
12. `microJoin` text merging.

### One thing the tests surfaced

**Attribute order.** Baked attributes come first, so `<p data-tags="a b" class="note">` (with `class` from a per-instance `className`) where Tree produces `<p class="note" data-tags="a b">`. Attribute order has no meaning in the DOM (selectors, `getAttribute` and microdata all ignore it), so the equivalence check compares attributes as a set. It is visible in `outerHTML`, though, so Step 3's docs should mention it alongside the "statics first" rule.

### Next: Step 3

Put the instantiator into Tree, behind the `compile` option, with full `TreeNode`s:
- the template registry;
- `importNode` for custom-element upgrades;
- wiring `canBake` to the permission processor (a side-effect-free check);
- running the whole `tests/tree.html` suite with compiling on.

