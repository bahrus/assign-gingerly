# Micro Data Joining and Locale Formatting

## The proposal


```html
<section id=oSection>
    <div></div>
</section>
```

```JavaScript
interface Person {
    lastName: string,
    firstName: string,
    age: number,
    isHappy: boolean,
}

const vm = {
    lastName: 'Targaryen'
    firstName: 'Helaena',
    birthDT: new Date('July 1, 109'),
    age: 21,
    isHappy: false,
};

const $ = paths<Person>(vm);
assignFrom(oSection, {
    '?.querySelector?.div =>' : {
        do: 'builtIns.microDataJoin',
        resolve: {
            value: sp `${$.firstName} ${$.lastName} who was born on ${$.birthDT} is ${$.age} years old and is ${vm.isHappy}`
        }
    }
});
```

results in (ignoring line breaks):

```html
<section id=oSection>
    <div itemscope>
        <span itemprop=firstName>Helaena</span> <span itemprop=lastName>Targaryen</span> who was born on <time itemprop=birthDT dateTime=0109-07-01T04:56:02.000Z>July 1, 109</time> is <data itemprop=age value=21>21</data> years old and is <data value=false></data>
    </div>
</section>
```

So string values map to spans, dates to time tags, number and boolean to data tags.

The textContent of the time tag and the data tag showing the age would apply default locale formatting.  The value attribute of data is unformatted.

If the target div already has the children above, it simply updates the attributes (where applicable) and textContent (where applicable).  Otherwise it creates them

If other children are found, I'm open to suggestions including simply deleting them.

I'm also open to suggestions of using the <?start> and <?end> markers.


---

## Feedback / Questions

### The Core Idea

This is a semantic rendering handler — it takes an `sp`-produced array (mix of literal strings and resolved values) and renders them as microdata-annotated DOM elements. Each dynamic value gets an appropriate HTML element based on its JavaScript type, with `itemprop` for the property name and proper semantic markup.

It's the "rich" counterpart to `builtIns.join` — where `join` produces a flat string, `microDataJoin` produces structured DOM with semantics baked in.

### Type → Element Mapping

| JS Type | HTML Element | Attributes | textContent |
|---------|-------------|------------|-------------|
| `string` | `<span>` | `itemprop=name` | the value |
| `number` | `<data>` | `itemprop=name value=rawValue` | locale-formatted (e.g., `toLocaleString()`) |
| `boolean` | `<data>` | `itemprop=name value=true/false` | empty (or localized "Yes"/"No"?) |
| `Date` | `<time>` | `itemprop=name datetime=isoString` | locale-formatted (e.g., `toLocaleDateString()`) |
| literal string (between interpolations) | Text node | — | the literal text |

### Questions

1. **How does the handler know the property name for `itemprop`?**

   With `builtIns.join`, the resolved array is just values — path strings have already been resolved to their values. The property *name* (`'firstName'`, `'lastName'`) is lost by the time the handler receives `resolvedParams.value`.

   For `microDataJoin` to produce `itemprop=firstName`, it needs the path name, not just the resolved value.

   **Possible solutions:**

   A. **Change `sp` to preserve metadata.** Instead of producing `['?.lastName', ', ', '?.firstName']`, it could produce objects with both path and resolved value:
   ```js
   [{ path: '?.firstName', value: 'Helaena' }, ' ', { path: '?.lastName', value: 'Targaryen' }, ...]
   ```
   But this breaks the current model where `resolveValues` replaces path strings with values.

   B. **Resolve differently for this handler.** The handler receives the *unresolved* array and does its own resolution, preserving names. This means `value` in `resolve` would need to be treated specially — not resolved by `resolveValues` upfront.

   C. **Use a parallel array.** Provide both the resolved values and the property names:
   ```js
   resolve: {
       value: sp`${$.firstName} ${$.lastName}`,    // resolved to actual values
       names: sp`${$.firstName} ${$.lastName}`,    // kept as path strings
   }
   ```
   But this is redundant and error-prone.

   D. **`sp` produces tuples of [pathString, resolvedValue].** The tag function could output a richer structure when used with `microDataJoin`. But that couples `sp` to this specific handler.

   E. **The handler uses the *unresolved* array and resolves itself.** If `resolveValues` is told to skip arrays (or a specific key), the handler receives `['?.firstName', ' ', '?.lastName', ...]` and resolves each element itself, extracting both the name (last segment of path) and the value.

   **My recommendation: Option E.** The handler receives the raw path strings (unresolved) and does its own resolution + rendering. This means the `value` key in `resolve` should *not* be resolved by `resolveValues` for this handler — it needs the raw paths.

   But wait — with the current architecture, `resolveValues` resolves *everything* in the `resolve` map before passing to the handler. To keep the paths unresolved, we'd need one of:
   - A special key prefix that tells `resolveValues` to skip (e.g., `_value` or `raw:value`)
   - The handler declares which resolve keys should be left raw
   - Move the array outside of `resolve` into the config directly (not resolved)

   **Simplest approach:** Put the template in the config, not in `resolve`:

   ```js
   '?.querySelector?.div =>': {
       do: 'builtIns.microDataJoin',
       template: sp`${$.firstName} ${$.lastName} was born on ${$.birthDT}`,
       // template is NOT in resolve — not pre-resolved
   }
   ```

   Then the handler receives `config.template` as the raw array of path strings + literals, resolves them itself against `options.from`, and extracts both names and values.

