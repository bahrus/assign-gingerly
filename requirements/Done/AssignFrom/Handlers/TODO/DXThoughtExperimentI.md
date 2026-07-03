# DX Thought Experiment I

---

## Human Ask

Is it possible to create a proxy p so that:

```Javascript
console.log(p.a.b)
// 'a?.b';
console.log(p.a.b.c)
// 'a?.b?.c
```

Or, less ideal:

```Javascript
console.log(p.a.b.path)
// 'a?.b';
console.log(p.a.b.c.path)
// 'a?.b?.c
```

---

## Feedback

### Short Answer

**Option 1 (implicit `toString`):** Yes, with a caveat — `console.log` calls `toString()` which you can control, but the proxy value itself is still an object (not a string). So `p.a.b === '?.a?.b'` would be `false`, but `String(p.a.b) === '?.a?.b'` would be `true`, and template literals would work: `` `${p.a.b}` === '?.a?.b' ``.

**Option 2 (explicit `.path`):** Yes, trivially — `.path` is just another property that returns the accumulated string.

### Implementation

```ts
function createPathProxy(prefix: string = ''): any {
    return new Proxy({}, {
        get(_, prop: string | symbol) {
            if (prop === Symbol.toPrimitive || prop === 'toString' || prop === 'valueOf') {
                return () => prefix.length > 0 ? `?.${prefix}` : '?.';
            }
            if (prop === Symbol.iterator) return undefined;
            if (typeof prop === 'symbol') return undefined;

            // For JSON.stringify support
            if (prop === 'toJSON') {
                return () => prefix.length > 0 ? `?.${prefix}` : '?.';
            }

            const newPath = prefix ? `${prefix}?.${prop}` : prop;
            return createPathProxy(newPath);
        }
    });
}

const p = createPathProxy();

console.log(`${p.a.b}`);     // '?.a?.b'
console.log(`${p.a.b.c}`);   // '?.a?.b?.c'
console.log(String(p.a.b));  // '?.a?.b'
```

### How It Works

- Every property access returns a new proxy with the accumulated path
- `toString()` / `Symbol.toPrimitive` / `valueOf` return the path string with `?.` prefix
- Nested access (`p.a.b.c`) chains naturally — each `.` creates a deeper proxy

### The Catch: String Coercion

The proxy **is not a string** — it's an object. This matters for:

```ts
p.a.b === '?.a?.b'           // false (object !== string)
typeof p.a.b                  // 'object'
p.a.b == '?.a?.b'            // true (loose equality triggers toString)
```

But in practice, this works fine for the `assignFrom` use case because:
1. **Object keys**: When used as an object key, JS calls `toString()` → `'?.a?.b'` ✓
2. **Array elements**: When placed in an array and later joined, `toString()` is called ✓
3. **Template literals**: `` `${p.a.b}` `` calls `Symbol.toPrimitive` → `'?.a?.b'` ✓
4. **JSON serialization**: `toJSON()` hook returns the string ✓

### Where It Would NOT Work

```ts
// Won't work — strict equality with a string
if (p.a.b === '?.a?.b') { ... }  // always false

// Won't work — typeof check
if (typeof p.a.b === 'string') { ... }  // false, it's 'object'

// Won't work — startsWith / includes (string methods)
p.a.b.startsWith('?.')  // returns another proxy for path 'a?.b?.startsWith'!
```

That last one is particularly tricky — accessing `.startsWith` on the proxy doesn't call the string method, it creates a deeper proxy path. This is the fundamental tension: the proxy intercepts *all* property access, so there's no way to distinguish "I want the string method" from "I want to go deeper."

### Making It Work for `assignFrom`

For the `join` handler `value` array and `resolveValues` RHS values, it works naturally:

```ts
const p = createPathProxy();

// In a .mts config file:
const pattern = {
    [String(p.textContent)]: {  // key: '?.textContent'
        do: 'builtIns.join',
        resolve: {
            value: [p.lastName, ', ', p.firstName]
            // Array elements coerce via toString when resolveValues processes them?
            // Actually NO — resolveValues checks `typeof item === 'string'`
        }
    }
};
```

**Problem:** `resolveValues` and the array resolution logic check `typeof value === 'string' && value.startsWith('?.')`. A proxy object would fail the `typeof` check.

### The Fix for resolveValues

To support proxy path objects, `resolveValues` (and `resolveArray`) would need to also check for the path-proxy protocol — e.g., check if the value has a `Symbol.toPrimitive` that returns a `?.`-prefixed string:

```ts
function isPathLike(value: any): string | false {
    if (typeof value === 'string') return value.startsWith('?.') ? value : false;
    if (value && typeof value === 'object' && Symbol.toPrimitive in value) {
        const str = String(value);
        return str.startsWith('?.') ? str : false;
    }
    return false;
}
```

