# AI Optimized Reference

## Bruce's Ask

This is, at this point, an idle question.  If we do anything for this, I think it should be done later.

I've been suggesting / guiding the documentation somewhat, mostly with a human reader in mind, keeping detailed discussion in separate documents, having examples, etc.

I'm curious if you were to write documentation on this project optimized so a new session or AI agent could "grok" every aspect of this package as efficiently as possible would that documentation take a very different shape?  Would it be a single document?  What form would it take?

Please provide your thoughts on this below.


## Claude's Thoughts

**Yes, it would take a noticeably different shape.** It wouldn't be a single document, and it wouldn't replace the human docs. It would be a small, dense layer on top of them. Here's my reasoning, partly from what actually cost me time in these sessions.

### What an agent's reading costs today

Everything an agent reads uses up its working context, so size is the first constraint:

| Source | Size | Roughly, in tokens |
|---|---|---|
| README.md | 24,300 words (5,400 lines) | ~35K |
| docs/*.md | 33,100 words | ~45K |
| Chats/ | 208 files, 280,000 words | ~400K |
| types (`.d.ts`) | 8,500 words | ~12K |

**The README plus docs fit,** but they would fill a large part of a session before any work starts. The Chats don't fit at all. In practice, I read selectively: grep for a name, read the section, read the source. What I was missing was rarely *explanation*. It was **orientation** (what exists, and where) and **facts that aren't written down anywhere**.

### What cost me time (the gaps a reference would close)

- **Build and environment facts:**
  - `handlers/lazyLoad.ts` wasn't compiled, because it isn't in tsconfig's `include` and nothing imports it statically;
  - spa-ssi only serves files that existed when it started;
  - the tests hardcode `localhost:8000`;
  - o2h's `node_modules` lags the sibling assign-gingerly;
  - workers can't use import maps.
- **Invariants that are only implicit:**
  - Tree's records and its start-marker WeakMap;
  - "the spec is treated as immutable under `compile`";
  - which modules must stay DOM-free (o2h depends on it);
  - what `adopt` expects slot by slot.
- **"Not supported" facts:** dynamic SVG, holes in nested templates, class headers. Without an explicit list, an agent tends to assume a feature exists, or reinvents one.
- **Where the "why" lives:** decisions are spread over 208 chat files. I found the relevant one by memory of this conversation, which a new session wouldn't have.

### The shape I'd suggest

**A short entry point, plus four dense layers,** each linking to the human docs and the source for depth:

1. **An index** (`llms.txt` style, a convention some projects use for exactly this; or a section of AGENTS.md): one line per module, doc and test file, saying what it is and where. It should be a few hundred lines at most, so an agent can read all of it first.
2. **A syntax and semantics reference:** the pattern-key grammar as tables, not prose.
   - **One row per operator or form:** ` :=`, ` +=`, ` =>`, ` =&`, ` ?=`, `?.` paths, `$parent` / `$root`, `!` negation, protocols, pipes, `#[…]`, trailing `/* */` in map keys…
   - **For each:** its exact syntax, semantics, defaults, errors, and one canonical example.
   - **The same for each handler's config,** and for Tree's spec forms.

   This is where agent docs differ most from human docs: **exhaustive and precise, rather than narrative with several examples.**
3. **An architecture map:** how a call flows (`assignFrom` → `categorizeKeys` → handlers / sync ops → `getValues` → `assignGingerly`), Tree's records and walk, what's pure (DOM-free) and what isn't, and o2h's relationship to Tree. Short, with file and function names, so the source is one jump away.
4. **Invariants, decisions and limits:**
   - **Decisions:** one line each, with a link to the chat that made them. ("Snippets come from options, never config or data: security", and so on.)
   - **"Not supported (yet)":** an explicit list.
   - **Operations:** the build and test facts above.

**Two sources an agent already reads well are worth pointing to rather than duplicating:**
- **The `.d.ts` files** are the most efficient reference there is, at ~12K tokens with their doc comments: exact, and checked by the compiler. The reference should say "types are authoritative; read them".
- **The tests are an executable specification.** A table of "feature → the test file that covers it" lets an agent confirm behavior instead of guessing.

### Single document, or several?

**A single compact reference** (perhaps 1,500–2,500 lines) covering layers 2–4, plus the short index, is about right. It's small enough to read whole when needed, and greppable otherwise. Splitting further would bring back the orientation problem. Merging it into the README would bury it under the human-oriented material.

### The real risk: staleness

**Agents trust documentation more literally than people do.** A wrong line in a human guide is an annoyance; in an agent reference it becomes a confident bug. So:
- **Generate what can be generated:** the export map (from `package.json`), the options list (from the `.d.ts`), the operator list (from the code that recognizes keys), and the test inventory. A small script can rebuild those parts.
- **Check what can't be generated:** a test that fails when the operator table and the key categorization disagree, for example.
- **Keep the hand-written parts** (architecture, invariants, decisions) short, and add to them in the same change that alters the behavior, as CLAUDE.md already does for build rules.

### If and when you want it

When you get to it, I'd start with layer 4 (invariants, limits, operations) and the index. Those are the facts that are nowhere else, and they have the highest value per line. The syntax tables can follow, generated where possible. AGENTS.md would then point to all of it.
