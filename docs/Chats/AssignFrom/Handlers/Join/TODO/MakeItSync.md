# Make It Sync

## Bruce's Ask

The builtIns.join handler is proving very helpful in many cases, but I'm finding the fact that it is asynchronous  causing stability issues with rapid fire drag drop functionality.  Can you please preemptively import the module, and avoid any awaits?

## Claude's Implementation Notes

### Where the asynchrony actually lives

Tracing a `builtIns.join` invocation from `assignFrom()`, there were four separate sources of async deferral stacked on top of each other:

1. **`assignFrom.ts`** fires handler-command processing (` =>` keys) via `import('./processHandlerCommands.js').then(...)` — a fire-and-forget dynamic import, on *every* call, uncached. This is deliberate: it's how non-handler consumers avoid paying for `processHandlerCommands.js` at all (see [BuiltIns.md](../../BuiltIns.md)).
2. **`processHandlerCommands.ts`**'s `loadBuiltIn()` dynamically imports `./handlers/join.js` via `findClassPrototypeInPath` the first time `builtIns.join` is used, then caches the class — so only the *first* call pays this cost, but that first call is exactly where a rapid drag/drop burst is most likely to race.
3. Even on a cache hit, `resolveFromHandlers()` and `loadBuiltIn()` are declared `async`, so `await`-ing them costs a microtask tick regardless of whether any real work happens inside.
4. `JoinHandler.assign()` itself was declared `async`, adding one more microtask hop for what is a purely synchronous string-join.

Under rapid-fire drag/drop, each of these hops is a point where the event loop can interleave a *second* drag/drop event's mutation of `target`/`options.from` before the *first* event's join+assign has actually landed — which is the instability being reported, not any single slow operation.

### Scoping decision

Fully eliminating the deferral would mean also changing (1) — i.e. making `assignFrom.ts` statically import `processHandlerCommands.js` instead of dynamically importing it — but that changes load cost for every consumer of ` =>` handler keys, not just `builtIns.join` users. I asked Bruce to choose the scope explicitly; he chose the narrower option: fix everything *inside* `processHandlerCommands.ts`/`join.ts` (items 2–4 above), and leave `assignFrom.ts`'s outer fire-and-forget wrapper (item 1) alone.

**Consequence of this choice:** there is still one deferred boundary between a drag/drop event and the `builtIns.join` assignment landing, when going through `assignFrom()` (not `assignFromAsync()`). This narrower fix removes the *variable-latency, cache-miss-prone* hops; it does not make the whole pipeline zero-latency. If instability persists, the next step is revisiting item (1) — the "full sync path" option that was declined this round.

### Changes made

**`handlers/join.ts` / `handlers/join.js`**
- `JoinHandler.assign()` is no longer `async`; it returns the joined `string` directly instead of `Promise<string>`. No internal behavior changed — the method never awaited anything, it was just declared `async` out of habit/consistency with other handlers.

**`processHandlerCommands.ts` / `processHandlerCommands.js`**
- Added a static top-level `import { JoinHandler } from './handlers/join.js'` and pre-seeded `handlerCache` with `'builtIns.join' → JoinHandler` at module scope. This means `loadBuiltIn('builtIns.join')` never actually reaches `findClassPrototypeInPath` / dynamic `import()` — not even on the first call. (This intentionally reverses, for `join` only, the on-demand-import design agreed in [BuiltIns.md](../../BuiltIns.md); the tradeoff is that anyone who reaches `processHandlerCommands.js` at all now also loads `join.js`, whether or not they use it.)
- Added an `isThenable()` helper and changed the handler-invocation line from `await handler.assign(...)` to:
  ```ts
  const maybeResult = handler.assign(lhsTarget, resolvedParams, options, permissionProcessor);
  const result = isThenable(maybeResult) ? await maybeResult : maybeResult;
  ```
  so a synchronous handler (now including `JoinHandler`) never costs a microtask tick here, while handlers that genuinely need to stay async (`lazyLoad`, `manageTemplateList`, etc.) are unaffected.
