# Looped Substitution Revisited

---

## Human Ask

Previously, we implemented a [Looped Substitution](../RoundaboutDX/LoopedSubstitution.md).  While useful, I'm on the fence whether to keep it.  By nature, it is, I think, a DX improvement at the expense of run time performance (albeit small).  The tradeoff would seem worth it if it resulted in a performance tradeoff, but it doesn't fully solve the problem in the "real world" when incorporating assign-gingerly into dependent packages.  

The issue needs to integrate with solutions like [paths, with special support for the roundabout package](../../../../docs/paths-dx.md), that needs to know when to apply the handler.

For the roundabout package to be able to use Looped Substitution, what we really need during authoring is a convenenient, transparent way of generating something like this:

```html
<person-info>
<form id=myForm>
    <input name=firstName>
    <input name=lastName>
</form>
```
```JS
interface Person extends HTMLElement {
    fistName: string,
    lastName: string
}
const raConfig = {
    merges: smoothOver([
        {
            ifKeyIn: ['firstName'],
            //not yet added to roundabout, but planning on it
            assignOptions {
                withIds: {
                    firstName: {qry: '[name="fistName"]'}
                }
            },
            doAssign(
                //we haven't established this syntax yet
                //so we should debate that as well
                set($.#.firstName).to($.firstName)
            )
        },
        {
            ifKeyIn: ['lastName'],
            //not yet added to roundabout, but planning on it
            assignOptions {
                withIds: {
                    lastName: {qry: '[name="lastName"]'}
                }
            },
            doAssign(
                //we haven't established this syntax yet
                //so we should debate that as well
                set($.#.lastName).to($.lastName)
            )
        }
    ]),
};
```

I think you agree that as the number of fields grows that follows the same exact pattern, this would get quite tedious and error prone (of course, AI may make that argument irrelevant, but still, even AI would swallow tokens doing this kind of repetitive writing).  Plus sometimes a human will need to peer into the configuration, and looking at the code above would get extremely boring fast.

What are your suggestions?

---

## Feedback / Suggestions

### The Problem Restated

You have N fields that follow the same pattern:
1. Trigger on property change (`ifKeyIn`)
2. Resolve the element by query (`withIds` + `#[x]`)
3. Assign the VM value into the element (`set(...).to(...)`)

Writing this N times is repetitive. The runtime `where_x_in` expansion works but doesn't compose well with the typed proxy DX layer (it operates on strings, not proxies).

### What You Really Want

A **compile-time loop** that generates N merge entries from a pattern + a list of keys. It should:
- Produce the same verbose JSON output (no runtime cost)
- Integrate with the typed proxy (autocomplete on property names)
- Be readable at a glance ("these fields all follow this pattern")

### Suggestion: `forEachKey` — Compile-Time Expansion

A helper that takes an array of keys and a factory function, producing one merge entry per key:

```ts
import { paths, set, doAssign, smoothOver, forEachKey } from 'assign-gingerly/paths.js';

interface Person extends HTMLElement {
    firstName: string;
    lastName: string;
}

const $ = paths<Person>();

const raConfig = {
    merges: smoothOver([
        ...forEachKey<Person>(['firstName', 'lastName'], (key, $) => ({
            ifKeyIn: [key],
            assignOptions: {
                withIds: {
                    [key]: { qry: `[name="${key}"]` }
                }
            },
            ...doAssign(
                set($['#'][key]).to($[key])
            )
        })),
    ]),
};
```

**What `forEachKey` does:**

```ts
function forEachKey<T>(
    keys: (keyof T & string)[],
    factory: (key: keyof T & string, proxy: PathProxy<T>) => any
): any[] {
    const $ = paths<T>();  // or accept the proxy as a param
    return keys.map(key => factory(key, $));
}
```

That's it — `keys.map(factory)`. The value is:
- **Type safety on the keys array** — `['firstNam']` would be a TS error
- **Autocomplete inside the factory** — `$[key]` resolves to a proxy
- **Clear intent** — "for each of these keys, produce a merge entry with this shape"
- **Zero runtime cost** — it's just `.map()` at module-evaluation time

### The `$.#` Syntax

You used `$.#.firstName` — which would need to represent `#[firstName]` (the cached element ref syntax). For the proxy to support this:

```ts
$.querySelector('[name="firstName"]')  // path for finding the element
// vs.
$['#'].firstName  // represents '#[firstName]' in the config
```

The `#` accessor on the proxy could return a special sub-proxy that produces `#[varName]` strings instead of `?.varName`:

```ts
// In createPathProxy:
get(_, prop) {
    if (prop === '#') {
        return createIdRefProxy();  // returns proxy where $.foo → '#[foo]'
    }
    // ... normal path logic
}
```

Where `createIdRefProxy` produces strings like `#[firstName]` instead of `?.firstName`. This integrates `withIds` variable references into the proxy DX.

### Alternative: Simpler — `mapFields` Helper

If the pattern is specifically "for each field, bind an input by name to a VM property," a specialized helper cuts the boilerplate further:

```ts
import { mapFields } from 'assign-gingerly/paths.js';

const raConfig = {
    merges: smoothOver([
        ...mapFields<Person>(['firstName', 'lastName'], {
            qryPattern: key => `[name="${key}"]`,  // how to find the element
            // default: set(#[key]).to($.key) — the standard binding pattern
        }),
    ]),
};
```

`mapFields` generates the full merge entry per key (with `ifKeyIn`, `assignOptions.withIds`, and the assignment). For the 80% case (form field binding), this is a one-liner per field group.

But this might be too specialized. `forEachKey` with the factory function is more general — covers any repeated pattern, not just form fields.

### My Recommendation

**Layer the solutions:**

1. **`forEachKey(keys, factory)`** — general-purpose expansion. Works for any repeated pattern. ~3 lines of implementation.

2. **`$.#[key]` proxy support** — adds `#[varName]` string generation to the proxy. Needed regardless of which expansion approach you use (it's how you reference cached elements in the typed DX).

3. **`mapFields` (optional, future)** — a specialized shorthand for the common "bind input to VM property" pattern. Built on top of `forEachKey` internally.

### On Keeping `where_x_in` (Runtime Expansion)

I'd keep it — it serves a different purpose:
- `forEachKey` = compile-time, for `.mts` config authoring with full type safety
- `where_x_in` = runtime, for JSON configs that can't use JavaScript functions

They solve the same repetition problem in different contexts. Not redundant.

### Questions

1. **Does `forEachKey` with a factory function feel right?** Or too verbose for simple cases?
2. **Should the proxy support `$.#[key]` (or `$['#'].firstName`) for `#[varName]` references?**
3. **Is `mapFields` worth adding now, or park for later?**
4. **Should `forEachKey` accept the proxy as a parameter, or create its own internally?**

---

## Human Response I

> **Does `forEachKey` with a factory function feel right?**

Yes, it seems useful.  If anything, I think it would eread better if it is called forEachKeyIn.  Developers could rename it to something small using as in the import, correct?

> **Should the proxy support `$.#[key]` (or `$['#'].firstName`) for `#[varName]` references?**

I'm wondering why you are always using brackets.  Actually, couldn't the proxy match on:

```JS
$.#firstName
```

Since the proxy gets the name?  That looks more natural I think.

> **Is `mapFields` worth adding now, or park for later?**

I'll make a separate request for that.

> **Should `forEachKey` accept the proxy as a parameter, or create its own internally?**

It sounds like the developer ergonomics would be better if forEachKey creates its own internally, with no disadvantages.  If that is the case, let's go with it.

---

## Response to Human Response I

### On `forEachKeyIn` naming

Yes, `forEachKeyIn` reads better — "for each key in ['firstName', 'lastName'], do this." And yes, developers can rename on import:

```ts
import { forEachKeyIn as each } from 'assign-gingerly/paths.js';
```

### On `$.#firstName` syntax

Unfortunately, `$.#firstName` is not valid JavaScript — the `#` character starts a private field identifier in classes. Outside a class body, `$.#firstName` is a syntax error. The parser won't even let the proxy see it.

Valid alternatives:

| Syntax | Valid JS? | Notes |
|--------|-----------|-------|
| `$.#firstName` | ❌ | Private field syntax — syntax error outside class |
| `$['#firstName']` | ✅ | Bracket notation with string — proxy sees `'#firstName'` |
| `$['#'].firstName` | ✅ | Two steps — proxy sees `'#'` then `'firstName'` |
| `$.id.firstName` | ✅ | Uses `.id` as the "cached ref" namespace |
| `$.ref.firstName` | ✅ | Uses `.ref` as the namespace |
| `$._firstName` | ✅ | Underscore prefix convention |

**My recommendation: `$['#'].firstName`** (or a named accessor like `$.id.firstName`)

With `$['#'].firstName`:
- The proxy sees `'#'` as a property access → returns a sub-proxy that produces `#[varName]` strings
- Then `.firstName` on that sub-proxy produces `'#[firstName]'`
- It visually mirrors the `#[x]` syntax used in pattern keys

With `$.id.firstName`:
- Reads as "the element cached by id under the name firstName"
- Cleaner syntax (no brackets)
- But `id` could collide with a real VM property name

**Best option considering readability:**

```ts
$['#'].firstName    // produces '#[firstName]'
```

Or if you prefer no brackets at all, we could use a method call:

```ts
$.ref('firstName')  // produces '#[firstName]'
```

This uses the apply trap — `ref` is just a property name that triggers the method call pattern. But then `.ref` can't chain further.

### What I'll implement

1. **`forEachKeyIn<T>(keys, factory)`** — creates proxy internally, calls `factory(key, $)` for each key
2. **`$['#'].propName`** — sub-proxy that produces `'#[propName]'` strings for `withIds` references

Let me know if the `$['#']` approach works, or if you'd prefer something else before I implement.

## Human Response II

I think my preference is for:

$['#firstName']

Please implement if that works.