Or simpler: call `String(value)` on non-string values and check if the result starts with `?.`. But that's risky — any object's `toString()` could coincidentally produce `?.something`.

### Alternative: Explicit `.path` Property (Your Option 2)

Cleaner and avoids all coercion ambiguity:

```ts
function createPathProxy(prefix: string = ''): any {
    return new Proxy({}, {
        get(_, prop: string | symbol) {
            if (prop === 'path') {
                return prefix.length > 0 ? `?.${prefix}` : '?.';
            }
            if (typeof prop === 'symbol') return undefined;
            
            const newPath = prefix ? `${prefix}?.${prop}` : prop;
            return createPathProxy(newPath);
        }
    });
}

const p = createPathProxy();
p.a.b.path       // '?.a?.b' (a real string)
p.a.b.c.path     // '?.a?.b?.c'
```

Usage:
```ts
const pattern = {
    [p.textContent.path]: {       // '?.textContent'
        do: 'builtIns.join',
        resolve: {
            value: [p.lastName.path, ', ', p.firstName.path]
        }
    }
};
```

**Pros:** No coercion magic, no `resolveValues` changes needed, just real strings.  
**Cons:** More verbose — `.path` on every use.

### A Third Option: `.p` (Short Accessor)

Compromise — single character:

```ts
const $ = createPathProxy();

const pattern = {
    [$.textContent.p]: {
        do: 'builtIns.join',
        resolve: {
            value: [$.lastName.p, ', ', $.firstName.p]
        }
    }
};
```

### Typed Proxy for Autocomplete

To get TypeScript autocomplete on the proxy:

```ts
function paths<T>(): PathProxy<T> { return createPathProxy() as any; }

type PathProxy<T> = {
    [K in keyof T]: T[K] extends object ? PathProxy<T[K]> & { path: string } : { path: string };
} & { path: string };

interface Person {
    firstName?: string;
    middleName?: string;
    lastName: string;
    address: { city: string; zip: string };
}

const $ = paths<Person>();
$.lastName.path            // '?.lastName' — autocomplete works!
$.address.city.path        // '?.address?.city'
$.typo.path                // TS error: 'typo' does not exist on type Person
```

