# Pipes as data

*From o2h's [BaseServiceWorker.md](../../../../o2h/Chats/BaseServiceWorker.md) (Claude's Response III), where pages' configs are stored in IndexedDB for a service worker that renders them with o2h.*

## The problem

**Pipes are functions,** and functions can't be stored (IndexedDB, `postMessage`, `structuredClone`) or sent anywhere. So when a page's config and options are prepared for a worker (`prepareO2HRecord`), every pipe becomes a stand-in. Everything that uses one is left to the client: the element is marked `data-pending`, or a switch or repeat becomes a "pending structure" placeholder. That's correct, but the worker renders less, and on a slow phone the client then has more to finish.

## The idea

**Many pipes are formatting:** dates, numbers, currencies, units, plurals, relative times. That's exactly what `Intl` does. A pipe **described as data**, instead of written as a function, survives the clone, and runs anywhere `Intl` does: the browser, a service worker, a Cloudflare Worker, Node.

```js
pipes: {
    // today: a function (lost in a worker)
    longUtc: new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }).format,

    // as data: survives prepareO2HRecord, and o2h can run it in the worker
    longUtc: { intl: 'DateTimeFormat', locale: 'en-US', options: { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' } },
    kg:      { intl: 'NumberFormat', options: { style: 'unit', unit: 'kilogram' } },
}
```

It's the same idea as [be-intl](https://github.com/bahrus/be-intl), but for pipes, so it applies on the server too.

## Things to decide

1. **The shape:**
   - `{ intl: 'DateTimeFormat' | 'NumberFormat' | 'RelativeTimeFormat' | 'PluralRules' | 'ListFormat', locale?, options? }`. `PluralRules` gives a category, which then needs a mapping to text, so maybe `{ intl: 'PluralRules', options, cases: { one: '…', other: '…' } }`.
   - **Input conversion:** `DateTimeFormat` needs a `Date` (or a number). Should a data pipe accept ISO strings and convert them, as `parseDate` does today?
2. **Locale:**
   - an explicit locale (the same on server and client);
   - the browser's locale (which differs between the server and the client, so text the worker renders could change on hydration);
   - or a page-level default passed in the options.

   This matters for `adopt: 'pending'`, which trusts the server's text.
3. **Where it lives:** in assign-gingerly's path resolution, so the same pipe works in Tree on the client, in o2h, and in any assignFrom pattern. `isPipe` / `navigatePath` would accept a pipe that is an object and build (and cache) the `Intl` formatter for it.
4. **Chaining:** data pipes compose like function pipes (`'?.date_utc?.parseDate?.longUtc'`). Should there also be small data-described non-`Intl` pipes (`{ template: '${0} km' }`, `{ map: { true: 'Yes', false: 'No' } }`), or is that a slippery slope toward a language? I'd keep it to `Intl`, plus perhaps `map`.
5. **Caching:** `Intl` formatters are relatively expensive to construct. Cache them by pipe object, which is also what makes the data form as fast as today's pre-built `.format` functions.

## Related

- o2h's worker records: `prepareO2HRecord` would copy data pipes as is (no stand-in), and `reviveO2HRecord` would leave them alone.
- [SupportDynamicSVGAndMathML.md](../Handlers/Tree/TODO/SupportDynamicSVGAndMathML.md) and the other Tree TODOs, for the broader "what can be rendered without code" picture.

## Bruce's Response I

This is a good idea, worth considering, but here is the main doubt I have:

Can this general sounding concept (data in pipes) be applied in some way to any scenarios other than intl?  If not, maybe we shouldn't call it pipes (which is kind of general in scope) and instead have another specific option called intlRules, or something, inside of which everything you laid out remains the same?

I'm rooting for the answer to be yes, that there are other scenarios, but I'm not sure what they would be.


## Claude's Answer I

**Yes, there are other scenarios, but only a few,** and that's the point: a small, closed set of pure, deterministic transforms that a pipe can *describe* instead of *being*. They justify keeping the name `pipes`, with `intl` as one kind among a handful. I'd also stop well before it turns into an expression language.

### What else fits

**1. Lookup maps.** These are probably more common than `Intl`. Status codes, enums and booleans are mapped to labels or classes:

