# A `pluck` data pipe: one property from each item

Follows on from [PipesAsData](./PipesAsData.md).

---

## AI Proposal

**Status:** proposal only. Nothing else in the repo has been changed.

### In one example

```JS
const crew = [{ name: 'Ada', role: 'CDR' }, { name: 'Bo', role: 'PLT' }, { name: 'Cy', role: 'MS' }];

assignFrom(el, { title: '?.crew?.names' }, {
    from: { crew },
    pipes: { names: { pluck: '?.name' } }     // ['Ada', 'Bo', 'Cy']
});
```

`{ pluck: '?.name' }` is `list => Array.from(list, x => x.name)`, as JSON.

### The gap

A path can go *into* an array (`?.crew?.0?.name`) and count it (`?.crew?.length`), but it can't go *across* it. Data pipes can reduce a property across an array to one number (`sum`, `min`, `max`), but can't return the values themselves. So today, "the crew's names, comma separated" needs a function pipe:

```JS
pipes: { names: crew => crew.map(c => c.name).join(', ') }      // not JSON
```

Two built-ins are waiting for it. `use: 'join'` and `intl: 'ListFormat'` both take a list of strings, but data from an API is usually a list of *objects*.

**DOM lists are a second gap.** `use: 'join'` and `sum` only accept real arrays. Measured, on a select's `selectedOptions`: `join` gives `"[object HTMLCollection]"`, and `sum` gives `undefined`.

### Examples

Every result below was measured with a prototype (see "What I checked"). `crew` is as above, with ids 7, 9 and 11. `comma` is `{ use: 'join', args: [', '] }`.

#### 1. Comma-separated names

```JS
pipes: {
    names: { pluck: '?.name' },
    comma: { use: 'join', args: [', '] },
    crewList: { chain: ['names', 'comma'] },
}
// '?.crew?.crewList' → 'Ada, Bo, Cy'
```

#### 2. A proper sentence, in any language

```JS
pipes: {
    names: { pluck: '?.name' },
    and: { intl: 'ListFormat', locale: 'en-US', options: { type: 'conjunction', style: 'long' } },
    crewList: { chain: ['names', 'and'] },
}
// 'Ada, Bo, and Cy'        with locale 'de': 'Ada, Bo und Cy'
```

#### 3. chip-away: the joined chip

```JS
pipes: {
    texts: { pluck: '?.textContent' },
    comma: { use: 'join', args: [', '] },
    joined: { chain: ['texts', 'comma'] },
}
// '?.selectedOptions?.joined' on a <select> → 'Red, Green, Blue'
```

#### 4. With a label, through ` =&`

```JS
'textContent =&': { join: ['Crew: ', '?.crew?.crewList'] }     // 'Crew: Ada, Bo, Cy'
```

#### 5. In a ternary

```JS
'textContent ?=': [['?.crew?.length', '>', '?.max'], 'many', '?.crew?.crewList']
// max 1 or 2 → 'many'        max 9 → 'Ada, Bo, Cy'
```

#### 6. Formatting each item on the way

The path can use the other pipes, as `sum`'s can:

```JS
pipes: {
    usd: { intl: 'NumberFormat', locale: 'en-US', options: { style: 'currency', currency: 'USD' } },
    prices: { pluck: '?.price?.usd' },
    comma: { use: 'join', args: [', '] },
    priceList: { chain: ['prices', 'comma'] },
}
// items priced 2 and 3.5 → '$2.00, $3.50'
```

#### 7. A nested property, some missing

```JS
pipes: { cities: { pluck: '?.addr?.city' } }
// [{ addr: { city: 'Oslo' } }, { addr: null }, {}, { addr: { city: 'Rome' } }] → ['Oslo', 'Rome']
```

#### 8. Counting items that have something

```JS
'?.crew?.emails?.length'      // pipes: { emails: { pluck: '?.email' } }; 2 of 3 have one → 2
```

#### 9. A space-separated attribute or class list

The ` :=` operator already space-joins arrays:

```JS
'data-ids :=': '?.crew?.ids'        // pipes: { ids: { pluck: '?.id' } } → data-ids="7 9 11"
'class :=': '?.tags?.tagNames'      // pipes: { tagNames: { pluck: '?.n' } } → class="a b"
```

#### 10. A list of primitives for a Tree repeat

```JS
crew: ['ul', {}, { of: '?.names', each: ['li', '?.'] }]      // <li>Ada</li><li>Bo</li><li>Cy</li>
```

