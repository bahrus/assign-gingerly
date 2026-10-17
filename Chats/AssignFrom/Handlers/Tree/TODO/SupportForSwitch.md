# Support For Switch

## Bruce's Ask

I feel for a templating language to be "turing complete" to use that term very loosely, it needs support for:

1.  Looping
2.  Nesting
3.  Conditional Switching

The first two are there now.  Can you construct a demo, or enhance the existing demo, to provide a realistic scenario where there are multiple view conditions (not just two views where if/else suffices, but a switch), and can you propose syntax to support it.

## Claude's Response

Agreed: Tree has looping (`each`) and nesting, but no way to pick **which structure** to render from the data. Below:
1. what's possible today, and why it falls short;
2. a proposed syntax, for the raw notation and for `` tree`…` ``;
3. a demo scenario;
4. the questions to settle before I build it.

### 1. What exists today, and the gap

| Mechanism | What it switches | Why it isn't a switch |
|---|---|---|
| `' ?='` ternaries, incl. comparisons and nesting (`[[lhs, '===', rhs], a, b]`) | **Values** (text, classes) | Can't change the elements. The demo's status badge is this: one `<span>`, three texts. |
| A nullish key is skipped (`keepNullish` off) | **Whether** one key renders | That's an `if`, not a switch. For N views, you need N keys and a VM (or manager getters) that nulls all but one. That spreads one decision over N places, and over the VM's shape. |
| `` ${cond ? tree`…` : tree`…`} `` in a template | **Nothing at render time** | `${…}` runs once, when the template is built, so it bakes one branch into the spec. That's an easy trap for anyone used to lit. |
| `builtIns.lazyLoadSwitch` | `<template>`s in the page | Outside Tree, async, and one handler per case. |

**The missing piece:** a spec that picks one of several element specifications **from the data, on every render**.

### 2. Proposed syntax

#### Raw notation: a `switch` object, wherever an element specification goes

```JavaScript
status: {
    switch: '?.phase',                       // the discriminant, resolved against this position's value
    cases: {
        scheduled: ['section', { 'class :=': 'card phase scheduled' }, [
            ['h3', 'Scheduled'],
            ['p', '?.window'],
        ]],
        hold: ['section', { 'class :=': 'card phase hold' }, [
            ['h3', 'Hold'],
            ['p', '?.reason'],
        ]],
        scrubbed: ['section', { 'class :=': 'card phase scrubbed' }, [ /* … */ ]],
        success:  ['section', { 'class :=': 'card phase success' }, [ /* … */ ]],
    },
    default: ['p', { 'class :=': 'muted', _: 'Status unknown.' }],   // optional
}
```

```TypeScript
type Switch = { switch: string; cases: Record<string, ElementSpecification | null>; default?: ElementSpecification };
type ElementSpecification = Header | [Header, …] | [Header, …, …] | Switch;
```

- **Where:** anywhere an `ElementSpecification` goes: a `map` value, a static child, a repeat's `each` (per-item switching) or `empty`, a case of another switch. It's told apart from a header by its `switch` key, as a repeat is by `each` and a nested tree by `map`.
- **Matching:** the discriminant is resolved like any RHS value (`'?.phase'`, `'$parent?.mode'`, pipes too). It's matched with `String(value)` against the `cases` keys, so the notation stays JSON. Nullish, or no matching key, means `default`. With no `default`, nothing is rendered. A case set to `null` renders nothing explicitly.
- **The chosen case's value:** the same value the switch position has. A switch is a choice, not a new scope.
- **Rebinding:**
  - **Same case as last time:** rebound in place, like any element.
  - **Different case:** the old element is removed, along with any manager state, and the new one is built. That's Tree's existing rule, "a different structure is rebuilt", applied per case.
- **Its slot is stable:** when nothing renders, a switch keeps an empty marker in its position. Its siblings, and a parent's "number of children" check, don't see a change, so nothing around it is rebuilt.
- **`compile`:** each case compiles to its own template, as `each` and `empty` already do.

#### `` tree`…` ``: a `choose(on, cases, fallback?)` helper, as content

This mirrors lit's `choose` directive (lit's `when` is its if/else). It's a helper like `each`, but it goes in **content** position, where a nested `` tree`…` `` goes, since it stands for one child:

```JavaScript
import { tree, each, choose } from 'assign-gingerly/DX/tree.js';

map: {
    // A whole map value can be a switch: no tree`…` needed around it
    status: choose('?.phase', {
        scheduled: tree`
            <section class="card phase scheduled">
                <h3>Scheduled</h3>
                <p>Window opens ${'?.window?.parseDate?.longUtc'} UTC</p>
            </section>`,
        hold: tree`
            <section class="card phase hold">
                <h3>Hold</h3>
                <p>${'?.reason'}</p>
                <p>Resuming in ${'?.resumeIn'} min</p>
            </section>`,
        // scrubbed, inFlight, success, failure: likewise
    }, tree`<p class="muted">Status unknown.</p>`),

    // Per-item switching: each()'s single child is the item, and here the item is a switch
    timeline: tree`
        <ol class="timeline" ${each('?.', { key: '?.t' })}>
            ${choose('?.kind', {
                milestone: tree`<li class="milestone">T+${'?.t'}s ${'?.label'}</li>`,
                anomaly:   tree`<li class="anomaly"><strong>${'?.label'}</strong> <em>${'?.detail'}</em></li>`,
                note:      tree`<li class="note">${'?.label'}</li>`,
            })}
        </ol>`,
}
```

- **`choose` produces the `switch` object above**, so the config stays plain JSON.
- **Cases are an object, not lit's `[value, () => html…]` pairs.** The DX produces JSON, and the keys must be strings anyway.
- **Gingerly Tree Analyzer** would learn `choose`: hovering shows each case's notation, and each case's errors are reported where they are.

#### Alternatives I considered and don't recommend

- **Markup syntax** (`<template switch=${…}><template case="hold">…`). It's heavier for the parser, it's unlike lit, and it reads worse than a helper.
- **An ordered list of conditions** (`when: [[cond, spec], …]`) instead of value matching. This is an if/else-if chain. It could reuse `' ?='`'s condition syntax (`'?.x'`, `[[lhs, '>', rhs]]`). It's useful, but most real switches are on a discriminant (status, kind, type, route). I'd add it later if needed: see question 2.

### 3. The demo: a mission status panel and a flight timeline

**I'd enhance `demos/tree-demo.html`**, because it already has the if/else-if version to contrast with: the status badge's nested ternary changes *text* only. The additions:

1. **A "Mission status" card**, a `choose` over six phases: `scheduled`, `hold`, `scrubbed`, `inFlight`, `success`, `failure`. Each phase has genuinely different markup:
   - **scheduled:** the window and a countdown;
   - **hold:** the reason and a resume time;
   - **scrubbed:** the reason and the new date;
   - **inFlight:** live altitude and speed;
   - **success:** the landing and the payload deployed;
   - **failure:** the failure list.

   A **"Next phase"** button steps through a simulated live feed. A **"Tick"** button changes values within the current phase. The log then shows that a phase change rebuilds only the card, and a tick rebinds it in place.
2. **A "Flight timeline"**: a list of mixed events (milestone, anomaly, note), each with its own markup. That's the case where if/else really can't keep up, and it shows `choose` inside `each`.
3. **Data:** the phase feed and the timeline are UI-state overlays in the page, as `details` and `links` already are. `data/launch.json` doesn't change.

### 4. Questions

