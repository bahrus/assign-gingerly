# Restricted Prop Setting Phase I

---

## Human Ask

assignFrom supports a 4th parameter, AssignPermissions.  This should be added to assignGingerly and assignTentatively.

We should add a property, "blockedProps" that supports an array of properties that cannot be set during the assigning process.  Examples would be src, innerHTML, outerHTML.
---

## Kimi Code's Response

### Current state (partially there already)

- `AssignPermissions` (`isAllowedImportPath.ts:24-27`) today has only `crossDomainImports`. Side note: per `AGENTS.md`, exported interfaces belong in `types/assign-gingerly/types.d.ts` — this one already deviates; extending it in place keeps the diff small, but moving it is worth considering.
- `assignGingerly` **already has** the 4th `permissions` parameter (`assignGingerly.ts:681`) — but only threads it to `enhanceAll` and the `Y=` merge recursion. The readonly-merge recursions (`assignGingerly(currentValue, value, options)` — permissions dropped) and `applyToEach` don't pass it. So even today's `crossDomainImports` silently evaporates on those paths.
- `assignFrom` has the parameter but never forwards it into its own `assignGingerly(...)` calls (`assignFrom.ts:412, 420, 466, 504`). Same likely true for `assignFromAsync`.
- `assignTentatively` has **no** permissions parameter at all — it needs a new 4th parameter, and it has its own full set of assignment sites.

So the work is: extend the interface with `blockedProps`, then both *enforce* it and *thread it* — the threading gaps above mean enforcement at the top level alone would be leaky.

### Semantics to pin down

1. **What "set" means**: block when the final assigned property matches — plain keys, nested last segments, and all command forms (`src +=`, `innerHTML Y=`, `hidden =!`). I'd check only the final key, not middle path segments (a blocked name in the middle isn't being set).
2. **Deletes**: recommend `-=` is *not* blocked. Deleting an own `innerHTML` data property just re-exposes the prototype setter — low risk, and `blockedProps` reads as "cannot be set."
3. **The method bypass — must be documented**: `blockedProps: ['src']` stops `target.src = ...` but not `?.setAttribute` with `['src', url]` via `withMethods`, and not `src` set through an event-handler or `assignTo` protocol path. This is a property-assignment guard, not a DOM-effect guard. Fine for the stated purpose, but the README/JSDoc should say so plainly, or users will treat it as a sanitizer.
4. **Matching**: exact, case-sensitive JS property names (`innerHTML`, not `innerhtml`). Case-insensitive matching sounds friendly but invites false positives on plain objects.
5. **On block**: silently skip vs. `console.warn` vs. throw. The library's posture is silent-skip, but for a security feature a swallowed block is a debugging nightmare — I'd skip + `console.warn` (once per key per call, to avoid spam in `@each` loops). Worth an explicit decision.
6. **Defaults**: no built-in blocklist. Like `crossDomainImports`, this is opt-in by trusted script and never parsed from attributes (the interface's existing doc comment already establishes that contract).
7. **Symbols**: registry/DI symbol keys are unaffected — `blockedProps` is string-matched, and that path is trusted-script-driven anyway.

### Implementation shape

- `AssignPermissions` gains `blockedProps?: string[]`; normalize to a `Set` once per top-level call (mirroring how `withMethods` is normalized).
- A tiny `isBlockedProp(permissions, key)` helper, applied at every assignment site: in `assignGingerly` that's the `+=`/`=!`/`Y=` handlers, nested with/without `withMethods`, non-nested, `applyToEach`; plus `eachTime.ts` and the equivalent sites in `assignTentatively`. There are ~10 sites in `assignGingerly` alone — missing one is easy, which is the strongest argument for a shared helper rather than inline checks.
- Thread `permissions` through every recursive call: readonly-merge recursions in `assignGingerly`, `applyToEach`, `assignFrom`'s four `assignGingerly` calls, `assignFromAsync`'s equivalents, and `assignTentatively`'s recursion (there it's a new parameter to pass through — note its recursion builds fresh `options` objects, so a separate parameter actually threads more cleanly than adding to options).
- `assignTentatively` signature becomes `(target, source, options?, permissions?)`, matching `assignGingerly`.

### Tests to add

- Blocked plain key and nested path (`'?.innerHTML'`) are skipped; unblocked siblings still assign.
- Blocked via each command form: `src +=`, `innerHTML Y=`.
- Block survives recursion: blocked prop inside a readonly-merge and inside a `Y=` merge target.
- `assignFrom` with permissions blocks on the resolved assignment (locks in the forwarding fix).
- `assignTentatively` blocks, and a blocked assignment leaves no `reversal` entry (so reversal doesn't "restore" a value that was never set).
- `-=` on a blocked prop still works (locks in decision 2).
- Method bypass documented behavior: `setAttribute` with a blocked prop name still goes through (or whatever decision 3 lands on — just lock it in with a test).

---

## Human Response I

First, I would like to rename "blockedProps" to "restrictedPropSettings". The reason for this is hopefully clarified below. 

Second,  based on your feedback, I would like to add support for more  nuanced prop and method setting restrictions:

```JS
{
    restrictedPropSettings: [
        //Phase I
        'innerHTML' /** not allowed, don't worry about consistency with anything else **/, 
        //Phase II
        {
            prop: 'outerHTML',
            useMethod: 'replaceWithHTML',
        },
        //Phase III
        {
            prop: 'src',
            //if not specified, don't check for calls to setAttribute
            attr: 'src', //watches for setAttribute method call
            allowFromSameHost: true, //use isAllowedImportPath?  change name to more generic?
            allowCrossDomain: false, //no holds barred
        }
    ],
    sanitizerOptions: {...},
    restrictedMethodSettings: [
        //Phase IV
        'setHTMLUnsafe', //not allowed at all
        {
            //Phase V
            method: 'replaceWithHTML',
            addArgs: [
                '?.sanitizerOptions'
            ]
        }
    ]
    
}
```

>  A tiny `isBlockedProp(permissions, key)` helper, applied at every assignment site

I'm hoping that a Set object can be passed everywhere it needs to go, that lists all the values that need checking, before calling the method above, if you agree this would run a bit faster.  And I think it should be renamed to something like checkPermissions.  Maybe two Sets -- one for props, the other for methods.

I will create separate chats for everything beyond Phase I.  But please provide the needed hooks in anticipation of those phases coming next.

Please focus on any issues I didn't address with Phase I for the remainder of this chat.  My sense is that some of what was recommended above becomes dead weight in light of the coming phases.