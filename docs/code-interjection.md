# Code interjection: every way to bring your own code in

assign-gingerly's patterns are data (JSON-friendly), so any behavior beyond plain assignment comes from code you supply. This page lists every way to supply it: where it goes, how a pattern reaches it, and how far it reaches.

**Scope** is the column to watch:
- **Call:** passed for one `assignFrom` / `assignGingerly` call, and nothing else sees it.
- **Registry:** registered once on a `CustomElementRegistry`, either the global `customElements` or a scoped one, and seen by every call that resolves through that registry.
- **Global:** module-level, seen by everything.
- **Class:** a convention on your own class, picked up wherever that class is used.

## 1. Options: the third argument

| Option | Supplies | Reached from a pattern by | Scope | Docs |
|---|---|---|---|---|
| `handlers` | Handler classes (or an import path, or a `builtIns.*` alias) | ` =>` keys: `{ do: 'name', … }` | Call | [README: assignFrom handlers](../README.md#assignfrom-handlers--operator) |
| `protocols` | Functions that resolve `name://key` (sync, or async with `assignFromAsync` / `resolveValues`) | An RHS value starting with `name://` | Call | [README: protocol resolution](../README.md#protocol-resolution-in-getvalues-and-assignfrom) |
| `pipes` | Named unary functions | A path segment: `'?.date?.parseDate?.longUtc'` | Call | [pipes.md](./pipes.md) |
| `withMethods` | (Names of) methods on the objects being navigated | A path segment that names a listed method | Call | [README: withMethods](../README.md#example-3c---method-calls-with-withmethods) |
| `akaMethods` | Aliases for methods on the source object | A path segment that names the alias | Call | sugar for `withMethods` + `aka` |
| `withAsyncMethods` | (Names of) async methods on navigated objects | A path segment that names a listed method (awaited) | Call | [README: withAsyncMethods](../README.md#withasyncmethods-in-assigngingerly) |
| `registry` | An `EnhancementRegistry` (**enhancements only**) | Symbol keys / `enh` paths (`[isHappy]: true`, `'?.enh?.x'`) | Call (overrides the target's registry) | [README: dependency injection](../README.md#dependency-injection-based-on-a-registry-object-and-a-symbolic-reference-mapping) |
| `enhance` | EMC JSON configs naming enhancement modules | The option itself (bulk: `{ emc, matching }`) | Call (the modules load globally) | [README: bulk enhancement](../README.md#bulk-enhancement-with-enhance-and-enhanceall) |

Not code, for completeness: `aka`, `substitutions`, `where_x_in` / `_y_` / `_z_`, `pin` / `at`, `infer`, `signal` (it only cleans up `@eachTime`), `from` / `fromStack`.

## 2. The fourth argument

| Argument | Supplies | Scope | Docs |
|---|---|---|---|
| `permissionProcessor` | Allow / block / redirect rules for assignments, method calls, attributes and imports | Call | [assign-permissions.md](./assign-permissions.md) |

## 3. Registries on `CustomElementRegistry`

Each one exists on the global `customElements`, and on any scoped registry (`shadowRoot.customElementRegistry`). A call resolves through the **target's** registry first, then the global one.

| Registry | Supplies | Reached by | Local override in options? | Docs |
|---|---|---|---|---|
| `customElements` (native) | Custom element classes | Tag names | (n/a) | the platform |
| `.enhancementRegistry` | Enhancement classes (`spawn`), with symlinks, `enhKey` and `withAttrs` | Symbol keys, `enh.*` paths, attributes | **Yes:** `registry` | [README: enhancement registry](../README.md#enhancement-registry-addendum-to-the-custom-element-registry) |
| `.itemscopeRegistry` | Itemscope managers | The `ish` property; Tree's `{ tag, ish }` headers | **No** | [README: ItemscopeRegistry](../README.md#itemscoperegistry), [tree.md](./tree.md#itemscope-managers-as-view-models) |
| `.featuresRegistry` | Custom element features, composed onto element classes | `assignFeatures` / `defineWithFeatures`; enhancements' `features` | **No** (`defineWithFeatures` takes a registry argument) | [README: custom element features](../README.md#custom-element-features) |

**Side effect to know about:** Tree's `{ tag, ish: SomeClass }` registers the class in the target's (or the global) `itemscopeRegistry` under `Class.is ?? Class.name`, so that name is taken from then on.

## 4. Parser registries (for `withAttrs`)

| Registry | Supplies | Reached by | Scope | Docs |
|---|---|---|---|---|
| `globalParserRegistry` / `registerParser` | Named attribute parsers | `parser: 'name'` in `withAttrs` patterns | Global | [withAttrs.md](./withAttrs.md#named-parsers-for-reusability-and-json-serialization) |
| `ScopedParserRegistry` | The same, scoped to a "synthesizer" element (be-hive, …), with lazy waiting | The same | Scoped | [withAttrs.md](./withAttrs.md) |
| Inline `parser` / `instanceOf` | A parser function or class, right in the pattern | (itself) | Pattern | [withAttrs.md](./withAttrs.md#custom-parsers) |

## 5. Code reached from data: names and module paths

These pick up code that the pattern itself names. They're the reason imports go through the allowed-import check (`isAllowedImportPath`, or the permission processor's `crossDomainImports`).

| Where | What it loads or calls | Docs |
|---|---|---|
| `handlers` values that are paths, `builtIns.*` names | A handler module (dynamic `import()`); built-ins auto-load | [README: handlers](../README.md#assignfrom-handlers--operator) |
| `enhance` / `enhanceAll` EMC configs | Enhancement modules named by path | [README: bulk enhancement](../README.md#bulk-enhancement-with-enhance-and-enhanceall) |
| Feature `spawn` given as a path | A feature module | [README: async spawn](../README.md#async-spawn-lazy-loading-features) |
| Event bindings (` +=` with `call`) | A method on the listener's host (Tree: the element's `from`, e.g. a manager) | [event-binding.md](./event-binding.md) |
| `@eachTime` | Subscribes to an event target in the data | [README: @eachTime](../README.md#example-3f---reactive-iteration-with-eachtime) |

## 6. Conventions on your own classes

Code that runs because a class *has* a certain member, wherever an instance or class turns up:

| Member | Called when | Docs |
|---|---|---|
| `static assignTo(current, value, parent, key)` | A value is assigned onto an existing instance of the class (instead of replacing it) | [README: static assignTo](../README.md#custom-assignment-with-static-assignto-protocol) |
| Manager `constructor(element, initVals, ctx)` and `static onAssigned(instance, value, ctx)` | An itemscope manager is created, or later assigned a value. `ctx.rebind()` in Tree. | [README: itemscope managers](../README.md#itemscope-managers-chrome-146), [tree.md](./tree.md#ctxrebind) |
| Feature `static onAssigned`, `callbackForwarding` | A feature is set up; lifecycle callbacks are forwarded to it | [README: features](../README.md#class-level-setup-with-static-onassigned) |
| `static canSpawn(obj, ctx)` | Before an enhancement is spawned: returning false vetoes it | [README: canSpawn](../README.md#conditional-spawning-with-canspawn) |
| Enhancement `constructor(objToExtend, ctx, initVals)` | An enhancement is spawned | [README: constructor signature](../README.md#constructor-signature) |
| `installForwarding` | (A utility) forwards properties to a feature or sub-object | [README: installForwarding](../README.md#property-forwarding-with-installforwarding) |

## 7. Deliberately closed

| What | Why |
|---|---|
| Sync ops (` =&`: `join`, `microJoin`) | Imported statically, so ` =&` never loads anything. Not extensible from outside. See [sync-ops.md](./sync-ops.md). |
| Built-in handler names (`builtIns.*`) | A fixed map. Your own handlers go through `handlers`. |