(Tree can also do this with `each: ['li', '?.name']`, which is simpler. `pluck` isn't needed there.)

#### 11. Arithmetic over a DOM list

```JS
pipes: { values: { pluck: '?.value' }, add: { sum: '?.' }, total: { chain: ['values', 'add'] } }
// '?.selectedOptions?.total', options with values 1, 2 and 3 → 6
```

#### 12. An iterable as an array

```JS
pipes: { arr: { pluck: '?.' } }      // '?.selectedOptions?.arr' → a real array of the options
```

#### When not to use it

- **Markup per item:** use a Tree repeat, or `manageTemplateList`.
- **Filtering, sorting or comparing:** still function pipes, as agreed in [PipesAsData](./PipesAsData.md).
- **One item:** `'?.crew?.0?.name'`.

### Does it fit "deliberately small"?

The line drawn in PipesAsData was at comparisons, arithmetic, filtering and sorting, where data pipes turn into a query language. `sum`, `min` and `max` were added later. `pluck` is a projection: it takes one path, has no predicate, no operators and no order. I think it's on the right side of the line, and it's the natural sibling of `sum`: same path, without the adding.

The nearest thing to the line is that it drops missing values (below). That isn't a filter the author can control.

**Is there demand beyond chip-away?** I looked in this repo's demos and docs, o2h and o2h-edge for function pipes that only project a property, and **found none**. The closest, `linkList` in [pipes.md](../../../pipes.md), filters too, so it would stay a function. So today the case rests on chip-away and on how common the pattern is in general.

### Semantics

| Input | Result |
|---|---|
| An array, `Set`, `Map`, `NodeList`, `HTMLCollection`, … (any iterable object) | An array. A `Map`'s items are its `[key, value]` pairs: `'?.0'` plucks the keys |
| An item whose path gives `null` or `undefined` | Dropped |
| `0`, `''`, `false` | Kept |
| An empty list | `[]` (so `join` gives `''`) |
| A string, number, or plain object | `undefined`, as `sum` does with something that isn't an array. A string *is* iterable, but plucking from its characters is surely a mistake |
| `null` / `undefined` | Never reaches the pipe, as with any pipe |
| `pluck` isn't a `?.` path (`'name'`, or an array) | Throws when the pipe is made, as `min` does |

**Dropping missing values** suits `join` (no `"Ada, , Cy"`), and `ListFormat` (which throws on anything but strings). The cost is that results no longer line up by index with the list. I don't see a use here for that, but it's the one choice I'd like you to confirm.

**`ListFormat` and numbers:** it throws on numbers (`Iterable yielded 7 which is not a string`). Plucked ids need a conversion: `{ pluck: '?.id?.str' }` with `str: { use: 'string' }` → `'7, 9, and 11'`.

**The path's options:** other pipes only, as for `sum`. No `withMethods`, `$parent` or `$root`.

### A trap: naming the pipe after the property

It's tempting to write `{ name: { pluck: '?.name' } }`. But pipes take precedence over properties, so inside the pluck, `?.name` calls the pipe itself, on each item. The item isn't iterable, so every result is `undefined`, and all are dropped.

**Measured:** `q: { pluck: '?.q' }` over `[{ q: 1 }, { q: 2 }]` gives `[]`, silently.

*Proposal:* resolve the path with the pipe's own name left out. I tried that, and it gives `[1, 2]`.

**`sum`, `min` and `max` have the same trap today.** Measured on the same data: `q: { sum: '?.q' }` gives `0`, and `min` gives `undefined`. I'd fix all four the same way.

### Implementation sketch

In [pipes/dataPipes.ts](../../../../pipes/dataPipes.ts), beside `sum`:

```TypeScript
if ('pluck' in d) return pluckPipe(name, d.pluck, pipes);

function pluckPipe(name: string, path: unknown, pipes: Pipes) {
    if (typeof path !== 'string' || !path.startsWith('?.')) {
        throw new Error(`dataPipes: "${name}": pluck takes a ?. path`);
    }
    let options: GetValuesOptions;
    return (v: any) => {
        if (v === null || typeof v !== 'object' || typeof v[Symbol.iterator] !== 'function') return undefined;
        if (!options) {
            // Made on first use, once `pipes` is complete: every pipe but this one
            const { [name]: _self, ...others } = pipes;
            options = { pipes: others };
        }
        const values = [];
        for (const item of v) {
            const value = getValue(path, item, options);
            if (value != null) values.push(value);
        }
        return values;
    };
}
```

Also: `PluckPipeDescriptor` in `types.d.ts` (the `types` submodule), the kind's name in the "neither a function nor a descriptor" error, and `docs/pipes.md`.

**Size:** `dataPipes.js` minified, then gzipped, goes from 1,425 to 1,546 bytes: **about 120 bytes**. The core doesn't grow.

**o2h:** it carries descriptors as they are (`PIPE_DESCRIPTOR`), but its worker bundles its own copy of `dataPipes`, so it would need rebuilding to know `pluck`. I haven't tested o2h.

### Alternatives

| | For | Against |
|---|---|---|
| **`@each` in RHS paths:** `'?.crew?.@each?.name'` | No pipe to register; matches `@each` on the LHS | Grows the core's path evaluator, its hottest code, for every page |
| **`join` with a path:** `{ join: '?.name', separator: ', ' }` | One entry rather than three for the commonest case | Only does that case: not `ListFormat`, attributes or counts |
| **`use: 'pluck', args: ['name']`** | No new kind | `use` built-ins are plain functions with no access to the other pipes, so no nested path or per-item formatting |
| **Keep using function pipes** | Nothing to add | Not JSON, so chip-away can't be JSON only |

**The name:** `pluck` is the traditional one (Underscore, RxJS, Rails). `map` would be more familiar now, but it's taken by lookups.

### What I checked

A patched copy of 0.0.111's `pipes/dataPipes.js`, served only to a test browser (Chromium):

- **All of the examples and the semantics table's rows above,** except that numbers as input weren't run.
- **chip-away's JSON prototype,** on 0.0.111 with your `at` and `keyScope`, and with its `joined` function replaced by example 3. Its 10 example pages pass, two chip-aways on one select both update, and `change` reaches the select. **So gaps 1 and 2 are closed there.** Two function pipes are left: the legend text (gap 5) and `n Selected` (gap 4).
- **Gap 6 is real.** I'd only read the code before. Without importing `dataPipes.js`, pages 7, 8 and 10 fail, with the "dataPipes isn't loaded" error, because roundabout's merges use the sync `assignFrom`.

**Not checked:** Firefox and WebKit, o2h, very long lists.

### Suggested tests

- Each row of the semantics table.
- Chained to `join`, `ListFormat` and `sum`.
- A path using another pipe; a path through missing objects.
- A pipe named after its property, for `pluck`, `sum`, `min` and `max`.
- Inside ` =&`, ` ?=`, ` :=` and `builtIns.tree`.
- The descriptor is carried under `PIPE_DESCRIPTOR`.

### Questions

1. Does it make sense to add, given that chip-away is the only concrete use I found?
2. Drop missing values (as proposed), or keep them so that results line up with the list?
3. Accept any iterable object (as proposed), or only arrays, as `sum` does? chip-away needs at least `NodeList` / `HTMLCollection`.
4. Should the same-name fix also cover `sum`, `min` and `max`, in the same change?

## Bruce's Response I

> 1. Does it make sense to add, given that chip-away is the only concrete use I found?

Yes, let's go for it.

>  2. Drop missing values (as proposed), or keep them so that results line up with the list?

Yes, drop.

> 3. Accept any iterable object (as proposed), or only arrays, as `sum` does? chip-away needs at least `NodeList` / `HTMLCollection`.

Agreed.

> 4. Should the same-name fix also cover `sum`, `min` and `max`, in the same change?

Sounds good.



## Claude's Implementation Notes I

`pluck` is in, as proposed and with your answers, along with the same-name fix for `sum`, `min` and `max`.

### What changed

- **`pipes/dataPipes.ts`:**
  - **`pluck`**, following the semantics table: any iterable object, and `null` / `undefined` dropped.
  - **The same-name fix** is one helper, `itemOptions`, which the four kinds share: a pipe's paths see every pipe of the object but itself.
- **`types/assign-gingerly/types.d.ts`:** `PluckPipeDescriptor`. This is in the `types` submodule, so it needs its own commit. I left the copy under `inferencer/types` alone.
- **`docs/pipes.md`:** the `pluck` row, the list-of-names examples, the note on same-named pipes, and the module's size.
- **Tests:** two in `tests/pure-modules.spec.ts` (in Node), and test 11 in `tests/pipes.html` (DOM lists, ` =&`, ` ?=`, ` :=`, and a Tree repeat).

I edited only sources. Your `tsc --watch` rebuilt `pipes/dataPipes.js`.

### Two things to know

- **The fix covers a pipe's own name only.** With `{ prices: { pluck: '?.price' }, price: { chain: ['prices', 'comma'] } }`, the path `?.price` is still the chain, since it's another pipe.
- **A behavior change for `sum`, `min` and `max`:** a pipe that named itself in its path to recurse (`{ total: { sum: '?.children?.total' } }`, over a tree) no longer does. I found none in o2h-edge's demos, the only other users of these kinds I came across, and it was never documented. If you want recursion kept, please say.

### Size

`dataPipes.js`, minified and gzipped, goes from 1,427 to 1,581 bytes: **154 bytes more**, against the 120 I estimated. The same-name fix for the other three kinds is part of that. The docs now say about 1.6 KB.

### Test results

Run on a copy of the repo, built there (the type check is clean):

- **Full suite:** 188 passed, 22 skipped, none failed, in Chromium, Firefox and WebKit. (Four of the skips are new: the Node tests run once, under Chromium.)
- **The old code** gives `0`, `undefined` and `undefined` for same-named `sum`, `min` and `max`, so the trap was real. They now give 3, 1 and 2.

### Not done

- **o2h:** its own `node_modules` has assign-gingerly 0.0.108, so it won't know `pluck` until it's updated and `o2h-sw.js` is rebuilt (`npm run build:worker`). I didn't test it.
- **chip-away:** I didn't run the prototype against this.
- **Gap 6** (the sync `assignFrom` not loading `dataPipes`) is unchanged.
