# Support for Property Forwarding

---

## Human ask

I think it would be useful to provide a utility that could very well stand on its own, but nevertheless is so small and is so helpful to this package that it makes sense to include.

The tentative name is installForwarding (in a separate module installForwarding.js) that would take a class (or function prototype that can called with "new ") as its argument:

```JavaScript
class ClubMember{
    static propLinks = {
        'command': 'behaviors.commandBehavior.command',
        'commandForElement': 'behaviors.commandBehavior.commandForElement'
    };
}
installForwarding(ClubMember, /* optional */ assignGingerlyOptions);
```

This would add properties to the ClubMember prototype dynamically, for example:

```JavaScript
Object.defineProperty(ClubMember.prototype, 'command', {
    get() {
        return this?.behaviors?.commandBehavior?.command;
    },
    set(value) {
        assignGingerly(this, {
            'this?.behaviors?.commandBehavior?.command': value
        }, assignGingerlyOptions)
    },
    enumerable: true,
    configurable: true  // configurable so it doesn't conflict with future overrides
});
```


---

## Kiro's Comments

Clean and minimal. A few observations:

### 1. The getter path syntax

The getter uses optional chaining (`this?.behaviors?.commandBehavior?.command`), which is safe — returns `undefined` if any segment is missing. Good for the case where the feature hasn't been spawned yet.

But the setter uses `assignGingerly` with a path string. Looking at the example:

```javascript
assignGingerly(this, {
    'this?.behaviors?.commandBehavior?.command': value
})
```

That path shouldn't start with `this` — assignGingerly paths start with `?.` and are relative to the target (which is already `this`). It should be:

```javascript
assignGingerly(this, {
    '?.behaviors?.commandBehavior?.command': value
}, assignGingerlyOptions)
```

This is elegant — the setter leverages assignGingerly's existing nested path assignment, which creates intermediate objects if needed and handles the full path resolution. It also means the setter benefits from `withMethods`, `aka`, etc. if those are passed in the options.

### 2. Why `assignGingerly` in the setter (not just direct assignment)?

Direct assignment would be:
```javascript
set(value) { this.behaviors.commandBehavior.command = value; }
```

But this throws if `behaviors` or `commandBehavior` doesn't exist yet. Using `assignGingerly` with the `?.` path ensures intermediate objects are created (or the feature getter is triggered). This is the right call — it makes the setter resilient to ordering issues.

### 3. The `static propLinks` convention

Using a static property on the class is clean. `installForwarding` reads it and installs the getters/setters. The developer declares intent, the utility does the wiring.

One question: should `installForwarding` validate that the forwarded property names don't already exist on the prototype? I'd say yes — throw if a property with that name already has a descriptor. Same pattern as `assignFeatures`.

### 4. The getter — should it also use assignGingerly?

The getter currently uses optional chaining directly. This is fine and fast. But it means the getter doesn't benefit from `aka` aliases or method resolution. For a getter (which just reads), this is probably fine — you don't typically need method calls or aliases when reading a value.

### 5. Interaction with async features

If `behaviors.commandBehavior` is an async feature, the getter returns the placeholder's property (or `undefined` if the placeholder doesn't have it yet). The setter via `assignGingerly` would merge into the placeholder. When the real instance replaces the placeholder, the forwarded getter naturally reads from the real instance on next access. This works correctly without any special handling.

### 6. Should the getter use a compiled path for performance?

Optional chaining (`this?.behaviors?.commandBehavior?.command`) is already fast in modern engines. But if you're concerned about repeated path parsing, the getter could pre-split the path at `installForwarding` time and walk it manually:

```javascript
// Pre-compiled at install time:
const segments = ['behaviors', 'commandBehavior', 'command'];

get() {
    let current = this;
    for (const seg of segments) {
        current = current?.[seg];
        if (current == null) return undefined;
    }
    return current;
}
```

This avoids re-parsing the string on every access. But honestly, optional chaining is likely just as fast (V8 optimizes it well). I'd keep it simple with optional chaining unless profiling shows a bottleneck.