2. **How does `sp` work here with `paths<Person>(vm)`?**

   You wrote `const $ = paths<Person>(vm)` — but `paths<T>()` currently takes no arguments (it creates a proxy, not bound to a real object). The proxy produces path strings (`'?.firstName'` etc.), not actual values.

   If `sp` receives proxies, it auto-extracts to path strings: `sp\`${$.firstName} ${$.lastName}\`` → `['?.firstName', ' ', '?.lastName']`.

   But in `sp\`... ${vm.isHappy}\``, `vm.isHappy` is a real boolean (`false`), not a proxy. So `sp` receives a mix of path-proxy objects and real values. That's fine — `sp` just passes non-proxy values through. But then the handler can't know the *property name* for `vm.isHappy`.

   **This confirms:** you'd want to use proxies for everything:
   ```js
   sp`${$.firstName} ${$.lastName} who was born on ${$.birthDT} is ${$.age} years old and is ${$.isHappy}`
   ```
   All interpolations are proxy objects → `sp` produces all path strings. The handler resolves them against `options.from` to get both names and values.

3. **Updating existing children vs creating new ones:**

   If the `<div>` already has `<span itemprop=firstName>`, the handler should find it and update `textContent` rather than recreating. This is diffing — find by `itemprop` match, update in place.

   For literal text nodes between elements, it could match by position.

   **Using markers:** I'd recommend the `<?start>` / `<?end>` markers (same as lazyLoad). On first render, create all children between markers. On update, find existing children by `itemprop` and update them.

4. **Boolean display:**

   `<data itemprop=isHappy value=false></data>` — empty textContent for booleans seems odd visually. Options:
   - Empty (your example) — microdata-only, no visible text
   - Localized: `"Yes"/"No"` or `"true"/"false"`
   - Configurable via an option

5. **Locale formatting config:**

   Default to `toLocaleString()` for numbers and dates. But should the handler accept locale/options config?
   ```js
   {
       do: 'builtIns.microDataJoin',
       template: sp`...`,
       locale: 'en-US',
       dateOptions: { dateStyle: 'long' },
       numberOptions: { maximumFractionDigits: 2 },
   }
   ```

6. **What about `null`/`undefined` values?**

   If a path resolves to `null`/`undefined`, should the corresponding element be:
   - Omitted entirely (all-or-nothing for nested arrays, like `builtIns.join`)?
   - Rendered empty (`<span itemprop=firstName></span>`)?
   - Use the same nested-array optional-segment pattern from `join`?

### Summary of Key Design Decisions Needed

1. Where does the template live — `config.template` (not resolved) or `resolve.value` (needs special handling)?
2. How does the handler get property names — from raw path strings in the template?
3. Markers for tracking rendered content?
4. Boolean display — empty, "Yes"/"No", or configurable?
5. Locale/formatting options?
6. Null handling — omit, render empty, or all-or-nothing segments?

---

## Human Response I

You summrized the goal well.

I realize my proposal was not well thought through, and am finding the discussion a bit overwhelming.

Perhaps we should split the topic into two parts:

1. Forget about developer convenience -- how do we represent the handler config as pure JSON?

2.  Then figure out how to make it easy for a developer to create the JSON.  Maybe we could use another tagged template function that we define ( say md `` )?



---

## Response to Human Response I

Good call — let's simplify by separating the two concerns.

### Part 1: The JSON Representation (Runtime)

Forgetting about DX for a moment, what does the handler config look like as pure, serializable JSON?

The handler needs for each dynamic segment: **what property to read** (path) and **what type it is** (to pick the right element). The type can be inferred at runtime from the resolved value, so we don't need it in the config. The property name comes from the path string (last segment).

**Proposed JSON structure:**

