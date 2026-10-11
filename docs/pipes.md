# Pipes

Pipes are **named, unary functions** that you register per call and use as **path segments** in RHS values. When a segment names a pipe, the current value is passed through it:

```JavaScript
const fmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' });

assignFrom(timeElement, {
    dateTime: '?.',
    'textContent =&': { join: ['?.parseDate?.longUtc', ' UTC'] },
}, {
    from: '2026-03-14T15:09:26.000Z',
    pipes: {
        parseDate: Date.parse,
        longUtc: fmt.format,
    },
});

// timeElement.textContent === 'March 14, 2026 at 3:09 PM UTC'
```

`'?.parseDate?.longUtc'` reads as: take the current value, pipe it through `parseDate`, then through `longUtc`. The name is inspired by the TC39 `|>` pipeline proposal.

## Why Pipes

Paths can navigate into values and call their methods (`withMethods`), but a method takes at most **one string argument** (the next segment). That means a path can't:
- convert a value into another type (string → `Date`);
- call a function with an options object (`toLocaleString(locale, { … })`);
- build conditional text from several fields.

Pipes move that logic into JS, where functions and objects are natural, while the pattern only **names** them. Patterns stay JSON. Parameterized formatting is set up once in JS (as with the `Intl.DateTimeFormat` above) instead of being encoded in the path.

## Rules

- **Unary.** A pipe is called as `fn(current)`. It never consumes the next segment as an argument, so there's no argument syntax in paths.
- **Called with `this` undefined.** Pass functions that don't need a receiver: static functions (`Date.parse`, `Temporal.Instant.from`), bound functions, arrow functions, or `Intl` formatters' `format` (a bound getter).
- **Pipes take precedence** over a property of the same name on the current value. They're registered per call, so a match is the author's intent. Pick names that don't collide with data keys you also need to read.
- **Never called with nullish.** Path navigation stops at `null` / `undefined` before reaching the pipe. For placeholders, use a ` ?=` chain: `'textContent ?=': ['?.details', '??', 'No details provided.']`.
- **A pipe ends a method's argument.** `'?.n?.toFixed?.wrap'` calls `toFixed()` with no argument, then `wrap`. `'?.n?.toFixed?.2?.wrap'` calls `toFixed('2')`, then `wrap`.
- **`aka` aliases can point at pipes.** `$root` / `$parent` paths can use them too: `'$root?.title?.upper'`.
- **A bare pipe name is a literal string.** Only segments inside a `?.` path are piped.

## Where Pipes Work

Anywhere an RHS path is resolved:
- plain values, arrays and nested objects;
- inside ` =&` sync ops (`join`);
- ` ?=` ternary conditions, results and comparison operands;
- handler `get` / `resolve` maps;
- `getValue` / `getValues` / `resolveValues` with `{ pipes }`;
- both `assignFrom` and `assignFromAsync`.

Nested call sites pass `pipes` along:
- **`builtIns.tree`** passes them to every pattern;
- **`builtIns.manageTemplateList`** passes them to per-item (`fromEachItem`) and `fromHost` patterns, even though per-item calls otherwise only receive their own `withOptions`.

## Common Patterns

**Formatting a whole object:**

```JavaScript
pipes: { coreSummary: ({ serial, flight, reused }) => `${serial}, flight ${flight}${reused ? ' (reused)' : ''}` }
// textContent: '?.coreSummary'
```

**Choosing a formatter with a ternary** (here, based on UI state on the root VM):

```JavaScript
'textContent ?=': ['$root?.ui?.metric', '?.height?.metersLabel', '?.height?.feetLabel']
```

**Turning an object into an array for a list handler:**

```JavaScript
pipes: { linkList: links => Object.entries(links).filter(([, href]) => href).map(([name, href]) => ({ name, href })) }
// resolve: { forEach: '?.linkList', … }
```

See [demos/tree-demo.html](../demos/tree-demo.html) for all of these together.