Actually — wait. The getter can't use literal optional chaining because the path is dynamic (comes from `propLinks`). It would need to be the loop form above. The example in the proposal shows literal `this?.behaviors?.commandBehavior?.command` but that's illustrative — the actual implementation would need to walk the path dynamically since it's a string.

### 7. Implementation sketch

```javascript
export function installForwarding(ctr, assignGingerlyOptions) {
    const propLinks = ctr.propLinks;
    if (!propLinks) return;

    for (const [propName, path] of Object.entries(propLinks)) {
        // Validate: don't overwrite existing properties
        if (Object.getOwnPropertyDescriptor(ctr.prototype, propName)) {
            throw new Error(
                `installForwarding: "${propName}" already exists on ${ctr.name || 'constructor'}.prototype`
            );
        }

        // Pre-split the path for the getter
        const segments = path.split('.');

        Object.defineProperty(ctr.prototype, propName, {
            get() {
                let current = this;
                for (const seg of segments) {
                    current = current?.[seg];
                    if (current == null) return undefined;
                }
                return current;
            },
            set(value) {
                assignGingerly(this, {
                    ['?.' + segments.join('?.')]: value
                }, assignGingerlyOptions);
            },
            enumerable: true,
            configurable: true
        });
    }
}
```

The setter converts `'behaviors.commandBehavior.command'` to `'?.behaviors?.commandBehavior?.command'` for assignGingerly.

### 8. One concern: circular triggering

