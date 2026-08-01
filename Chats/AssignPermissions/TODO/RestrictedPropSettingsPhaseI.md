# Restricted Prop Settings Phase I

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
    customSettings{
        sanitizerOptions: {...},
    },
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

Please focus on any issues I didn't address with Phase I for the remainder of this chat.  My sense is that some of the dilemmas above may be addressed by later phases.

> **What "set" means**: block when the final assigned property matches — plain keys, nested last segments, and all command forms (`src +=`, `innerHTML Y=`, `hidden =!`). I'd check only the final key, not middle path segments (a blocked name in the middle isn't being set).

Sounds good.

> 2. **Deletes**: recommend `-=` is *not* blocked. Deleting an own `innerHTML` data property just re-exposes the prototype setter — low risk, and `blockedProps` reads as "cannot be set."

That's a tough call.  I'm concerned about percolation of exception logic.  If this means simply "don't put some new code in this location" I think I'm swayed to go along with your recommendation.  If it means "add an additional logical check for innerHTML', I'm more on the fence.

> 3.  **The method bypass — must be documented**: `blockedProps: ['src']` stops `target.src = ...` but not `?.setAttribute` with `['src', url]` via `withMethods`, and not `src` set through an event-handler or `assignTo` protocol path. This is a property-assignment guard, not a DOM-effect guard. Fine for the stated purpose, but the README/JSDoc should say so plainly, or users will treat it as a sanitizer.

So addressing setAttribute will come in a later phase as described above.  I'm hoping that the permissions check will get applied recursively and thoroughly, as far and as deeply nested as any of the code we support goes, including assignFrom handlers and += event binding.

>  **Matching**.  Yes, case sensitive when applied to JS property names.  Case insensitive will be applied in a later phase when setAttribute is addressed.

> **On block**: silently skip vs. `console.warn` vs. throw.

This is another tough call.  Let's go with your recommendation.  We may revisit as we encounter real world scenarios.

> **Defaults**: no built-in blocklist.

Correct.  I do think after all the phases are done, we will want to define a standard setting applications can use in any scenario (and there are many) where these assign* functions are invoked from less secure JSON (like HTML attributes).

> **Symbols**: registry/DI symbol keys are unaffected — `blockedProps` is string-matched, and that path is trusted-script-driven anyway.

Good insight.

---

## AI Response II

### On `-=` (delete) and the exception logic concern

Your instinct is right. The recommendation "don't block `-=`" requires **zero new code** — we simply don't add a check at the delete sites. No additional logical branch, no `if (isDeleteCommand)` escape. The block check only appears at assignment sites. So: no extra code, easier to reason about. Done.

### On the Set approach for performance

Agreed — a `Set<string>` is the right structure, O(1) lookup vs. O(n) on an array. Your naming suggestion `checkPermissions` is better than `isBlockedProp` — it's forward-looking for when multiple check types (props, methods, sanitizer) live together.

For Phase I, I'd suggest:

```TS
// Normalize once at the top-level call site
const blockedPropSet: Set<string> | undefined = permissions?.restrictedPropSettings?.length
    ? new Set(
        permissions.restrictedPropSettings
            .filter(x => typeof x === 'string')
            .map(x => x as string)
      )
    : undefined;
```

This extracts only the simple string entries (Phase I), ignores `{ prop, useMethod }` objects (future phases), and produces `undefined` when nothing is blocked — so every call site can cheaply bail with `if (!blockedPropSet) return;`.

Pass `blockedPropSet` alongside `permissions` everywhere it threads. No need to re-filter on every recursive call.

### On `console.warn` + what to say

For the warn message, suggest:

```
assignGingerly: property '${key}' is in restrictedPropSettings — assignment skipped.
```

One warn per blocked-key per call (not per item in a loop). Achievable by checking `if (blockedPropSet.has(key))` then warning and continuing — the Set ensures we don't do it twice for the same key if it appears in multiple patterns, since the `continue` exits after the first hit.

Actually — in a hot loop (`@each` over 1000 rows), that's 1000 warnings for the same misconfiguration. Would you accept a module-level `warned` Set that de-dupes across calls? Something like:

