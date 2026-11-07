# Resolve Array

It would be nice to support resolving an array, only inside a resolve section of a handler config.  For example:

```JavaScript
const vm = {
    lastName: 'Targaryen'
    firstName: 'Helaena'
}
assignFrom(oElement, {
    '?.textContent' : {
        do: 'join',
        resolve: {
            stringArr: ['?.lastName', ', ', '?.firstName']
        }
    }
},{

})
```

---

## Feedback / Questions

### The Idea

This makes sense. Currently `resolveValues` explicitly skips arrays — they pass through as literals. Adding resolution inside arrays (within handler `resolve` maps) would let handlers receive pre-resolved collections without needing custom resolution logic internally.

### Clarifications Needed

1. **Scope: handler `resolve` only, or also top-level `resolveValues`?**  
   You say "only inside a resolve section of a handler config." But the resolution is done by calling `resolveValues` on the `resolve` object — so the natural implementation would be to teach `resolveValues` to recurse into arrays. That would make it available everywhere `resolveValues` is used (including top-level pattern values in `assignFrom`). Is this intentional, or do you specifically want it restricted to handler configs only?
   
   My take: supporting it in `resolveValues` generally seems fine and more consistent. A top-level array RHS in `assignFrom` currently passes through to `assignGingerly` as a literal (e.g., for `setAttribute: ['data-id', '123']`). If we resolve inside arrays, that would change behavior — `['?.foo', '?.bar']` would no longer pass through as literal strings. That could be a **breaking change** for existing patterns where arrays contain `?.`-prefixed strings that aren't meant to be resolved.

2. **Mixed arrays — partial resolution?**  
   In the example, `['?.lastName', ', ', '?.firstName']` has both path strings and plain strings. The expected result is `['Targaryen', ', ', 'Helaena']` — each element resolved independently. This is straightforward. But what about:
   - Non-string elements (numbers, objects, null)? → Presumably pass through unchanged.
   - Nested arrays? → Recurse, or leave inner arrays as-is?
   - Protocol strings inside arrays (e.g., `['globalThis://config?.key', '?.name']`)? → Presumably yes, resolve those too.

3. **Does the handler example need a LHS ending in ` =>`?**  
   The example shows `'?.textContent': { do: 'join', ... }`. Currently handler configs are only recognized when the LHS ends with ` =>`. Did you mean:
   ```js
   '?.textContent =>': {
       do: 'join',
       resolve: {
           stringArr: ['?.lastName', ', ', '?.firstName']
       }
   }
   ```
   Or are you proposing that any RHS with a `do` field should trigger handler invocation regardless of the LHS suffix? That would be a separate, larger change.

4. **The `join` handler itself — is that in scope here?**  
   The requirement is about resolving arrays. The `join` handler (which would presumably call `stringArr.join('')` and assign to `lhsTarget.textContent`) is a separate handler implementation. Should that be part of this work, or is it just an illustrative example?

### Implementation Approach

The cleanest path is to add array handling in `resolveValues`:

```ts
// In resolveValues, where arrays currently pass through:
} else if (Array.isArray(value)) {
    // Resolve each element independently
    const resolvedArr = [];
    for (const item of value) {
        if (typeof item === 'string' && item.startsWith('?.')) {
            const aliased = applyAliases(item, aliasMap);
            const parts = parseCachedPath(aliased);
            resolvedArr.push(parts.length === 0 ? source : navigatePath(source, parts, withMethods));
        } else if (typeof item === 'string' && protocols && hasProtocol(item)) {
            resolvedArr.push(await resolveProtocolValue(item, protocols, options));
        } else {
            resolvedArr.push(item);
        }
    }
    result[key] = resolvedArr;
}
```

**Risk:** This would change behavior for existing callers who pass arrays as RHS values expecting them to be passed through literally. For example:
```js
assignFrom(el, {
    '?.setAttribute': ['data-id', '123']  // Currently: passes ['data-id', '123'] as-is
}, { from: source, withMethods: ['setAttribute'] });
```
This would still work fine since `'data-id'` and `'123'` don't start with `?.`. But if anyone had:
```js
{ '?.setAttribute': ['?.attrName', '?.attrValue'] }
```
...they'd get resolution where they previously got literals. That's probably the *desired* behavior, but it's technically breaking.

### Alternative: Scoped to handler resolve only

If you want to limit the blast radius, the change could live in `processHandlerCommands.ts` instead — a specialized resolution step for array values only when processing handler `resolve` maps. This avoids touching the general-purpose `resolveValues` function.

### Edge Cases

- **Empty array** — resolves to `[]` (no-op, pass through).
- **Array with all non-path strings** — no change from current behavior.
- **Array containing objects** — recurse into plain objects (already supported by `resolveValues`), or leave as-is?

---

## Human Response I

On thinking about it, I think I stand  coreected.  I think it would be good to resolve all arrays in the rhs, not just resolve sections of handlers.

> Non-string elements (numbers, objects, null)? → Presumably pass through unchanged.

Agreed.

> Nested arrays? → Recurse, or leave inner arrays as-is?

I think recurse.

Protocol strings inside arrays (e.g., `['globalThis://config?.key', '?.name']`)? → Presumably yes, resolve those too.

Agreed.

> **The `join` handler itself — is that in scope here?** 

No, just an example of why we need this.  That proposal will follow shortly.

> - **Empty array** — resolves to `[]` (no-op, pass through).

Agreed.

> - **Array with all non-path strings** — no change from current behavior.

Agreed

> - **Array containing objects** — recurse into plain objects (already supported by `resolveValues`), or leave as-is?

~~Let's not for now.  Is that easy to avoid?~~

Yes, please.

