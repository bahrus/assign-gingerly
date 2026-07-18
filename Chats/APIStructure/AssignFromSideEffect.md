# Assign From Side Effect

---

## Human Ask

In scenarios where we have very complex chains of assignments, it would be usesful if assignFrom was also added assignFrom to the object prototype.  

object-extension.ts does this for assignGingerly.  But if we added assignFrom in their, the problem is:

1.  That could be more side effects than the developer wants, and 
2.  The payload grows even if assignFrom isn't used.

So I'm thinking we have another module that does what object-extension.ts does for assignGingerly, but for assignFrom.

Two questions come to my mind, maybe there are others:

1.  What is a good name of the module?
2.  Is "assignFrom" the best name, when viewed from this context:

```JS
const from = {
    isHappy: true,
    happyMessage: 'I am happy',
    sadMessage: 'I am sad'
}
oElement.assignFrom({
    '?.textContent =>': {
        do: 'builtIns.ternary',
        get: {
            condition: '?.isHappy',
            then: '?.happyMessage',
            else: '?.sadMessage'
        }
    }
}, {from})
```

Any suggestions how to make this read better?

---

## AI Response

### 1. Module name

Following the pattern: `object-extension.ts` extends Object prototype with `assignGingerly`. The new module should follow that naming convention:

- **`assignFrom-extension.ts`** — parallel to `object-extension.ts`, names what it adds
- **`object-extension-from.ts`** — groups it with the existing extension file
- **`from-extension.ts`** — shortest, clear

I'd go with **`assignFrom-extension.ts`** (and `assignFromAsync-extension.ts` if you want the async variant too). It's the most self-documenting import:

```JS
import 'assign-gingerly/assignFrom-extension.js';
```

The reader immediately knows: "this extends something with assignFrom."

### 2. Does `assignFrom` read well as a method name?

Let's look at the call site:

```JS
oElement.assignFrom({ ... }, { from })
```

There's an awkward redundancy: *assign**From*** takes an option named *from*. It reads like "assignFrom... from." That's fine as a standalone function (`assignFrom(target, pattern, { from: vm })`) where the preposition attaches to the function semantics. But as a method on the target, the target *is* the LHS, so the question becomes: "assign from *what*?"

The method form shifts perspective. With the standalone function, you read it as "assign-from(target, pattern, source)." As a method, you read it as "target.verb(pattern, options)."

**Alternative method names:**

| Method | Read-aloud | Notes |
|--------|-----------|-------|
| `assignFrom` | "element, assign from {from}" | redundant "from" |
| `bindFrom` | "element, bind from {from}" | implies reactivity (might mislead) |
| `mapFrom` | "element, map from {from}" | evokes transformation, not assignment |
| `pullFrom` | "element, pull from {from}" | nice: "pull values from source into me" |
| `renderFrom` | "element, render from {from}" | too DOM-specific; `assignFrom` works on any object |
| `assignValues` | "element, assign values {from}" | descriptive but loses the "from" direction |
| `hydrate` | "element, hydrate {from}" | implies one-shot SSR hydration |

**My recommendation: keep `assignFrom`.**

Here's why: the redundancy with `{ from }` is only noticeable when you use the shorthand property name. In real code, the option is often more descriptive:

```JS
oElement.assignFrom({
    '?.textContent =>': {
        do: 'builtIns.ternary',
        get: {
            condition: '?.isHappy',
            then: '?.happyMessage',
            else: '?.sadMessage'
        }
    }
}, { from: viewModel, protocols: { globalThis: k => globalThis[k] } })
```

That reads fine: "element, assign from viewModel." The `from` option is just one of several options — it doesn't dominate.

If the redundancy bothers you, you could support a positional shorthand where the second argument *is* the source if it's not a plain options object:

```JS
// Full form
oElement.assignFrom(pattern, { from: vm, withMethods: [...] })

// Shorthand when no other options needed
oElement.assignFrom(pattern, vm)
```

But that adds API ambiguity. I'd just live with `{ from }` — it's explicit and consistent with the standalone function.

### 3. Implementation notes

The module would be small — just the `Object.defineProperty` call:

```TS
// assignFrom-extension.ts
import { assignFrom } from './assignFrom.js';

Object.defineProperty(Object.prototype, 'assignFrom', {
    value: function(pattern, options) {
        assignFrom(this, pattern, options);
        return this;
    },
    writable: true,
    enumerable: false,
    configurable: true,
});
```

And optionally a second one for async:

```TS
// assignFromAsync-extension.ts
import { assignFromAsync } from './assignFromAsync.js';

Object.defineProperty(Object.prototype, 'assignFromAsync', {
    value: async function(pattern, options) {
        await assignFromAsync(this, pattern, options);
        return this;
    },
    writable: true,
    enumerable: false,
    configurable: true,
});
```

**Chaining benefit:**

```JS
oElement
    .assignFrom({ '?.textContent': '?.greeting' }, { from: vm1 })
    .assignFrom({ '?.style Y=': { color: '?.themeColor' } }, { from: vm2 });
```

That's the real ergonomic win — method chaining with different sources in a fluent API.

## Human Response I

Please implement both assignFrom and assignFromAsync as your recommend.

---

## AI Response I

Done. Created four files:

**Extension modules:**
- `assignFrom-extension.ts` / `.js` — adds `assignFrom` to `Object.prototype` (sync, returns `this` for chaining)
- `assignFromAsync-extension.ts` / `.js` — adds `assignFromAsync` to `Object.prototype` (async, returns `Promise<this>`)

**Usage:**
```JS
import 'assign-gingerly/assignFrom-extension.js';
import 'assign-gingerly/assignFromAsync-extension.js';  // if async needed

// Chaining
oElement
    .assignFrom({ '?.textContent': '?.greeting' }, { from: vm1 })
    .assignFrom({ '?.style Y=': { color: '?.themeColor' } }, { from: vm2 });

// Async
await oElement.assignFromAsync({
    '?.querySelector?..mainView =>': {
        do: 'builtIns.lazyLoad',
        get: { if: '?.isVisible', instantiate: 'globalThis://myTemplate' }
    }
}, { from: vm, withMethods: ['querySelector'], protocols: { globalThis: k => globalThis[k] } });
```

**Also updated:** `package.json` exports map with both new entries.

**Tests:** 11/11 passing across Chromium, Firefox, WebKit — covering prototype presence, non-enumerability, path resolution, chaining, DOM elements, async return, and Y= merge composition.