```js
pipes: {
    phaseLabel: { map: { hold: 'On hold', scrubbed: 'Scrubbed', go: 'Go for launch' }, default: 'Unknown' },
    yesNo:      { map: { true: 'Yes', false: 'No' } },
    severity:   { map: { 1: 'low', 2: 'medium', 3: 'high' } },   // e.g. for a class name
}
```

Matching is `String(value)`, as switches match cases. Ternaries (`' ?='`) cover the two-way case already, and `map` covers the n-way case for text and attributes. That's exactly where switches can't help, since they choose *elements*.

**2. Named built-in transforms, with arguments.** Many pipes people write are one-liners over built-ins: `Date.parse`, `Number`, `String(x).trim()`, upper or lower case, `.length`, `toFixed(2)`, `slice(0, 3)` on a string or an array, `join(', ')` on an array, a default for nullish values. A small standard library that ships *with* assign-gingerly is code the worker has, so a pipe can just name it:

```js
pipes: {
    parseDate: { use: 'parseDate' },
    price:     { use: 'toFixed', args: [2] },
    firstFive: { use: 'slice', args: [0, 5] },
    tags:      { use: 'join', args: [', '] },
    orNone:    { use: 'default', args: ['None'] },
}
```

These aren't "data in place of code" so much as **references to code that's everywhere already**: the same idea as a manager named by a string, but for a library both sides ship.

**3. Chains.** A named sequence of other pipes, so a config can define `longDate` once as `parseDate` then `longUtc`, instead of repeating `?.parseDate?.longUtc` everywhere:

```js
pipes: { longDate: { chain: ['parseDate', 'longUtc'] } }
```

**Together these cover most of the pipes I've seen in our demos and tests:**
- **The tree-demo:** `parseDate` (`use`), `longUtc` (`intl`), `km` and `kmh` (`intl` with units), while `clock` / `tPlus` (arithmetic) and `coreSummary` (composes several fields into a sentence) stay functions.
- **My service worker test:** `upper` (`use`) is covered; `kind` and `active` aren't. `kind` is "how many?", a comparison; `active` filters an array.

### Where I'd stop

**Comparisons, arithmetic, filtering and sorting** (`{ filter: { key: 'active', eq: true } }`, `{ sort: 'name' }`, `{ gt: 1 }`) are where "data pipes" become a query language. JSONata, JSON-e and Handlebars helpers all went there, and each grew without end. They also overlap with what view-model shaping and managers are for. Pipes that need these stay functions, and in a worker they're left to the client (pending), which is the honest result.

### So, the name

**Keep `pipes`,** with each entry either a function or a **descriptor** of one of a few kinds:

| Kind | Example | What it does |
|---|---|---|
| `intl` | `{ intl: 'NumberFormat', options: { style: 'unit', unit: 'kilometer' } }` | An `Intl` formatter (cached per descriptor) |
| `map` | `{ map: { hold: 'On hold' }, default: 'Unknown' }` | A lookup by `String(value)` |
| `use` | `{ use: 'toFixed', args: [2] }` | A built-in from a small, fixed standard library |
| `chain` | `{ chain: ['parseDate', 'longUtc'] }` | Other pipes in sequence |

A descriptor is still a pipe: a unary transform, used the same way in paths (`'?.price?.kmh'`). The only difference is that it survives `structuredClone`. Giving `Intl` its own option (`intlRules`) would make sense if `Intl` were the only case. With `map`, `use` and `chain` alongside it, one `pipes` with a few kinds is simpler to learn and to document. It also keeps today's paths working when a function pipe is later replaced by a descriptor of the same name.

**If you'd rather start small,** `intl` and `map` alone already make the general name worthwhile. `use` and `chain` can come later.

### Questions

1. **The kinds:** `intl`, `map`, `use` and `chain` (or start with `intl` + `map`)?
2. **The standard library for `use`:** I'd start with `parseDate`, `number`, `string`, `trim`, `upper`, `lower`, `length`, `toFixed`, `slice`, `join` and `default`, and grow it only by request. Too much, or too little?
3. **Stop at comparisons, arithmetic and filtering:** agreed?

## Bruce's Response II