```json
{
    "do": "builtIns.microDataJoin",
    "template": [
        "?.firstName",
        " ",
        "?.lastName",
        " who was born on ",
        "?.birthDT",
        " is ",
        "?.age",
        " years old and is ",
        "?.isHappy"
    ]
}
```

That's it. The template is a flat array where:
- Strings starting with `?.` are **dynamic segments** — resolved against `options.from`, wrapped in semantic HTML based on the resolved value's type, with `itemprop` set to the last path segment.
- All other strings are **static text** — rendered as text nodes.

The handler:
1. Iterates the template array
2. For each `?.`-prefixed string: resolves the value, picks the element type, sets `itemprop`
3. For each plain string: creates a text node
4. Inserts/updates between markers

**Optional segments (nested arrays, same as `join`):**

```json
{
    "do": "builtIns.microDataJoin",
    "template": [
        "?.firstName",
        [" ", "?.middleName"],
        " ",
        "?.lastName"
    ]
}
```

If `middleName` is null/undefined, the entire sub-array is dropped (no extra space).

**Why `template` lives in config (not in `resolve`):**

The handler needs the raw path strings to extract property names. If they go through `resolveValues`, they'd be replaced with actual values and the names would be lost. Keeping them in `config.template` means they bypass `resolveValues` — the handler resolves them internally.

### Part 2: Authoring DX (Compile Time)

Once the JSON structure is settled, a tagged template function (say `md`) could produce it:

```ts
import { paths, md } from 'assign-gingerly/paths.js';

interface Person { firstName: string; lastName: string; birthDT: Date; age: number; isHappy: boolean; }
const $ = paths<Person>();

const template = md`${$.firstName} ${$.lastName} who was born on ${$.birthDT} is ${$.age} years old and is ${$.isHappy}`;
// Produces: ['?.firstName', ' ', '?.lastName', ' who was born on ', '?.birthDT', ' is ', '?.age', ' years old and is ', '?.isHappy']
```

This is essentially the same as `sp` — it interleaves static strings with proxy-extracted path strings. In fact, **`sp` already does this** — `md` could just be an alias, or `sp` could be used directly:

```ts
const template = sp`${$.firstName} ${$.lastName} who was born on ${$.birthDT}`;
```

The only difference from the `join` use case is that `microDataJoin` uses `config.template` instead of `resolve.value`.

So the full DX story:

```ts
const $ = paths<Person>();

export default {
    '?.querySelector?.div =>': {
        do: 'builtIns.microDataJoin',
        template: sp`${$.firstName} ${$.lastName} who was born on ${$.birthDT} is ${$.age} years old`
    }
};
```

### Does This Feel Simpler?

The runtime handler is straightforward:
- Receives `config.template` (array of path strings + literals)
- Resolves paths itself against `options.from`
- Renders semantic DOM based on value types
- Uses markers for idempotent updates

The DX layer is just `sp` (already implemented) + `paths` (already implemented). No new tag function needed unless you want a distinct name for clarity.

### Questions for Part 1

1. **Does the flat array with `?.`-prefixed strings as the JSON format work?**
2. **Should `template` support nested arrays for optional segments (same as `join`)?**
3. **For updating: markers + match by `itemprop` position?**

Let me know if this framing helps, and we can tackle Part 1 implementation whenever you're ready.

---

## Human Response II

No need for another tagged template library if it does the same exact thing, that would just be confusing.

I wonder if we should go back to Join, and use a template outside resolve, so it is easy to switch between the two, and less to learn?

I guess I was thinking of this alternative approach:

**Proposed JSON structure:**

```js
{
    do: "builtIns.microDataJoin",
    resolve: {
        template: [
            {prop: 'firstName', val: "?.firstName"},
            " ",
            {prop: 'lastName', val: "?.lastName"},
            " who was born on ",
            {prop: 'birthDT', val: "?.birthDT"},
            " is ",
            {prop: 'age', val: "?.age"},
            " years old and is ",
            {prop: 'isHappy'},
            "?.isHappy"
        ]
    }
}
```

** Proposed DX **

The tagged template library md generates this structure from the same pattern discussed above.  In addition, if other properties need to be set the developer could be explicit when needed:

```JS
const template = md`${$.firstName} ${$.lastName} who was born on ${{prop: 'birthDate', val: $.birthDT, format: '...'}} is ${$.age} years old and is ${$.isHappy}`;
```

** Minimizing the effort to switch between the two **

We could go back to the joins handler and rename the "value" property to "template".  

We could even go back to the joins handler and make it use the same JSON structure, but that would result in more syntax that gets thrown away.

