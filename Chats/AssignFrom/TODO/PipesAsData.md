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
