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