If `behaviors` is itself a feature with a lazy getter, accessing `this.behaviors` in the forwarded getter triggers the feature spawn. That's intentional and correct. But if the feature's constructor tries to read a forwarded property during construction (before it's stored), you could get infinite recursion:

```
el.command (forwarded getter)
  → this.behaviors (feature getter, spawns PropertyBag)
    → PropertyBag constructor reads this.command (forwarded getter)
      → this.behaviors (feature getter... already spawning? or returns placeholder?)
```

This shouldn't happen in practice because the feature storage check (`storage.has(key)`) would return the in-progress placeholder. But worth keeping in mind during testing.

### Summary

The proposal is solid and minimal. Ready to implement with:
- Dynamic path walking in the getter (pre-split segments)
- `assignGingerly` with `?.` path in the setter
- Validation that forwarded props don't collide with existing prototype properties
- Separate module (`installForwarding.js`)

---

## Human response I

First I would like to revise my proposal, it occurred to me right after hitting "enter", taking into account a little bit of your feedback:

```JavaScript
import {resolveValues} from './resolveValues.js;
Object.defineProperty(ClubMember.prototype, 'command', {
    get() {
        const resolved = resolveValues(this, {
            value: '?.behaviors?.commandBehavior?.command'
        }, assignGingerlyOptions)
        return resolved.value;
    },
    set(value) {
        assignGingerly(this, {
            '?.behaviors?.commandBehavior?.command': value
        }, assignGingerlyOptions)
    },
    enumerable: true,
    configurable: true  // configurable so it doesn't conflict with future overrides
});
```

> One question: should `installForwarding` validate that the forwarded property names don't already exist on the prototype? I'd say yes — throw if a property with that name already has a descriptor. Same pattern as `assignFeatures`.

I agree.

>  Should the getter use a compiled path for performance?

This is a great question.  Please check if resolveValues and assignGingerly cache the parsed string, and consider adding caching if it doesn't.


---

## Kiro's Response I

### On using `resolveValues` for the getter

Good revision. Using `resolveValues` in the getter is consistent with the library's existing path resolution — it handles `withMethods`, `aka`, and optional-chaining semantics. The getter becomes:

```javascript
get() {
    const resolved = resolveValues({ value: '?.behaviors?.commandBehavior?.command' }, this, assignGingerlyOptions);
    return resolved.value;
}
```

This is clean and reuses existing infrastructure. The only overhead vs raw property access is the path parsing and object allocation (`{ value: ... }` pattern object + result object). For a getter that may be called frequently, this is worth considering — which leads to your caching question.

### On path caching

**Neither `resolveValues` nor `assignGingerly` currently cache parsed paths.** Both call `.split('?.')` on every invocation. For `assignGingerly` this is typically fine — you call it once to merge a batch of properties. But for a forwarded getter that's called on every property access, re-splitting the same string every time is wasteful.

**Options for caching:**

**(A) Cache at the `installForwarding` level (simplest, no library changes):**

Pre-split the path at install time and use `navigatePath` directly (or a local equivalent):

```javascript
// At install time:
const parts = path.split('?.').filter(p => p.length > 0);

// In the getter:
get() {
    let current = this;
    for (const seg of parts) {
        current = current?.[seg];
        if (current == null) return undefined;
    }
    return current;
}
```

This avoids `resolveValues` overhead entirely for the getter. The setter still uses `assignGingerly` (which is called less frequently and benefits from its full feature set).

**(B) Add a path cache to `resolveValues` and `assignGingerly` (broader benefit):**

A module-level `Map<string, string[]>` that caches `path → split parts`:

```javascript
const pathCache = new Map();
function parsePath(path) {
    let parts = pathCache.get(path);
    if (!parts) {
        parts = path.split('?.').filter(p => p.length > 0);
        pathCache.set(path, parts);
    }
    return parts;
}
```

This benefits all callers, not just forwarding. The cache grows unboundedly but path strings are typically few and small (no memory concern in practice).

**My recommendation:** Do both.

1. For `installForwarding`: pre-split at install time for the getter (option A). This is the hot path and should be as fast as possible.
2. For the setter: use `assignGingerly` as-is (it's called less frequently).
3. Separately (can be a follow-up): add path caching to `parsePath` in `assignGingerly.ts` and to `resolveValues.ts` for general benefit. This is a small optimization that helps all path-based operations.

### Revised implementation plan

```javascript
export function installForwarding(ctr, assignGingerlyOptions) {
    const propLinks = ctr.propLinks;
    if (!propLinks) return;

    for (const [propName, path] of Object.entries(propLinks)) {
        if (Object.getOwnPropertyDescriptor(ctr.prototype, propName)) {
            throw new Error(
                `installForwarding: "${propName}" already exists on ${ctr.name}.prototype`
            );
        }

        // Pre-split for the getter (hot path)
        const segments = path.split('.'); // dot-separated in propLinks
        // Build the assignGingerly path for the setter
        const agPath = '?.' + segments.join('?.');

        Object.defineProperty(ctr.prototype, propName, {
            get() {
                let current = this;
                for (const seg of segments) {
                    current = current?.[seg];
                    if (current == null) return undefined;
                }
                return current;
            },
            set(value) {
                assignGingerly(this, { [agPath]: value }, assignGingerlyOptions);
            },
            enumerable: true,
            configurable: true
        });
    }
}
```

The getter is a tight loop with no allocations. The setter delegates to `assignGingerly` for its full path-creation and method-call capabilities.

Shall I implement?

---

## Human response II

I would like to overrule you and insist that the getter use resolveValues, because of the power it provides.  Maybe later (or now?) we can break down the resolveValues to a separatie function within that module "resolveValue", so we don't have to create an object, and then pull the value.

It means we should do this:

**(B) Add a path cache to `resolveValues` and `assignGingerly` (broader benefit):**

--

## Human response III

I'm so sorry, but while you were implementing this, I was thinking about it, and I realized I wasn't thinking things through.  In order to leverage the full power of assignGingerly and resolveValue without any impedence mismatch, I need to impose a higher burden on the developer to use ?. paths:


```JavaScript
class ClubMember{
    static propLinks = {
        'command': '?.behaviors?.commandBehavior?.command',
        'commandForElement': '?.behaviors?.commandBehavior.commandForElement'
    };
}
installForwarding(ClubMember, /* optional */ assignGingerlyOptions);
```

This way the developer can insert methods, refer to class query selectors, using common notation.


---

## Kiro's Response III

No changes needed — the implementation I already wrote matches your revised requirement exactly. The `propLinks` values are `?.`-delimited paths, the getter uses `resolveValue` (with path caching), and the setter passes the path directly to `assignGingerly`. This gives full access to `withMethods`, `aka`, and all other assignGingerly/resolveValue capabilities through the optional `options` parameter.

Already implemented and compiling cleanly. Tests pass.
