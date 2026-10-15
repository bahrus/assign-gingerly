# Sync Ops (` =&` operator)

The ` =&` operator computes a value from the source and assigns it to a target path, **synchronously**. There's no dynamic import, no handler class and no `await`, ever. That's what distinguishes it from ` =>` handlers.

```JavaScript
assignFrom(oElement, {
    '?.textContent =&': { join: ['?.lastName', ', ', '?.firstName'] }
}, { from: { lastName: 'Targaryen', firstName: 'Helaena' } });

// oElement.textContent === 'Targaryen, Helaena'
```

## Syntax

```JavaScript
'<lhsPath> =&': { <opName>: <args>, ...<extra> }
```

- **`lhsPath`**: where the result goes, written like any other LHS (`'?.textContent'`, `'?.style?.width'`, or plain `'title'`).
- **`opName`**: the op to run. The value under it becomes the op's `args`.
- **`extra`**: every other key in the config. The op receives them as its second argument (for example `join`'s `separator`).

## How It Works

1. **The config must be a plain object.** Anything else (a string, an array, `null`) throws: `requires a config object naming exactly one op`.
2. **The op is the first config key that names a registered op**, in object key order. All other keys become `extra`. If no key names an op, it throws, and the error lists the known ops.
3. **The whole config is resolved in one pass** by `getValues` against `from`. That includes `args`, `extra`, and anything nested inside arrays or objects. So everything an RHS value supports works here:
   - `?.` paths, and `$0` (the target);
   - [`$root` / `$parent`](./root-references.md);
   - `!` / `!!` negation and coercion;
   - `aka` aliases and `withMethods` calls (including zero-argument calls marked with `|`);
   - [pipes](./pipes.md);
   - **synchronous** protocols.

   Strings that aren't references stay literals.
4. **Async values are rejected.** If anything in the resolved config is a thenable (for example, a protocol returned a Promise), it throws rather than assigning `"[object Promise]"`. Use ` =>` with `resolve:` for async values.
5. **The LHS is resolved, and the op is called** as `op(args, extra, { lhsTarget })`, where `lhsTarget` is what `lhsPath` resolves to (the target itself for `'?. =&'`).
6. **A returned value is assigned** to `lhsPath`, through the permission processor like any other assignment. `undefined` means "don't assign". **Value ops** (`join`) return a value. **Rendering ops** (`microJoin`) write into `lhsTarget` and return `undefined`.

### Order within one `assignFrom` call

` ?=` ternaries run first, then ` =&` sync ops, then ` =*` multi-invokes, then plain keys, then `#[x]` keys. ` =>` handlers run last, fire-and-forget. So if a plain key and a ` =&` key target the same property, the plain key wins.

### Looped substitution

When `where_x_in` / `where_y_in` / `where_z_in` expansion produces duplicate ` =&` keys, the **last one wins**. (` =>` and ` =*` keys merge instead; see [multi-invoke.md](./multi-invoke.md).)

## Built-in Ops

The registry ([syncOps/registry.ts](../syncOps/registry.ts)) is closed: ops are imported statically, so ` =&` never needs to load anything. Today it holds two: `join` (a value op) and `microJoin` (a rendering op).

### `join`

Joins the resolved `args` array into a string.

| Config key | Meaning | Default |
|---|---|---|
| `join` | Array of `?.` paths and literals. A non-array value is treated as a one-item array. | (required) |
| `separator` | String placed between items | `''` |

**Nullish handling:**
- **Top-level** `null` / `undefined` items are dropped.
- **Nested sub-arrays are all-or-nothing.** If any item in a sub-array is `null` / `undefined`, the whole sub-array is dropped. Otherwise its items are flattened in. That's how you write optional segments:

  ```JavaScript
  // middleName undefined → [', ', undefined] dropped → 'Targaryen, Helaena'
  // middleName 'D'       → 'Targaryen, D, Helaena'
  '?.textContent =&': { join: ['?.lastName', [', ', '?.middleName'], ', ', '?.firstName'] }
  ```

**With `separator`:**

```JavaScript
'?.textContent =&': { join: ['?.firstName', '?.lastName'], separator: ' | ' }
// → 'Helaena | Targaryen'
```

**Formatting numbers along the way**, with a zero-argument method call (`|`):

```JavaScript
assignFrom(el, {
    '?.textContent =&': { join: ['?.mass?.kg?.toLocaleString|', ' kg'] }
}, { from: rocket, withMethods: ['toLocaleString'] });
// → '549,054 kg'
```

The [`sp` tagged template](./paths-dx.md) produces arrays in exactly the shape `join` expects.

### `microJoin`

Renders a template array **into the element** that the key's path resolves to. Literal strings become text, and each `{ prop, val, text? }` segment becomes an element with `itemprop=prop`, chosen by the resolved value's type:

| Resolved `val` | Element | Attributes | Text (default) |
|---|---|---|---|
| `Date` | `<time>` | `itemprop`, `datetime` (ISO) | `toLocaleDateString()` |
| number | `<data>` | `itemprop`, `value` (raw) | `toLocaleString()` |
| boolean | `<data>` | `itemprop`, `value` | empty |
| anything else | `<span>` | `itemprop` | `String(val)` |

```JavaScript
assignFrom(p, {
    '?. =&': { microJoin: ['Launched ', { prop: 'launched', val: '?.date', text: '?.date?.longUtc' }, ' by ', { prop: 'name', val: '?.name' }] }
}, { from: vm, pipes });
// <p itemscope>Launched <time itemprop="launched" datetime="…">March 14, 2026 at 3:09 PM</time> by <span itemprop="name">Demo 7</span></p>
```

- **`text`** overrides the displayed text, while `val` still decides the element and its machine-readable attribute. Use [pipes](./pipes.md) to format it. Without `text`, the locale defaults above apply.
- **Nullish values:** top-level nullish items, and segments with a nullish `val`, are omitted. A **nested sub-array** is all-or-nothing: it's dropped if any item in it is nullish or has a nullish `val` (the same as `join`).
- **Updates:** `microJoin` owns the element's whole content, so it needs no comment markers.
  - **Same structure** (the same sequence of text and `tag` + `itemprop` elements): later calls update the text nodes, elements, `value` and `datetime` in place.
  - **Changed structure:** it re-renders.
- **`itemscope`:** the element gets an empty `itemscope` attribute if it has none, so the `itemprop`s belong to it.
- **The LHS must resolve to an element**, otherwise it throws.
- **Cost:** semantic output costs more than a plain string. Prefer `join` when you don't need the markup. See `demos/microjoin-benchmark.html` for numbers.

`microJoin` replaces the former async `builtIns.microDataJoin` handler, which has been removed.

## Where ` =&` Is Available

| Entry point | Supported |
|---|---|
| `assignFrom` | Yes |
| Patterns applied by handlers that use `assignFrom` (`builtIns.tree`, `builtIns.manageTemplateList` items, …) | Yes |
| `assignFromAsync` | Yes. Like ` ?=` keys, they're delegated to the sync `assignFrom` and applied before plain keys. |
| `assignGingerly` | No, because it has no `from` to resolve against |

## ` =&` vs ` =>`

| | ` =&` sync op | ` =>` handler |
|---|---|---|
| Runs | Synchronously, inline | Asynchronously (fire-and-forget in `assignFrom`, awaited in `assignFromAsync`) |
| Loaded | Static registry | Dynamically imported built-ins, or `options.handlers` |
| Config resolution | `getValues` (sync) over the whole config | `get` (sync) / `resolve` (async, awaits protocols) maps |
| Async values | Rejected with an error | Supported via `resolve` |
| Result | Assigned to the LHS (unless `undefined`) | Opt-in: assigned only if `assign()` returns a value |
| Use it for | Computing a value: joining, formatting | Side effects: loading, rendering lists, event wiring |

## Custom Formatting: Use Pipes

The op registry is deliberately closed. For custom formatting (dates, units, conditional text), register [pipes](./pipes.md) instead. Pipes are named unary functions used as path segments, so they compose *inside* `join`:

```JavaScript
'textContent =&': { join: ['?.parseDate?.longUtc', ' UTC'] }
// with options.pipes = { parseDate: Date.parse, longUtc: new Intl.DateTimeFormat(…).format }
```