```TS
const warnedOnce = new Set<string>();
function warnBlocked(key: string) {
    if (!warnedOnce.has(key)) {
        warnedOnce.add(key);
        console.warn(`assignGingerly: property '${key}' is in restrictedPropSettings — assignment skipped.`);
    }
}
```

This makes it a "warn once per process lifetime per key" — clean signal, no spam. Clear decision needed before implementation.

### On recursive threading — the hard part

This is the most labor-intensive piece. The sites where `permissions` currently drops:

| File | Location | Notes |
|------|----------|-------|
| `assignGingerly.ts` | readonly-merge recursions (`assignGingerly(currentValue, value, options)`) | ~3 sites |
| `assignGingerly.ts` | `applyToEach` — takes `options` but not `permissions` as a param | Need to add `permissions` to its signature |
| `eachTime.ts` | Calls `handleEachTime` → eventually calls `assignGingerly` | Need to thread through |
| `assignFrom.ts` | Four `assignGingerly(...)` calls | Add `permissions` arg |
| `assignFromAsync.ts` | Same | Same |
| `assignTentatively.ts` | No `permissions` parameter at all | New 4th param, thread through recursion |
| `handlers/addEventListener.ts` | Inner `assignGingerly`/`assignFrom` calls | Thread `inheritedOptions` or a separate permissions param |

**Biggest threading gap**: `processHandlerCommands.ts` — the event handler dispatch calls `assignFrom(dest, pattern, { from: source, ... })` inside the event callback, assembled from `inheritedOptions`. For handlers invoked via `=>` and `+=` event binding, `permissions` needs to be part of what flows through. This is the "as far and as deeply nested as the code goes" requirement.

### On `AssignPermissions` location

Currently in `isAllowedImportPath.ts`. Per `AGENTS.md` (and your types steering rule), it should move to `types/assign-gingerly/types.d.ts`. Worth doing as part of this change — it's a small move but brings it in line.

### Phase I type shape

```TS
export interface AssignPermissions {
    /** Allow imports from cross-domain URLs (default: false) */
    crossDomainImports?: boolean;

    /**
     * Restricted property settings.
     * Phase I: string entries are property names that cannot be assigned.
     * Phase II+: object entries add useMethod/attr/sanitizer support.
     * 
     * NOTE: This is a property-assignment guard only. Method calls (setAttribute, etc.)
     * and event-handler assignments are not blocked by this setting — see Phase III+.
     */
    restrictedPropSettings?: Array<string | RestrictedPropSetting | RestrictedMethodSetting>;

    /** Sanitizer options (Phase III+) */
    sanitizerOptions?: Record<string, any>;

    /** Restricted method settings (Phase IV+) */
    restrictedMethodSettings?: Array<string | RestrictedMethodConfig>;
}

// Forward-declare Phase II+ shapes so the hooks are there
export interface RestrictedPropSetting {
    prop: string;
    useMethod?: string;         // Phase II
    attr?: string;              // Phase III
    allowFromSameHost?: boolean; // Phase III
    allowCrossDomain?: boolean;  // Phase III
}

export interface RestrictedMethodConfig {
    method: string;
    addArgs?: string[];         // Phase V
}
```

### Summary of open decisions

| Decision | My recommendation |
|----------|------------------|
| Warn dedup | Module-level `warnedOnce` Set — one warn per key per process |
| `-=` | Not blocked — no code added at delete sites |
| `AssignPermissions` location | Move to `types.d.ts` as part of this change |
| Phase I Set normalization | Filter `typeof x === 'string'` entries only |
| `blockedPropSet` threading | Pass as a separate argument alongside `permissions` throughout |

Resolve the warn-dedup question and I'm ready to implement Phase I.

---

## Human Response II

> Module-level `warnedOnce` Set — one warn per key per process

All recommendations sound good.  I prefer the name "restrictedPropSet' vs blockedPropSet, though I doubt this will affect the end user, but I think it would be clearer as we move forward.

Please implement.

## Implementation Notes

Let me implement Phase I directly. I'll work through it systematically.