1. **Naming in the notation:** `{ switch, cases, default }`? (`switch` is fine as a JSON key, though JS doesn't allow it as a function name, hence `choose` in the DX.)
2. **v1 scope:** value matching only, with an ordered-conditions form (`when`) later? Or both now?
3. **DX name:** `choose`, after lit's directive? Or `match` or `cases`?
4. **Leaving a case:** discard it (my recommendation, consistent with Tree rebuilding a changed structure)? Or keep it alive but hidden, as `lazyLoad` can, so a manager's state survives switching back?
5. **Demo:** enhance `tree-demo.html` (recommended), or a separate `tree-switch-demo.html`?

**If you agree,** I'll do it in this order:
1. `switch` in `handlers/tree.ts` (and `compileTree.ts`), with types in `treeTypes.d.ts`, tests, and docs in `docs/tree.md`;
2. `choose` in `DX/tree.ts`, with `analyzeTree` support;
3. the demo;
4. the analyzer.

## Bruce's Response I

I agree with all your recommendations, except 4.  I'm on the fence on that one. Maybe there should be an option to decide whether to retain and hide or discard.  We an always add it later if that seems like the better approach.

## Claude's Implementation Notes

Done, as proposed. **On question 4, v1 discards** the case it leaves. A "retain and hide" option can be added later without changing the notation, since a slot already remembers the case it rendered. Nothing is committed.

**Results** (in a scratch copy, as before, so your `.js` is untouched):

| | |
|---|---|
| New `tests/tree-switch.html` | **49 / 49**, in Chromium, Firefox and WebKit |
| Full Playwright suite | **155 passed, 4 skipped** (the same 4 as before) |
| `tsc --noEmit` | clean |
| `demos/tree-demo.html`, driven in Chromium | every phase and tick as intended, no console errors |
| gingerly-tree-analyzer | unit 29 / 29, e2e and web pass, typecheck clean |

### 1. Tree: `{ switch, cases, default }`

- **`handlers/tree.ts`:**
  - A switch becomes a **slot** node: `syncSwitch` resolves the discriminant, picks the case, and renders it against the same value.
  - **The same case** is rebound in place. **Another case** replaces the previous element with `replaceWith`, so the parent, the siblings and the caller's bookkeeping see no change.
  - **Nothing to render** (a `null` case, or no match and no `default`): a `<!--?switch-->` comment holds the slot.
  - It works everywhere a spec goes: map values (`'*'` included), static children, a repeat's `each` and `empty`, and nested switches.
- **`handlers/treeSpec.ts`:** `isSwitch` and `checkSwitch` (clear errors for a non-string `switch` or missing `cases`).
- **`handlers/compileTree.ts`** (`compile`):
  - **Each case gets its own template:** `<id>/case:<key>` and `<id>/default`. The switch itself is a `CompiledSwitch`, in a new `switches` record on `CompiledTree`.
  - **A switch among static children** has no element in its parent's template. At clone time a placeholder holds its slot, and its case is cloned into it.
  - The test checks that compiled and uncompiled trees produce identical markup through every case change.
- **Types** (`types/assign-gingerly/treeTypes.d.ts`): `SwitchSpecification` (now part of `ElementSpecification`), `CompiledSwitch` and `ChooseCases`. **`types` is a submodule**, so that change needs its own commit there.

### 2. DX: `choose(on, cases, fallback?)`

- It produces the switch object, and it's recognized as a child in content position. That covers `each(…)`'s item, too.
- **Results are cached**, so the same choice returns the same object, as `` tree`…` `` does, and spec identity holds across calls. The cache keeps the last 8 per discriminant.
- **`analyzeTree`** accepts it, including with a `TreeUnknown` discriminant.

### 3. The demo (`demos/tree-demo.html`)

- **Mission status:** `choose` over `scheduled`, `hold`, `inFlight`, `success`, `scrubbed` and `failure`, each with its own markup:
  - scheduled: a countdown;
  - hold: a hold reason;
  - in flight and success: spec rows;
  - failure: a nested `each` list.

  A `telemetryLost` status has no case, so it shows the fallback.
- **Flight timeline:** `choose` as `each`'s item. Milestones and anomalies have their own markup. A `telemetry` event has no case, so it gets the fallback.
- **"Next phase"** steps through a simulated status feed, and the log confirms that only the card is replaced. **"Tick"** changes values within a phase, and the log confirms the same card is rebound.
- **The status badge's text-only ternaries** are mentioned as the contrast.

### 4. Docs

`docs/tree.md` now has:
- a **Switches** section: the notation, `choose`, matching, rebinding, why `${cond ? … : …}` doesn't work, and `compile`;
- the `Switch` type in *Element Specifications*;
- a `choose` row in the DX table.

### 5. Gingerly Tree Analyzer

- **`choose(…)` is now evaluated with stand-ins,** as `each(…)` is. Hovers show the switch in the notation, and errors inside its cases are underlined where they are.
- **A project whose assign-gingerly predates `choose`** gets `‹…›` there, rather than an error.

**Something to know:** your `npm run update` there had moved the analyzer to `typescript@7.0.2`, which has no JS compiler API, and every test failed. That was the risk I flagged in the analyzer's notes. It had also bumped `@types/vscode` past `engines.vscode`, which `vsce` refuses to package. I restored both, and added `.ncurc.json` (`"reject": ["typescript", "@types/vscode"]`) so `npm run update` leaves them alone. The README explains why.

### To do on your side

1. **Run your build** in assign-gingerly, to get the `.js` for `DX/tree.ts`, `handlers/tree.ts`, `handlers/treeSpec.ts` and `handlers/compileTree.ts`.
2. **Commit the `types` submodule** separately.
3. **Rebuild or repackage the analyzer** when convenient. It bundles assign-gingerly from source, so it picks up `choose` automatically.

