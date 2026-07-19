# Alias the built in handler names

It would be nice to optionally allow for more concise alternative names for built in handlers, including single character emoji's:

```JS
assignFrom(myDomElement, {
    '?.querySelector?..mainView =>': [
        {
            do: '🎚️',
            get:{
                lhs: '?.lhs',
                rhs: '?.rhs',
                instantiate: 'globalThis://happyMood',
            }
        },
        {
            do: '🎚️',
            get:{
                lhs: '?.lhs',
                op: '!==',
                rhs: '?.rhs',
                instantiate: 'globalThis://sadMood',
            }
        }
    ]
}, {
    withMethods: ['querySelector'],
    from: myVM,
    aka: {'🎚️': 'builtIns.lazyLoadSwitch'}
})
```

One way to do this would be to overload the "aka" setting.  Would that be too confusing?

---

## AI Response

### Would overloading `aka` be confusing?

Slightly, but I think it's manageable. Here's the tension:

**Current `aka` semantics:** Substitutes path *segments* between `?.` delimiters. It operates on string tokens in LHS/RHS paths. The mental model is "alias for a property/method name."

**Proposed new use:** Substitutes `do` values in handler configs. It operates on a completely different thing — a handler registry lookup key, not a path segment.

These are different domains. A developer reading `aka: { '🎚️': 'builtIns.lazyLoadSwitch' }` might wonder: "will this also substitute `🎚️` if it appears as a path segment?" And the answer would be... maybe? That ambiguity is the confusion risk.

### Better alternative: `handlerAliases` (or just use `handlers`)

You already have the `handlers` option for exactly this purpose — mapping short names to handler implementations:

```JS
handlers: {
    '🎚️': 'builtIns.lazyLoadSwitch',    // string → built-in lookup
    '📋': 'builtIns.manageTemplateList',
    '🔗': 'builtIns.join',
}
```

Wait — does `handlers` already support this? Let me check... Currently `handlers` maps names to either class constructors or import path strings. Mapping to another built-in name string (`'builtIns.lazyLoadSwitch'`) would need a small addition: if the value is a string starting with `builtIns.`, treat it as a built-in alias rather than an import path.

**This is the cleanest approach** because:
1. `handlers` is already "where you configure handler lookup" — it's the right place
2. No semantic overload of `aka`
3. The implementation is a 3-line check in `processHandlerCommands`: if `handlers[doValue]` is a string starting with `builtIns.`, redirect to the built-in loader

### If you still want `aka` to work

It *could* work cleanly if you define it as: "`aka` substitutions apply to any string value that matches a complete token — path segments, handler names, protocol keys, etc." That's a broader definition but still coherent: "aka is a universal name-shortening mechanism."

The implementation would be: in `processHandlerCommands`, before looking up the handler by `do` value, check if `options.aka[doValue]` exists and substitute.

### My recommendation

**Use `handlers` for this.** It's already the "handler name → implementation" registry. Just extend it to accept built-in names as values:

```JS
assignFrom(myDomElement, {
    '?.querySelector?..mainView =>': [
        { do: '🎚️', get: { lhs: '?.lhs', rhs: '?.rhs', instantiate: 'globalThis://happyMood' } },
        { do: '🎚️', get: { lhs: '?.lhs', op: '!==', rhs: '?.rhs', instantiate: 'globalThis://sadMood' } },
    ]
}, {
    withMethods: ['querySelector'],
    from: myVM,
    handlers: {
        '🎚️': 'builtIns.lazyLoadSwitch',
        '📋': 'builtIns.manageTemplateList',
    }
})
```

**Why this is better:**
- Zero new options to learn
- `handlers` already exists and already maps names → implementations
- Clear separation: `aka` is for path aliases, `handlers` is for handler aliases
- Implementation cost: ~3 lines (check if handler value starts with `builtIns.`, if so redirect to built-in loader)

### Standard emoji mapping (optional future DX)

If you like the emoji idea for built-ins, you could publish a predefined map:

```JS
import { builtInEmoji } from 'assign-gingerly/handlers.js';
// { '🎚️': 'builtIns.lazyLoadSwitch', '📋': 'builtIns.manageTemplateList', '🔗': 'builtIns.join', ... }

assignFrom(target, pattern, { handlers: builtInEmoji, ... });
```

But that's a nice-to-have, not a core feature.

---

## Human Response

Good idea.  Please implement and provide the builtInEmoji as well while we're at it.  Please also briefly update the README.md with this feature.

---

## AI Response II

Done. Implemented handler aliasing via the `handlers` option + `builtInEmoji` export.

**Changes:**
- `processHandlerCommands.ts` / `.js` — `resolveFromHandlers` now checks if a string entry starts with `builtIns.` and redirects to `loadBuiltIn` (3 lines added)
- `builtInEmoji.ts` / `.js` — new module exporting the predefined emoji map
- `package.json` — added `./builtInEmoji.js` export
- `README.md` — documented handler aliases with emoji example

**Emoji map:**

| Emoji | Handler |
|-------|---------|
| 📦 | builtIns.lazyLoad |
| 🎚️ | builtIns.lazyLoadSwitch |
| 🔗 | builtIns.join |
| 🏷️ | builtIns.microDataJoin |
| 📋 | builtIns.manageTemplateList |

**Usage:**
```JS
import { builtInEmoji } from 'assign-gingerly/builtInEmoji.js';
assignFrom(target, { '?.el =>': { do: '🔗', get: { value: [...] } } }, { from: vm, handlers: builtInEmoji });
```

Custom aliases also work: `handlers: { 'sw': 'builtIns.lazyLoadSwitch' }`