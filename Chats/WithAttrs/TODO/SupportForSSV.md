# Support For SSV

## Bruce's Ask

As the [documentation for built in parsers](/docs/withAttrs.md#built-in-named-parsers) indicates, one of the parsers is for csv.

I think since there are so many attributes, like the for attribute that supports space delimited identifiers, we should build in a parser that normalizes white space and splits to an array.

Do you see any issues / concerns / alternatives?


## Kimi's Feedback (2026-08-22)

A built-in SSV parser is a good idea — it fills a common gap alongside `csv`. A few thoughts:

1. **Naming**: `ssv` is concise and mirrors `csv`. Alternatives like `spaceSeparated` or `whitespaceSeparated` are clearer but longer. I'd lean toward `ssv` for consistency with `csv`.

2. **Semantics**:
   - Split on `/\s+/` so tabs, multiple spaces, and line breaks are all normalized.
   - Trim each token and filter out empty tokens, so `" a  b "` becomes `['a', 'b']`.
   - Return an empty array for an empty/null attribute rather than `null`, so consumers can safely iterate.
   - Consider whether deduplication is expected. For HTML `for`-like attributes, duplicates are generally ignored, so deduping would be reasonable. For general SSV, however, preserving order and duplicates is the least surprising default.

3. **Relationship to `instanceOf: 'Array'`**: `instanceOf: 'Array'` expects JSON (`["a","b"]`). An `ssv` parser would be for attributes that naturally store space-separated tokens. Keep the two paths distinct so users don't accidentally try JSON on an SSV attribute.

4. **Generalization option**: Instead of a hard-coded SSV parser, a reusable `split` parser that reads `parserOptions: { delimiter: /\s+/, trim: true }` could cover SSV, pipe-separated values, etc. The downside is that named parsers currently need to be serializable in JSON config, and a RegExp delimiter is not. A dedicated `ssv` parser avoids that issue.

5. **Documentation**: If added, the `ssv` entry should be added to the built-in named parsers list in `docs/withAttrs.md` under the `### Named Parsers for Reusability and JSON Serialization` section.

6. **Minor note on the existing link**: The link `[documentation for built in parsers](/docs/withAttrs.md#built-in-named-parsers)` points to a bold subheading (`**Built-in Named Parsers:**`) rather than a markdown heading, so GitHub may not generate that exact anchor. It may need to point to `#named-parsers-for-reusability-and-json-serialization` instead.

Overall: a dedicated `ssv` parser is low-risk, useful, and consistent with the existing `csv` built-in. I don't see a strong reason to prefer a generic splitter given the JSON-serialization constraint.

## Bruce's Response - Considering switching to split

I think the idea of a generalized split option is a good one.  A few important points:

1.  Absolutely no one is using the csv option yet.  Do not incur any backwards compatibility technical debt, if we go this route.
2.  I actually think if parserOptions are not specified, maybe it should default to space delimited, and default to normalizing whitespace.
3.  I *think* it should be possible, but perhaps a little clunky, for JSON to be able to specify a string, which then gets parsed into a regular expression, correct?  I'm thinking the delimiter option should support both strings and regexps.

Given these thoughts (which I suspect have already occurred to you), which way would you lean, honestly?

## Kimi's Additional Thoughts (2026-08-22)

Given your points, I would lean toward the generalized `split` parser rather than a hard-coded `ssv` one. A few reasons:

1. **No real cost to generalizing**: Since `csv` is not yet used, we can introduce `split` as the canonical whitespace/CSV/pipe/etc. parser without carrying `csv` as a separate built-in. If we are worried about discoverability, we could keep `csv` as a thin alias (`parser: 'csv'` → `split` with `delimiter: ','`), but I would not make that alias part of the documented surface until it is needed.

2. **Defaulting to space-delimited is reasonable for `split`**, as long as the default is clearly documented. Most HTML attributes that take multiple tokens (`for`, `class`, `headers`, `aria-describedby`) are whitespace-separated, so a default of `/\s+/` matches the most common web-platform pattern. Users who want commas or pipes opt in explicitly.

3. **Delimiter as string vs. RegExp**: I would support both, but with a clear rule:
   - If `delimiter` is a **string**, treat it as a **literal** separator (escaped before building a RegExp). This avoids the surprise where `delimiter: '.'` or `delimiter: '|'` is interpreted as regex syntax.
   - If the user needs regex semantics (for `/\s+/`, `/[,;]/`, etc.), accept an object form such as `{ delimiter: { pattern: '\\s+', flags: 'g' } }` or a regex-like string such as `{ delimiter: '/\\s+/' }`. Either approach keeps the config JSON-serializable.

   My preference is the object form because it is explicit and does not require parsing a `/.../flags` string.

4. **Trimming and filtering empties should stay on by default**, with `trim: false` and `skipEmpty: false` as opt-outs. That matches how `csv` currently behaves and covers the 95% case cleanly.

5. **One concern**: the name `split` is very generic. If a user sees `parser: 'split'` without `parserOptions`, they might not know the default delimiter. A more descriptive default name like `ssv` still has merit. But since the default is documented and since `split` with options is more honest about what it does, I am okay with `split`.

So my honest lean: implement a single `split` named parser, default `delimiter` to `/\s+/`, support literal strings and a `{ pattern, flags }` object for regex, and drop or de-document the standalone `csv` built-in.

## Bruce's adjusted proposal

Again I want to say in no uncertain terms to not add any technical debt whatsoever in order to be backwards compatible here as far as supporting 'csv'.

I think what we want to do is start supporting:

```TS
interface AttrParser<T> {
    //not sure if this is correct Typescript
    constructor(config: AttrConfig<T>);
    parse(v: string | null, instance: T) => any,
}

interface AttrConfig<T = any, ParserOptions = any> {
  mapsTo?: keyof T | '.';           // Target property name (or '.' to spread)
  sourceOfTruth?: boolean;          // Mark attribute as source-of-truth (mirrored by property)
  instanceOf?: string | Function;   // Type for default parser
  parser?: 
    | ((v: string | null) => any)   // Inline parser function
    | string                         // Named parser from globalParserRegistry that maps to a function
    | [string, string];              // [CustomElementName, StaticMethodName]
    |  {
       name: string // Named parser from globalParserRegistry that maps to a class (or function prototype) constructor that is expected to implement interface AttrParser
       options: ParserOptions   
    }
}
```

And like the way we have built-in functional parsers like timestamp and date, we have one built-in class-based parser with name 'splitter' into which we pass the delimiter in the options.

Outside libraries can then extend this class, and register things like 'csv' and 'ssv' that has default settings. 

What do you think?
## Kimi's Response to Class-Based Parser Proposal (2026-08-22)

I like the direction. A small, formal `AttrParser<T>` interface gives a clean extension point and lets `csv`/`ssv` live as thin library registrations instead of built-in hard-coding. A few thoughts before implementing:

1. **Keep function parsers too**. The existing function-based named parsers (`timestamp`, `date`, etc.) are lightweight and widely useful. The class interface should be an *additional* shape, not a replacement. `parserRegistry.resolve` would then try, in order:
   - inline function
   - string → function or class constructor
   - tuple → custom element static method
   - object `{ name, options }` → class constructor + options.

2. **Constructor vs. parse signature**. I would make the class constructor receive the parser **options**, not the whole `AttrConfig`, so the parser is decoupled from the attribute metadata:

   ```TypeScript
   interface AttrParser<T = any> {
     parse(v: string | null, ctx: ParserContext<T>): any;
   }
   
   interface AttrParserConstructor<T = any, Options = any> {
     new (options: Options): AttrParser<T>;
   }
   ```

   `ParserContext` already exists and carries `element`, `attrName`, `attrConfig`, `spawnContext`. Reusing it means class parsers get the same context as function parsers.

3. **Instantiation/caching**. A new instance per `parseWithAttrs` call is safe but wasteful. I would cache the constructed parser keyed by the registered name + a stable options key (e.g., `JSON.stringify(options)` for JSON-serializable options). For the built-in `splitter`, the delimiter is the only state, so caching is trivial.

4. **The `splitter` built-in**. It should accept:
   - `delimiter?: string | { pattern: string; flags?: string }` — defaults to `/\s+/`.
   - `trim?: boolean` — default `true`.
   - `skipEmpty?: boolean` — default `true`.
   - `dedupe?: boolean` — default `false`.

   This covers SSV, CSV, pipe-separated, etc. Libraries register `ssv` as `new SplitterParser({ delimiter: /\s+/, trim: true })` and `csv` as `new SplitterParser({ delimiter: ',', trim: true })`.

5. **Drop `csv` from built-ins**. Since no one uses it, remove the function-based `csv` parser and document that `csv` can be registered from the splitter if needed. That avoids keeping a half-compatible parser around.

6. **TypeScript changes needed**:
   - Add `AttrParser` / `AttrParserConstructor` interfaces to `types/assign-gingerly/types.d.ts`.
   - Update the `parser` field union to include `{ name: string; options?: any }`.
   - Update `resolveParser` in `parseWithAttrs.ts` to instantiate class parsers.
   - Update `docs/withAttrs.md` to describe the new class-based parser option.

7. **One concern**: if a parser class has side effects or holds non-serializable state, caching by `JSON.stringify(options)` could be wrong. We can document that parser options should be JSON-serializable and that instances may be reused. For non-serializable options, users can fall back to an inline function parser.

Overall this is a cleaner architecture than a one-off `ssv` parser. It costs a little more code in `parseWithAttrs.ts` and the type definitions, but it buys a real extension point.

## Bruce's Response -- Please Proceed.

I agree with all your implementation recommendations.

I don't think we should be introducing caching of the options.  Perhaps the delimiter string (if it is a string) could be cached, which would provide a little performance boost, perhaps.


## Implementation Complete (2026-08-22)

Implemented the class-based parser extension and the built-in `splitter` parser.

### Files changed
- `types/assign-gingerly/types.d.ts` — added `AttrParser`, `AttrParserConstructor`, `NamedParserRef`, `ParserTuple`, `ParserSpec`; updated `AttrConfig.parser` union.
- `SplitParser.ts` / `SplitParser.js` — new built-in class parser, registered as `'splitter'`.
- `parserRegistry.ts` / `parserRegistry.js` — registries now accept class constructors; removed unused `csv` built-in; registered `splitter`.
- `ScopedParserRegistry.ts` / `ScopedParserRegistry.js` — updated types/JSDoc to allow class constructors.
- `parseWithAttrs.ts` / `parseWithAttrs.js` — `resolveParser` now supports string-to-class, object `{ name, options }`, and tuple forms; `getCacheKey` includes parser options.
- `docs/withAttrs.md` — documented the new class parser form and the `splitter` built-in.
- `package.json` — added `./SplitParser.js` export.

### Key behavior
- `parser: 'splitter'` defaults to `/\s+/`, trim, skip empty.
- `parser: 'splitter'` with `parserOptions: { delimiter: ',' }` uses a literal comma.
- `parser: { name: 'splitter', options: { delimiter: ',' } }` is the self-contained object form.
- String delimiters are escaped as literals; `{ pattern, flags }` objects build a RegExp directly.
- No caching of parser instances/options (per discussion); the built-in `splitter` creates a fresh instance per attribute parse.

### Verification
- `npx tsc` — passed.
- `npm test` — **102 passed** across chromium, firefox, and webkit.