What do you think?


---

## Response to Human Response II

### On the JSON Structure with `{prop, val}` Objects

I see what you're going for — making the property name explicit rather than deriving it from the path string. This has merits:

- **Explicit is clear.** No need to infer `itemprop` from the last segment of `'?.firstName'` — it's right there in `prop`.
- **Allows renaming.** You could map `$.birthDT` to `itemprop="birthDate"` — the source property name doesn't have to match the microdata property name.
- **Extensible.** The object form can carry additional config per-segment (`format`, `locale`, etc.) without needing a parallel config structure.

**One issue with putting it in `resolve`:** `resolveValues` will try to resolve `'?.firstName'` inside those objects. Currently, `resolveValues` recurses into plain objects — so `{ prop: 'firstName', val: '?.firstName' }` would become `{ prop: 'firstName', val: 'Helaena' }` after resolution. That's actually fine! The handler receives resolved values *plus* the explicit `prop` name. The `prop` field isn't a path (no `?.` prefix), so it passes through as a literal.

So this works with the current `resolveValues` pipeline — no special handling needed. That's a win over my earlier "keep in config" suggestion.

### The `md` Tag Function

For DX, `md` would produce the `{prop, val}` structure from proxy objects:

```ts
// md`${$.firstName} ${$.lastName}` produces:
[
    { prop: 'firstName', val: '?.firstName' },
    ' ',
    { prop: 'lastName', val: '?.lastName' }
]
```

And for the explicit object form in interpolations:

```ts
md`... ${{prop: 'birthDate', val: $.birthDT, format: '...'}} ...`
// Passes through the object as-is (sp already preserves non-proxy objects)
```

The `md` implementation would be similar to `sp` but:
- For proxy objects: produces `{ prop: extractLastSegment(path), val: pathString }` instead of just the path string
- For plain objects: passes through as-is (allows developer overrides)
- For literal strings between interpolations: passes through as strings

That's about 10 lines different from `sp`. Worth a separate function name since the output structure differs.

### On Renaming `join`'s `value` to `template`

I'd keep them separate:
- **`join`** uses `resolve.value` → produces a flat string
- **`microDataJoin`** uses `resolve.template` → produces semantic DOM

Reasons:
- "value" communicates "this resolves to a single value (a string)"
- "template" communicates "this is a pattern that produces structured output"
- Different names signal different behavior — less confusion about what each handler does

If you rename `join`'s field to `template` too, then both handlers accept `resolve.template` but produce fundamentally different outputs (string vs DOM). That could confuse consumers wondering "why does the same input produce different results?" The `do` field answers that — but having the field name hint at the output type is a nice ergonomic touch.

**However**, if the goal is "easy to switch between the two" — same field name means you literally just change the `do` value. That's compelling for the upgrade path:

```js
// Start simple:
{ do: 'builtIns.join', resolve: { template: [...] } }

// Upgrade to semantic HTML:
{ do: 'builtIns.microDataJoin', resolve: { template: [...] } }
```

One-character change. I can see the appeal.

### My Recommendation

1. **Keep `join` using `resolve.value`** (it's already shipped and documented).
2. **`microDataJoin` uses `resolve.template`** — the richer `{prop, val}` structure.
3. **`md` tag function** — produces `{prop, val}` objects from proxies. Separate from `sp` since the output format differs.
4. **`join` could also accept `resolve.template`** with the `{prop, val}` structure — it just ignores `prop` and uses `val`. This gives the easy-switch ergonomic without renaming anything.

That way:
- `sp` → flat array of path strings (for `join`)
- `md` → array of `{prop, val}` objects + literals (for `microDataJoin`)
- Both `join` and `microDataJoin` accept `resolve.template` with `{prop, val}` items
- `join` additionally accepts `resolve.value` with the simpler flat format

### Questions

1. **Does `join` accepting both `resolve.value` (flat) and `resolve.template` ({prop, val}) sound right?** Or just stick with one field name?
2. **Should `md` live in the same `paths.ts` module, or a new `microdata.ts`?**
3. **Ready to hold on this and revisit when you want to implement, or flesh out further?**

---

## Human Response III

I like the way to strove to synthesize the idea of making it easy to switch.

Let's go with your recommendations and 

1.  Not make `join` accept `resolve.template` ({prop, val})` for now, but create a separate file in the same TODO folder this file is in with that idea.
2.  If the number of lines required for `md` is significant, I would prefer a separate module, but where possible to share common code between the two.  I'll leave that to your judgment.

I think I'm ready for you to start implementing now.