Now I have a clear picture. Let me implement Phase I step by step.

**Step 1: Update `types.d.ts` with the new interface shapes**

Step 2: move `AssignPermissions` from `isAllowedImportPath.ts` to `types.d.ts` (already done above), update `isAllowedImportPath.ts` to import it from types, and add the `restrictedPropSet` normalization + `warnedOnce` dedup helper.

Now add the `restrictedPropSet` normalization helper and `warnedOnce` dedup to `isAllowedImportPath.ts` — this is the natural home since it's already the permissions utility module:

Now update the JS file:

---

## Human Prodding I On Too Busy Error

Just so you know, it seems traffic is high.  I have the typescript compiler running, so no need to work on generating/updating the js files, only the ts, hopefully that helps a little.  isAllowedImportPath.js created by the tsc compiler

---

## AI Implementation Notes, continued...



Step 3: wire `checkRestrictedProp` into `assignGingerly.ts` at all assignment sites, add `permissions` threading to `applyToEach`, and add `buildRestrictedPropSet` at the entry point.

Now add `permissions` to `applyToEach` and thread `restrictedPropSet` through it:

Now find and update the recursive `applyToEach` call inside itself:

---

## Human Prodding II On Too Busy Error

Making progress.  Any more edits to assignGingerly.ts remaining?

---

## AI Implementation Notes, continued...

Yes — several more. Let me find all the remaining assignment sites and threading gaps:

Now I need to:

1. Add `buildRestrictedPropSet` call at the start of the main `assignGingerly` function
2. Add `checkRestrictedProp` at each assignment site
3. Thread `permissions` to the second `applyToEach` call (line 1030)
4. Thread `permissions` to recursive `assignGingerly` calls (the readonly-merge recursions)

Let me read the main function entry to add the normalization:

Now add the checks at the `+=` sites (lhsParent and target[path]):

---

## Human Prodding III On Too Busy Error

Did you finish adding checks at the += sites?

---

## AI Implementation Notes, continued...

Not yet — let me add the checks now. I need to add `checkRestrictedProp` before each assignment block:

Now the toggle `=!`, delete (skip), Y= merge, and the main nested/plain assignment blocks. Let me find and update those:

Now the Y= merge command — it recursively calls `assignGingerly`, and the final assignment is done by the recursive call, so I need to check the key before merging:

---

## Human Prodding IV On Too Busy Error

You were Finding the Y= merge command assignment sites....?

## AI Implementation Notes, continued...

The Y= merge recursively calls `assignGingerly(mergeTarget, value, options, permissions)` — the `permissions` already threads through, so the checks will fire inside the recursive call. No check needed at the Y= level itself (the path is the container, not the property being set). The individual property assignments inside the merge will be checked.

Now the main nested path and plain key assignment sites (lines ~1127-1160). Let me read and fix those:

Now I'll add the checks at all four remaining assignment blocks. I'll add `checkRestrictedProp` just before `tryAssignTo` at each site, since the key/lastKey is known at that point:

**Site 1 & 2: nested path with/without withMethods**

**Site 3: non-nested plain key**

Now fix the `applyToEach` assignment sites inside `applyToEach` itself, and thread `permissions` to its outer call (line 1030):


---

## Human Prodding V On Too Busy Error

Looks like you finished editing applyToEach?

---

## AI Implementation Notes, continued...

Not quite — I also need to add the `checkRestrictedProp` check inside `applyToEach` itself at its assignment sites (the `parent[lastKey] = value` lines). Let me find and fix those:

The `permissions` is available in `applyToEach` but there's no `restrictedPropSet` yet — I need to build it from `permissions` inside `applyToEach` (since it's a helper that can be called without going through the main function entry). Actually, it's cleaner to pass the already-built `restrictedPropSet` as a parameter instead of rebuilding it:

Now add the check at the assignment sites inside `applyToEach` and thread `restrictedPropSet` to recursive calls:

Now update both `applyToEach` call sites to pass `restrictedPropSet`:

---

## Human Summary

Out of free tokens with the alternative AI service.

Please resume from where things were left off above.

