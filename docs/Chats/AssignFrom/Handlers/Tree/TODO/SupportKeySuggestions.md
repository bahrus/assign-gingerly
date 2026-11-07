# Support Key Suggestions

## Bruce's Ask

It is possible with typescript to suggest strings but not require them:

```TS
export type StringWithAutocompleteOptions<TOptions> = 
     | (string & {})
     | TOptions;
```

Can we use that with the tree keys?

```TS
export interface TreeConfig<T> extends HandlerConfig {
    //suggest that the lhs should be a key of T, but not required?
    map: Record<string, ElementSpecification>;
```


## Claude's Answer

**Yes, but not with `Record`.** I checked with a TypeScript language service (VS Code's bundled TypeScript), asking it for completions inside the map literal and for errors.

### What works and what doesn't

| Type of `map` | Suggests `name`, `rocket`, `success`? | Missing keys | Extra keys (`'rocket /* summary */'`, `'*'`) |
|---|---|---|---|
| `Record<keyof T \| (string & {}), ES>` | ✅ | ❌ **errors**: `Record` makes every `keyof T` key required | ✅ |
| `{ [K in keyof T]?: ES } & Record<string, ES>` | ✅ | ✅ fine | ✅ |
| `{ [K in Extract<keyof T, string> \| '*']?: ES } & { [key: string]: ES }` | ✅, and `'*'` too | ✅ fine | ✅ |

**`(string & {})` works for values, not keys.** Inside `Record`, `keyof T | (string & {})` still lists the known keys, but a mapped type makes listed keys *required*. The fix is a mapped type with **optional** known keys, intersected with a string index signature for everything else. The third row also suggests `'*'`.

### Proposal

```TS
/** A tree's map: VM keys of T suggested (and '*'), none required; any other key (e.g. 'rocket /* summary *\/') allowed. */
export type TreeMap<T = any> =
    & { [K in Extract<keyof T, string> | '*']?: ElementSpecification }
    & { [key: string]: ElementSpecification };

export interface TreeConfig<T = any> extends HandlerConfig {
    do: 'builtIns.tree';
    map: TreeMap<T>;
    // … the rest unchanged
}
```

- **`T` defaults to `any`,** so existing uses of `TreeConfig` are unaffected. I checked that: with no type argument, there are no suggestions and no errors.
- **Values are still `ElementSpecification`.** Typing each key's spec against `T[K]` (so `'?.name'` inside `rocket` is checked against `Launch['rocket']`) would be a larger step. `` tree`…` `` with `paths<T>()` already covers that for templates.

### The catch: where `T` comes from

**A map written inline inside `assignFrom` gets no suggestions.** `assignFrom`'s pattern is an untyped `Record<string, any>`, so there's no type to suggest from. The language service returns nothing there, as it does today. The map needs a type at the point where it's written. Any of these works; I checked the first two:

```TS
// 1. satisfies: keeps the literal's own type, checks it, and suggests keys
const map = {
    name: ['h2', '?.'],
    'rocket /* summary */': ['p', '?.type'],
} satisfies TreeMap<Launch>;

// 2. A typed config
const config: TreeConfig<Launch> = { do: 'builtIns.tree', map: { /* suggestions here */ } };
assignFrom(container, { '?. =>': config }, { from: vm });

// 3. (possible later) a small typed helper, for JS with JSDoc too
const map = treeMap<Launch>()({ /* suggestions here */ });
```

**In JavaScript,** a JSDoc `@type {import('assign-gingerly/types/treeTypes.js').TreeMap<Launch>}` on the map does the same as the annotation in option 2.

**Nested trees** (`{ map, … }` in a children slot) key off the element's value, i.e. `T[K]`. `NestedTreeSpecification` could take that type parameter later. For now, nested maps would be `TreeMap<any>`.

### Questions

1. **Add `TreeMap<T>` and `TreeConfig<T = any>`** as above (a type-only change in the types submodule, with a docs paragraph)?
2. **A typed helper** (option 3) as well, or are `satisfies` and annotations enough?

## Bruce's Response

> 1. **Add `TreeMap<T>` and `TreeConfig<T = any>`** as above (a type-only change in the types submodule, with a docs paragraph)?

Yes to TreeMap<T = any> and TreeConfig<T = any>

>  2. **A typed helper** (option 3) as well, or are `satisfies` and annotations enough?

Let's not do the helper for now.


## Claude's Implementation Notes

**Done,** without the helper.

**`types/assign-gingerly/treeTypes.d.ts`** (submodule):

```TS
export type TreeMap<T = any> =
    & { [K in Extract<keyof T, string> | '*']?: ElementSpecification }
    & { [key: string]: ElementSpecification };

export interface TreeConfig<T = any> extends HandlerConfig {
    do: 'builtIns.tree';
    map: TreeMap<T>;
    // … unchanged
}
```

**Checked:**
- **tsc:** assign-gingerly type-checks unchanged. So does o2h, against the sibling's types, so `mapEntries`, `compileTree`, `NestedTreeSpecification` and `O2HConfig` all accept the new map type.
- **A language service against the real types file:**
  - `TreeConfig<Launch>` suggests `'*'`, `rocket` and `success` (`name` was already written, so it isn't offered again), with no errors for `'rocket /* summary */'`;
  - `satisfies TreeMap<Launch>` suggests all four;
  - plain `TreeConfig` suggests nothing and accepts any key, as before.

**Docs:** tree.md's Config section shows `TreeConfig<T = any>` with `map: TreeMap<T>`, plus a new subsection, "Key suggestions in editors: `TreeMap<T>`". It covers:
- the `satisfies` / annotated-config forms;
- why an inline map inside `assignFrom` gets no suggestions;
- the JSDoc equivalent;
- the fact that values aren't checked against the VM (pointing to `paths<T>()`).

**For you:** the types submodule needs its own commit. No `.ts` source or tests changed, since this is type-only.
