# Add Prop with Micro Join DX

## Bruce's Ask

The tree's [DX support does](../../../../../docs/tree.md#authoring-with-a-lit-like-tree-tagged-template-literal-optional) this:

```JS
const map = {
    launch: tree`
        <article class="card" aria-label=${p.label}>
            <p>Launched ${p.date} by ${p.rocket}</p>
            
        </article>`,
};
// → ['article', { 'class :=': 'card', 'aria-label :=': '?.label' }, [
//       ['p', { '?. =&': { microJoin: ['Launched ', '?.date', ' by ', '?.rocket'] } }],
//       
//   ]]
```

Can we instead specify the prop:

```JS
['p', 
    { 
    '?. =&': 
        { 
            microJoin: [
                'Launched ', 
                {prop: 'date', val: '?.date'} , 
                ' by ', 
                {prop: 'rocket', val: '?.rocket'}
            ] 
        } 
    }
],
```

## Claude's Response

**Yes, and it already works today, explicitly.** A `{ prop, val }` object in mixed text passes straight into the `microJoin`. `val` may be a `paths()` proxy, and `text` (a display override) works too. I checked against the current `DX/tree.ts`:

```JS
tree`<p>Launched ${{ prop: 'date', val: p.date }} by ${{ prop: 'rocket', val: p.rocket }}</p>`
// → ['p', { '?. =&': { microJoin: ['Launched ', { prop: 'date', val: '?.date' }, ' by ', { prop: 'rocket', val: '?.rocket' }] } }]
```

`md` segments work as well (`` ${md`${p.date}`[0]} ``), but that's clumsy. So the real question is a **shorter way to say "give these values props"**. Below are my proposal and the decisions it needs.

### Proposal: `itemscope` on the element turns it on

Writing `itemscope` on the element, which is HTML's own way of saying "this has microdata", makes every value in its text a `{ prop, val }`. The prop name comes from the path:

```JS
tree`<p itemscope>Launched ${p.date} by ${p.rocket}</p>`
// → ['p', { 'itemscope :=': true, '?. =&': { microJoin: ['Launched ', { prop: 'date', val: '?.date' }, ' by ', { prop: 'rocket', val: '?.rocket' }] } }]
// renders <p itemscope>Launched <time itemprop="date" …>…</time> by <span itemprop="rocket">…</span></p>
```

- **Opt-in, per element.** Templates without `itemscope` produce exactly what they do today. That matters because the tree demo is "no microdata, by design", and adding `itemprop` / `itemscope` everywhere would change markup that people already have.
- **It's what microJoin does anyway.** Once there are props, `microJoin` adds an empty `itemscope` to the element if it lacks one. Writing it in the template just says so up front, and it gets baked under `compile`.
- **It works for `'?.'` strings and `paths()` proxies alike** (`${'?.date'}` → `{ prop: 'date', val: '?.date' }`).
- **Explicit objects still win.** `${{ prop: 'launched', val: p.date, text: '?.date?.longUtc' }}` keeps its own name and display text. A literal string stays text.
- **A one-value element** (`<b itemscope>${p.name}</b>`) also becomes a one-segment `microJoin` instead of `textContent`, since `textContent` can't carry a prop.

### Decisions

1. **The trigger:** the `itemscope` attribute (recommended)? Or a helper instead, e.g. `` ${prop(p.date)} `` / `` ${prop('launched', p.date)} `` per value? A helper could be added too, for mixing props and plain values on one element.
2. **Naming the prop from a path:**
   - **(a) The last segment,** as `md` does: `?.rocket?.name` → `name`. The catch is that a pipe at the end names the prop after the pipe: `?.date_utc?.parseDate?.longUtc` → `longUtc`.
   - **(b) The last segment that isn't a pipe.** The DX can't know the pipes, so it would need them passed in, or a convention.
   - **(c) The first segment:** `?.date_utc?.parseDate?.longUtc` → `date_utc`, but `?.rocket?.name` → `rocket`.

   I'd go with **(a)**, matching `md`, and say in the docs that formatted values should be written explicitly as `{ prop, val: p.date_utc, text: '?.date_utc?.parseDate?.longUtc' }`. Then `val` stays the raw data (a `<time datetime>` / `<data value>`) and `text` is the display. That's better microdata than naming the formatted string anyway.
3. **`$parent?.x` / `$root?.x` paths:** prop from the last segment as well, i.e. `x`?

**If you agree,** I'll implement it in `DX/tree.ts` (and `analyzeTree`), add tests in `tests/dx-tree.html`, document it in `docs/tree.md`'s DX table, and add the hover wording in the analyzer.

## Bruce's Response I

Sounds good.  Please implement.