- The `options.handlers` override lookup now only calls (and awaits) `resolveFromHandlers()` when `config.do` actually exists in `options.handlers`, instead of unconditionally awaiting an async function that, in the common case, just returns `undefined` synchronously.
- The built-in lookup checks `handlerCache.get(config.do)` directly before falling back to `await loadBuiltIn(config.do)`, so a cache hit (which `builtIns.join` always is now) never awaits.

None of this touches `AssignFromHandler`'s declared return type (`Promise<void> | void`) in the `types` submodule — TypeScript's void-return compatibility already allows a plain synchronous return there, so no type changes were needed.

### Remaining lever for the caller

`processHandlerCommands` still `await`s `resolveValues(config.resolve, ...)` when a handler config uses `resolve:` — that step is inherently async (it supports async protocols). If a `join` config only needs plain property paths, using `get:` instead of `resolve:` makes the *entire* per-config loop run without a single `await`, given the changes above. Verified with a Node script:

```js
await processHandlerCommands(target, ['?.textContent =>'], {
  '?.textContent =>': {
    do: 'builtIns.join',
    get: { value: ['?.lastName', ', ', '?.firstName'] }   // get:, not resolve:
  }
}, { from: vm });
```

produced the correct joined string, including the nested-array all-or-nothing semantics, with none of the trimmed awaits re-triggered.

## Bruce's Response I

I'm thinking that maybe we should maybe roll these changes back (I haven't committed anything yet) and instead:

1.  Remove the join handler (please don't incur technical debt by worrying about backwards compatibility)
2.  Define another command operator for join:

Instead of:

```JSON
"assign": {
    "onProgress": {
        "?.shadowRoot?.querySelector?.#drawer?.style?.transition": "none",
        "?.shadowRoot?.querySelector?.#drawer?.style?.width =>": {
            "do": "builtIns.join",
            "get": {
                "value": [
                    "calc(var(--drawer-width) - ",
                    "?.progressState?.deltaPx",
                    "px)"
                ]
            }
        }
    },
    "onCommit": {
        "?.open": false,
        "?.shadowRoot?.querySelector?.#drawer?.style?.width =>": {
            "do": "builtIns.join",
            "get": {
                "value": [
                    ""
                ]
            }
        },
        "?.shadowRoot?.querySelector?.#drawer?.style?.transition": ""
    },
    "onCancel": {
        "?.shadowRoot?.querySelector?.#drawer?.style?.width =>": {
            "do": "builtIns.join",
            "get": {
                "value": [
                    ""
                ]
            }
        },
        "?.shadowRoot?.querySelector?.#drawer?.style?.transition": ""
    }
},
"assignOptions": {
    "withMethods": [
        "querySelector"
    ]
}
```

```JSON
"assign": {
    "onProgress": {
        "?.shadowRoot?.querySelector?.#drawer?.style?.transition": "none",
        "?.shadowRoot?.querySelector?.#drawer?.style?.width =&": {
            "join": [
                "calc(var(--drawer-width) - ",
                "?.progressState?.deltaPx",
                "px)"
            ]
        }
    },
    "onCommit": {
        "?.open": false,
        "?.shadowRoot?.querySelector?.#drawer?.style?.width =&": {
            "join": [
                ""
            ]
        },
        "?.shadowRoot?.querySelector?.#drawer?.style?.transition": ""
    },
    "onCancel": {
        "?.shadowRoot?.querySelector?.#drawer?.style?.width =&": {

                "join": [
                    ""
                ]
            }
        },
        "?.shadowRoot?.querySelector?.#drawer?.style?.transition": ""
    }
},
"assignOptions": {
    "withMethods": [
        "querySelector"
    ]
}
```

I'm totally open to better suggestions as far as syntax.

What are your thoughts?

## Claude's Response I

I think this is the right call, and better than the patch I made. Rather than recap it — I'd rather point at the proof it already works.

### There's already a precedent for exactly this: ` ?=`

`assignFrom.ts` already has a fully synchronous, non-`=>` operator: the ` ?=` ternary command. `evaluateTernary` is defined right there in `assignFrom.ts`, `categorizeKeys` buckets ` ?=` keys into `ternaryKeys` separately from `handlerKeys`, and `assignFrom()` processes them inline — no dynamic import, no fire-and-forget, no `AssignFromHandler` class, no `handlerCache`. It just runs, synchronously, in the same call stack as everything else.

That's the whole fix. The instability wasn't really "join is async" — it's that `join` was implemented as an `AssignFromHandler`, which forces it through the ` =>` pipeline, which is *deliberately* async (dynamic-imported, fire-and-forget) because most things behind ` =>` — `lazyLoad`, `manageTemplateList`, `rangeSelector` — genuinely need to be. `join` never belonged there; it has no side effects and nothing to await. Giving it its own operator, modeled on ` ?=`, means sync-only computed-value operations get a pipeline that's synchronous *by construction*, instead of one that's async by construction and then aggressively trimmed. My patch was closing the gap probabilistically; this closes it structurally. I'd rather revert my patch than keep it once ` =&` exists — happy to do that now, or once we've nailed down the shape below, whichever you'd rather.

### Open questions before I build it

**1. Op registry, not a one-off.** I'd design ` =&` as a small registry of pure sync functions (`{ join: (args, from, options) => string, ... }`) rather than hardwiring it to `join` alone — same shape as `BUILT_IN_MAP`, just synchronous and statically imported (no dynamic loading at all, which is the point). Costs nothing extra now, and the next sync-only op doesn't need a new operator invented for it. Agree, or is `join` meant to stay the only tenant of ` =&`?

**2. RHS shape — how does `join` take a separator?** Your example is `{ "join": [...] }` — clean, but where does `separator` go? Two options:
   - Sibling key: `{ "join": [...], "separator": ", " }`
   - Nested: `{ "join": { value: [...], separator: ", " } }`
   
   I'd lean toward the sibling-key form — it keeps the common case (`join` with no separator) as terse as your example, and generalizes: any op's extra config just sits next to the op-name key. But it does mean the op dispatcher has to pull `opName` out of the object by "whichever key isn't a known config key," which is slightly fuzzier than `do:` was. Open to your read on this.

**3. Reuse the LHS path-walking logic instead of duplicating it.** The `?.shadowRoot?.querySelector?.#drawer?.style?.width` → `lhsParent`/`lhsKey` resolution (with `withMethods` support) currently lives inside `processHandlerCommands.ts`, ~50 lines. ` =&` needs the identical logic (same LHS syntax, same `withMethods` need, per your example). I'd extract it into a shared helper (e.g. `resolveLhsPath()` in `assignFrom.ts` or a new small util) used by both ` =>` and ` =&`, rather than copy-pasting it. Flagging so it's not a surprise that this touches `processHandlerCommands.ts` too, even though ` =&` itself lives in `assignFrom.ts`.

**4. `options.protocols` can be async — sync ops need to guard against that.** `getValues` (the sync resolver ` ?=` already uses) accepts `options.protocols`, and `AssignFromOptions.protocols` is typed as `(key: string) => any | Promise<any>` — a protocol is technically allowed to return a Promise even on the sync path today. If a `join` arg resolves through such a protocol, `getValues` would hand back a live Promise object and `join` would silently stringify it as `"[object Promise]"` instead of erroring. I'd add a check in the sync-op dispatcher — if any resolved arg is thenable, throw (`"builtIn sync op 'join' received an async value from options.protocols — use ' =>' with 'resolve:' instead"`) rather than let it silently produce garbage. Worth doing regardless of who ends up shipping it first.

**5. What survives from the current `join.ts`.** I'd delete `JoinHandler` (the class, the `AssignFromHandler` wiring, its `BUILT_IN_MAP` entry) entirely per your no-backwards-compat instruction, but keep the actual joining logic — the nested-array "all-or-nothing" flattening — as a plain exported function, reused by the new op. That behavior (an optional segment silently dropped if any element is nullish) seemed genuinely useful and unrelated to the class-vs-function question. Keep it, or was that itself something you want to reconsider while we're in here?

**6. `=&` as the token.** No collisions — the existing suffix vocabulary is ` =>`, ` ?=`, ` +=`, ` -=`, ` =!`, ` Y=`, none of which are `=&`. It reads fine to me (distinct shape from ` =>` and ` ?=`, and `&` has no competing meaning elsewhere in the DSL). I don't have a better suggestion; it works.

### Summary of decisions needed

1. Registry of sync ops from the start, or just `join` for now?
2. `separator` (and future per-op config) as a sibling key or nested under the op name?
3. OK to extract the LHS-path-walking logic out of `processHandlerCommands.ts` into a shared helper?
4. Add the thenable-guard for async `options.protocols` leaking into sync ops?
5. Keep the nested-array all-or-nothing semantics in the new `join` op?

Once these are settled I'll revert the current patch (`handlers/join.ts/.js`, `processHandlerCommands.ts/.js`) and build ` =&` instead.

## Bruce's Response II

1.  Registry of sync ops sounds good.
2.  Sibling just like the join handler that's goin away
3.  Sounds good.
4.  Sounds good.
5.  Yes, carry over the logic.

Please proceed and add your implementation notes below.

## Claude's Implementation Notes II

Rolled back the earlier patch first (`git checkout` on `handlers/join.ts/.js` and `processHandlerCommands.ts/.js` — nothing had been committed, so this was clean), then built ` =&` fresh.

### New files

- **`utils/resolveLhsPath.ts` / `.js`** — the `?.` path → `{ lhsTarget, lhsParent, lhsKey }` walk (with `withMethods` support) extracted verbatim out of `processHandlerCommands.ts`, where it used to be inlined. Now imported by both `processHandlerCommands.ts` (` =>`) and `assignFrom.ts` (` =&`) — question 3 from last round.
- **`syncOps/join.ts` / `.js`** — the `join` op. Carries over `processValue()` (the all-or-nothing nested-array flattening) unchanged from the old `JoinHandler` — question 5. Signature is `join(args, extra) => string`, where `extra.separator` defaults to `''`, same default as before.
- **`syncOps/registry.ts` / `.js`** — `SYNC_OPS: Record<string, SyncOp>`, currently just `{ join }`. Statically imported, not dynamically loaded — question 1. Add future sync ops here.

### `assignFrom.ts` changes

- `isSyncOpCommand` / `parseSyncOpCommand` — same shape as the existing `isTernaryCommand` / `parseTernaryCommand` pair, detecting/stripping ` =&`.
- `categorizeKeys` gained a `syncOpKeys` bucket, populated the same way `ternaryKeys` is.
- A new processing block, modeled directly on the ` ?=` ternary block right above it in `assignFrom()`:
  1. For each ` =&` key, require the RHS to be a plain config object (not an array — a sync op produces one value, there's no chaining like ` =>` supports for side-effecting handlers).
  2. Find which sibling key in that config object is a name in `SYNC_OPS` — that's how the op is identified; no `do:`/`op:` wrapper key needed, matching your sibling-key answer to question 2 (`{ join: [...], separator: '...' }`, not `{ join: { value: [...], separator: '...' } }`).
  3. Resolve the **whole config object** in one `getValues()` call — it already recurses into arrays and nested plain objects (confirmed in `resolve/getValues.ts`'s `getArray`), so `join`'s array (including nested all-or-nothing sub-arrays) and `separator` both get `?.`-path resolution for free, with no per-op resolution code needed.
  4. Run `assertNoThenable()` over the resolved config before calling the op — question 4. Recursively checks for anything with a `.then` method (arrays and plain objects only, so it doesn't chase into DOM nodes or other host objects that happen to have their own `.then`-shaped properties... actually to be precise, it just checks `typeof value.then === 'function'` on whatever it's given, then recurses into arrays/plain-object values only — it doesn't specifically avoid non-plain objects other than not descending into them). Throws a specific error naming the op and the key if it finds one, telling the caller to use ` =>`/`resolve:` instead.
  5. Call `SYNC_OPS[opName](args, extra)` — plain function call, no `await`, no `new`.
  6. If the result isn't `undefined`, resolve the LHS via the shared `resolveLhsPath()` and assign, same `permissionProcessor.redirectRestrictedProp` guard `processHandlerCommands` uses.

Verified end to end with a throwaway Node script (not checked in — there's no existing test scaffolding for handler/op commands in this repo, sync or async):
- Basic join, separator, and the all-or-nothing nested-array case (both the "middleName present" and "middleName absent" branches) all produced the expected strings.
- Your drawer-width example (`?.querySelector?.#drawer?.style?.width =&` with `withMethods: ['querySelector']`) resolved and assigned correctly — confirms the extracted `resolveLhsPath` still handles the `withMethods` path the same as before.
- An unknown op name throws `sync-op command "..." does not name a known op (join)`.
- A protocol handler returning a Promise under ` =&` throws the `assertNoThenable` error instead of silently assigning `"[object Promise]"`.
- `builtIns.join` under ` =>` now correctly throws `unknown handler "builtIns.join"` — confirms the removal is real, not just unreachable dead code.
- `npx tsc --noEmit --strict` on all touched/new `.ts` files reported zero new errors (two pre-existing, unrelated errors in `assignGingerly.ts`/`handleIshProperty.ts` about a missing `itemscopeRegistry` type — nothing to do with this change).

### Everything else that pointed at `builtIns.join`

Grepped the whole repo for `builtIns\.join|JoinHandler|handlers/join` and worked through every real hit (a few were false-positive substring matches inside `MicroDataJoinHandler`, left alone):

- **`package.json`** — removed the `./handlers/join.js` export entry (file's gone), added `./syncOps/join.js` and `./syncOps/registry.js`, added `syncOps/**` to `files`.
- **`DX/emojis.ts`** — removed `'🔗': 'builtIns.join'` from `builtInEmoji` (that map is only for `do:` handler aliasing, and `join` isn't a `do:` handler anymore), fixed the two examples in the file that used it, and left a comment explaining why `join` has no emoji alias here.
- **`DX/paths.ts` / `docs/paths-dx.md`** — the `sp` tag's doc comments said "for `builtIns.join`"; updated to point at the ` =&` join op instead. `sp` itself didn't change — it still just produces `?.`-path arrays, which is exactly what the new op consumes too.
- **`README.md`** — this was the biggest one:
  - Added an ` =&` row to the operator table; changed the ` =>` row's example off of `builtIns.join` (no longer valid there) to `builtIns.lazyLoad`.
  - Replaced the whole "Built-in handler: `builtIns.join`" section with "Sync op: join (` =&`)", rewritten for the new RHS shape, plus a new paragraph on the `options.protocols`-can-be-async / `assertNoThenable` behavior that didn't exist as a concept before.
  - Fixed the handler-aliases example (was demonstrating `'🔗': 'builtIns.join'` under ` =>` — no longer valid) to use the `🏷️`/`microDataJoin` alias instead.
  - Updated the microDataJoin section's "same semantics as `builtIns.join`" cross-reference and the whole "Typed Path Authoring" section's `sp`/`join` references and code example.
- **`Chats/AssignFrom/Handlers/Join/**` and other historical chat docs** — left untouched. Those are session records of *why* `builtIns.join` was designed the way it was; they're still accurate as history, they just no longer describe current behavior. Didn't see a case for editing history to match the present.

### One thing I didn't fix, flagging rather than silently leaving

`assignFromAsync.ts` never destructures `ternaryKeys` from `categorizeKeys()` — so ` ?=` keys have always been silently ignored there, not an error, just dropped. Since `syncOpKeys` is produced by the same `categorizeKeys()`, ` =&` keys are now *also* silently ignored if someone uses them with `assignFromAsync` instead of `assignFrom`. This isn't something I introduced — it's the existing ternary gap, now shared by the new operator by construction — and fixing it wasn't part of what was asked, so I left it alone. Worth a separate TODO if that gap should be closed (either wire both into `assignFromAsync`, or have it throw on keys it doesn't understand instead of dropping them).