That sounds great.  The flip side is that this is synchronous, which means it has to load to use assignFrom, even if not using these features?

Can you estimate how much footprint each of the four would consume?

Maybe this should only be added to assignFromAsync?

I agree with:

> 3. **Stop at comparisons, arithmetic and filtering:** agreed?


## Claude's Answer II

### The footprint, measured

I wrote a throwaway prototype of the four kinds (a scratch file, not in the repo), with each kind's logic, the `Intl` cache, the standard library for `use`, and the dispatch. I measured it with esbuild (minified, tree-shaken) plus gzip:

| Kind | Minified | Gzipped |
|---|---|---|
| `intl` (five `Intl` kinds, cached per descriptor; `PluralRules` cases; dates from strings) | 507 B | 320 B |
| `map` | 101 B | 117 B |
| `use` (the 11 built-ins: `parseDate`, `number`, `string`, `trim`, `upper`, `lower`, `length`, `toFixed`, `slice`, `join`, `default`) | 460 B | 296 B |
| `chain` | 83 B | 98 B |
| **All four, with the dispatch** | **1,260 B** | **627 B** |

**For scale:** assign-gingerly's `index.js`, bundled the same way, is **84 KB minified, 26.4 KB gzipped**, and `resolve/getValues.js` alone is 4.9 KB / 2.0 KB. So all four kinds together would add about **2.4%** to the gzipped core. That's small, but it's still nonzero for pages that never use them. Your instinct to keep it out of the default path is sound.

### Async isn't the right line, though

**Pipes are resolved synchronously everywhere:** in `getValue`, in builtIns.tree (always synchronous), in sync ops (` =&`), in ternaries. `assignFromAsync` itself delegates those to `assignFrom`. If data pipes worked only in `assignFromAsync`, they wouldn't work in Tree, which is where they matter most (that's where o2h and the worker come in). And nothing in a data pipe needs to be awaited.

### What I'd do instead: an opt-in helper module, with zero cost to the core

**Data pipes become ordinary functions,** made from descriptors by a separate module that only pages using them import:

```js
import { dataPipes } from 'assign-gingerly/pipes/dataPipes.js';

const pipes = {
    ...dataPipes({
        longUtc:    { intl: 'DateTimeFormat', locale: 'en-US', options: { dateStyle: 'long', timeZone: 'UTC' } },
        phaseLabel: { map: { hold: 'On hold', go: 'Go for launch' }, default: 'Unknown' },
        price:      { use: 'toFixed', args: [2] },
        longDate:   { chain: ['parseDate', 'longUtc'] },
    }),
    clock: s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`,   // plain functions alongside
};
```

- **The core doesn't change at all.** `getValue` keeps calling functions. Pages that don't import `dataPipes` pay nothing, and sync `assignFrom`, Tree and sync ops all work, because a data pipe *is* a function by the time they see it.
- **Each function `dataPipes` returns carries its descriptor** (a symbol property). That's what makes it survive the trip to a worker:
  - `prepareO2HRecord` sees the descriptor and **stores it instead of a stand-in**, so it isn't lost;
  - the worker's `reviveO2HRecord` turns stored descriptors back into functions with the same `dataPipes`. That adds ~0.6 KB to the worker bundle, which only o2h's worker pays.
- **`chain`** resolves its names against the pipes object it's part of: the descriptors given to the same `dataPipes` call. It could also resolve against the final `pipes` object at call time, if chains should reach plain function pipes too. That's a detail to settle when implementing.
- **Tree-shaking:** with one module per kind (`dataPipes` importing them), a bundler drops kinds that are never used. Without a bundler, the whole module is 627 B gzipped anyway.

**What this gives up:** writing a descriptor directly in `pipes` (without wrapping it in `dataPipes(...)`) wouldn't work. I think the one extra call is a fair price for keeping the core untouched, and it makes the opt-in visible in the code.

### Questions

1. **The helper module** (`assign-gingerly/pipes/dataPipes.js`, opt-in, core unchanged), rather than core support or `assignFromAsync`-only?
2. **All four kinds** in it (627 B gzipped together), or start with fewer?
3. **Should `chain` reach plain function pipes** too (resolved against the final `pipes` at call time), or only other descriptors in the same `dataPipes` call?