This gives you:
- ✅ Full autocomplete on property names
- ✅ Compile-time errors for typos
- ✅ Output is a plain string (no coercion weirdness)
- ✅ Nested paths work
- ⚠️ Requires `.path` at the end
- ⚠️ Optional properties show up in autocomplete (good — you'd want those)

### My Recommendation

The **typed proxy with `.path`** (or `.p` for brevity) is the sweet spot:
- Full type safety and autocomplete
- No magic coercion / no changes to `resolveValues`
- Output is a real string — works everywhere
- The `.path` suffix is a small ergonomic cost for significant safety gains

The implicit `toString` approach (Option 1) is clever but fragile — it breaks at the `resolveValues` boundary and introduces subtle coercion bugs. Not worth the magic.

### Questions

1. **Does `.path` (or `.p`) feel acceptable ergonomically?** It's the safest approach.
2. **Should this live in this package (`assign-gingerly/paths.js`) or is it general utility?**
3. **Do you want this now, or park it for the `tags.js` authoring story later?**

---

## Human Response I

Really I'm not happy with:

```ts
const pattern = {
    [p.textContent.path]: {       // '?.textContent'
        do: 'builtIns.join',
        resolve: {
            value: [p.lastName.path, ', ', p.firstName.path]
        }
    }
};
```

I would much rather see this work:


```ts
const rhsP = (new TemplateLiteralFriendlyProxy()) as any as Person;
const value = tbd `${rhsP.lastName.path}, ${rhsP.firstName.path}`;
// value = ['?.lastName', ', ', '?.firstName'];
const pattern = {
    '?.textContent': {        
        do: 'builtIns.join',
        resolve: {
            value
        }
    }
};
```

Can that work?

---

## Response to Human Response I

Yes — that works perfectly. Let me break down why.

### Why It Works

The key insight: in a tagged template literal, the interpolated expressions are **evaluated before** being passed to the tag function. So:

```ts
tbd`${rhsP.lastName.path}, ${rhsP.firstName.path}`
```

Execution order:
1. `rhsP.lastName.path` evaluates → `'?.lastName'` (a real string, from the proxy)
2. `rhsP.firstName.path` evaluates → `'?.firstName'` (a real string)
3. `tbd` receives: `strings = ['', ', ', '']`, `values = ['?.lastName', '?.firstName']`
4. `tbd` interleaves them → `['?.lastName', ', ', '?.firstName']`

There's no magic here — `.path` gives you real strings, and the tag function just interleaves the static strings with the interpolated values. It all composes naturally.

### The Complete Picture

```ts
import { paths, j } from 'assign-gingerly/paths.js';

interface Person {
    firstName?: string;
    middleName?: string;
    lastName: string;
}

const $ = paths<Person>();

const value = j`${$.lastName.path}, ${$.firstName.path}`;
// value = ['?.lastName', ', ', '?.firstName']
```

### Nested Arrays (Optional Segments) in Template Literals?

The template literal approach works great for flat arrays. But the all-or-nothing nested sub-arrays (for optional segments) don't fit naturally into template literal syntax, since template literals produce a flat interleaving.

For optional segments, you'd pass an array as an interpolation — the tag function preserves it nested:

```ts
const value = j`${$.lastName.path}${[', ', $.middleName.path]}, ${$.firstName.path}`;
// j sees values = ['?.lastName', [', ', '?.middleName'], ', ', '?.firstName']
// Arrays in interpolation slots are kept nested
```

This works because the tag function receives the raw values — it can detect arrays and preserve them:

```ts
function j(strings: TemplateStringsArray, ...values: any[]): any[] {
    const result: any[] = [];
    for (let i = 0; i < strings.length; i++) {
        if (strings[i]) result.push(strings[i]);
        if (i < values.length) {
            result.push(values[i]); // preserves arrays as nested
        }
    }
    return result;
}
```

### Can We Eliminate `.path`?

If the tag function could accept the proxy objects directly (without `.path`):

```ts
const value = j`${$.lastName}, ${$.firstName}`;
// No .path needed!
```

This requires `j` to detect proxy objects and extract the path internally. We can use a symbol as the detection mechanism:

```ts
const PATH_SYMBOL = Symbol('assign-gingerly-path');

// In createPathProxy:
get(_, prop) {
    if (prop === PATH_SYMBOL) return `?.${prefix}`;
    if (prop === 'path') return `?.${prefix}`;
    // ...normal proxy behavior
}

// In j:
function j(strings: TemplateStringsArray, ...values: any[]): any[] {
    const result: any[] = [];
    for (let i = 0; i < strings.length; i++) {
        if (strings[i]) result.push(strings[i]);
        if (i < values.length) {
            const v = values[i];
            // Auto-extract path from proxy objects
            result.push(v && typeof v === 'object' && PATH_SYMBOL in v ? v[PATH_SYMBOL] : v);
        }
    }
    return result;
}
```

Then the usage becomes:

```ts
const $ = paths<Person>();
const value = j`${$.lastName}, ${$.firstName}`;
// ['?.lastName', ', ', '?.firstName']

// Optional segment with nested array:
const value2 = j`${$.lastName}${[', ', $.middleName]}, ${$.firstName}`;
// ['?.lastName', [', ', '?.middleName'], ', ', '?.firstName']
```

No `.path` needed inside `j` template literals — the tag auto-extracts. You'd still use `.path` when passing proxies to non-`j` contexts (object keys, raw arrays, etc.).

### Full Ergonomic Example

```ts
import { paths, j } from 'assign-gingerly/paths.js';

interface Person {
    firstName?: string;
    middleName?: string;
    lastName: string;
}

const $ = paths<Person>();

export default {
    '?.textContent =>': {
        do: 'builtIns.join',
        resolve: {
            value: j`${$.lastName}, ${$.firstName}`
        }
    }
};
```

**What you get:**
- ✅ Autocomplete on `$.lastName`, `$.firstName`, etc.
- ✅ Compile-time error on `$.lasName` (typo)
- ✅ Template literal syntax — reads like a natural string template
- ✅ Output is a plain JSON-serializable array
- ✅ No `.path` needed inside `j` (auto-extracted)
- ✅ No changes needed to `resolveValues` or the handler system

### The Implementation (Tiny — ~30 lines total)

```ts
// paths.ts
const PATH_SYMBOL = Symbol('assign-gingerly-path');

type PathProxy<T> = {
    [K in keyof T]: T[K] extends object 
        ? PathProxy<T[K]> & { path: string }
        : { path: string };
} & { path: string };

function createPathProxy(prefix: string): any {
    return new Proxy({}, {
        get(_, prop: string | symbol) {
            if (prop === 'path' || prop === PATH_SYMBOL) {
                return prefix.length > 0 ? `?.${prefix}` : '?.';
            }
            if (typeof prop === 'symbol') return undefined;
            const newPath = prefix ? `${prefix}?.${prop}` : String(prop);
            return createPathProxy(newPath);
        }
    });
}

export function paths<T>(): PathProxy<T> {
    return createPathProxy('') as any;
}

export function j(strings: TemplateStringsArray, ...values: any[]): any[] {
    const result: any[] = [];
    for (let i = 0; i < strings.length; i++) {
        if (strings[i]) result.push(strings[i]);
        if (i < values.length) {
            const v = values[i];
            if (v && typeof v === 'object' && PATH_SYMBOL in v) {
                result.push(v[PATH_SYMBOL]);
            } else if (Array.isArray(v)) {
                // Nested array — recursively extract paths from proxy elements
                result.push(v.map(el => 
                    el && typeof el === 'object' && PATH_SYMBOL in el ? el[PATH_SYMBOL] : el
                ));
            } else {
                result.push(v);
            }
        }
    }
    return result;
}
```

### Questions

1. **Does `j` + auto-extraction (no `.path` inside `j` template literals) feel right?** Outside `j` you'd still call `.path` for raw string contexts.
2. **Want me to implement this now (`paths.ts`), or continue parking it?**

---

## Human Response II

I'm very happy to hear we can safely remove the .path.  Not only does that reduce typing, it also avoids Typescript headaches.

I'm not sold on the name 'j'.  If it stands for join, really we are doing the opposite, sort of, within this  very limited context.  If anythinf I would use 's' for split.  What is your thinking on the name?  Any other suggestions?  Once this is resolved, I think we're ready for implementation.

---

## Response to Human Response II

Fair point on the naming. Let me think through what this function actually does:

### What It Does

It takes a template literal and produces an **interleaved array** of static strings and dynamic path references. It's the *authoring step* that produces the input for `builtIns.join` — the runtime handler does the joining, while this tag does the... splitting? Decomposing? Templating?

### Name Candidates

| Name | Rationale | Feel |
|------|-----------|------|
| `s` | "split" — you're splitting a template into parts | Short, but `s` is very generic |
| `t` | "template" — you're defining a template | Short, common letter |
| `tpl` | "template" spelled out a bit | Clearer, still short |
| `parts` | Describes the output (an array of parts) | Reads well: `` parts`...` `` |
| `seg` | "segments" | Meh |
| `resolve` | Describes intent (these will be resolved later) | Clashes with `resolve` map |
| `from` | As in "build this from..." | Clashes with `options.from` |
| `compose` | You're composing a string template | A bit long for a tag |
| `$` | Symbolic, looks like template interpolation | Clashes with jQuery, common var name |
| `_` | Minimal | Clashes with lodash convention |
| `p` | "pattern" or "path" | Already used for the proxy |
| `split` | Explicit about what it does | `` split`${$.lastName}, ${$.firstName}` `` |

### My Picks

**`s`** if you want maximum brevity:
```ts
const value = s`${$.lastName}, ${$.firstName}`;
```

**`tpl`** if you want slightly more clarity:
```ts
const value = tpl`${$.lastName}, ${$.firstName}`;
```

**`parts`** if you want it to read like English:
```ts
const value = parts`${$.lastName}, ${$.firstName}`;
```

### My Thinking on `j`

I originally picked `j` for "join" since the output feeds into `builtIns.join`. But you're right — the tag itself isn't joining, it's the opposite. It's decomposing a template literal into the constituent parts that will *later* be joined at runtime.

### Recommendation

I'd go with **`s`** — it's the counterpart to `builtIns.join`. The mental model:
- `s` = **s**plit a template into parts (authoring time)
- `builtIns.join` = join those parts back into a string (runtime)

They're inverses. And `s` is one character — minimal noise in the code.

```ts
import { paths, s } from 'assign-gingerly/paths.js';

const $ = paths<Person>();

export default {
    '?.textContent =>': {
        do: 'builtIns.join',
        resolve: {
            value: s`${$.lastName}, ${$.firstName}`
        }
    }
};
```

What feels right to you?

## Human Response III

What do you think of 'sp' for '**s**plit into **p**arts'?

---

## Response to Human Response III

`sp` works well. Two characters, mnemonic ("split into parts"), doesn't collide with anything common, and reads cleanly:

```ts
import { paths, sp } from 'assign-gingerly/paths.js';

const $ = paths<Person>();

export default {
    '?.textContent =>': {
        do: 'builtIns.join',
        resolve: {
            value: sp`${$.lastName}, ${$.firstName}`
        }
    }
};
```

It's distinctive enough that you won't confuse it with other things, short enough to not add noise, and the mnemonic is immediately guessable once someone tells you. I like it.

Let's go with `sp`. I'll implement `paths.ts` / `paths.js` now with:
- `paths<T>()` — typed proxy factory
- `sp` — tagged template that interleaves static strings with auto-extracted path strings
