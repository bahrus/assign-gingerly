# Debounce With Wait For Settled with ManageTemplateList handler

---

## Human Ask

The mount-observer package contains a utility module, [waitForSettled.ts](https://raw.githubusercontent.com/bahrus/mount-observer/refs/heads/baseline/waitForSettled.ts).

I'd like us provide an option we can set, so that this utility is used before committing the fragment of rows before adding it to the live DOM Tree.

That would mean porting over that code into this project (and I will follow up by making the downstream mount-observer package use it).

This is to make performance better (hopefully) to handle asynchronous rendering changes before adding to the live DOM tree.

Unless you have a better idea, can we incorporate this module?

---

## Response

### The Module

`waitForSettled` is a clean, focused utility (~40 lines):
- Observes a DOM subtree for mutations (childList, attributes, characterData, subtree)
- Debounces: each mutation resets an idle timer
- Resolves when no mutations have occurred for `idleMs` (default: 100ms)
- Optional `timeout` — rejects if mutations never quiesce

### How It Would Fit

In `manageTemplateList`, after all clones have been processed and added to the fragment (but before inserting the fragment into the live DOM):

```ts
// Build fragment with all clones...
// ...

if (waitForSettledOptions) {
    // Let async rendering inside the fragment settle before committing
    await waitForSettled(fragment, waitForSettledOptions.idleMs, waitForSettledOptions.timeout);
}

// Now insert into live DOM
endMarker.parentNode.insertBefore(fragment, endMarker);
```

This covers the case where `assignFrom` calls within the fragment trigger async work (e.g., itemscope managers instantiating, enhancements spawning, features resolving). The fragment settles off-screen, then commits in one shot — no partial renders visible to the user.

### Config Shape

```ts
fromEachItem: { ... },
fromSource: { ... },
resolve: {
    forEach: '?.rankings',
    instantiate: 'globalThis://country-ranking',
    // New:
    waitForSettled: true,           // use defaults (idleMs: 100, no timeout)
    // Or detailed:
    waitForSettled: { idleMs: 50, timeout: 2000 },
}
```

Or as a boolean shorthand + object detailed form (like `transitional`).

### No Concerns — Good Fit

- The utility is small, dependency-free, and general-purpose
- It solves a real problem (async rendering inside fragments before DOM commit)
- It's opt-in (default: off, no cost when not used)
- It can be dynamically imported only when the option is present
- Porting it here makes sense — it's a DOM utility that other parts of this package could use too (e.g., `beVigilant` could wait for settle after initial assignment)

### One Thought

For the error case (`timeout` exceeded, promise rejects) — should the handler:
- A) Still insert the fragment (best-effort — show partial results)
- B) Not insert (fail silently or throw)

I'd lean toward A — insert anyway with a console warning. Waiting for settle is an optimization, not a correctness requirement. If async work is still in flight after timeout, showing partial results is better than showing nothing.

### Implementation Plan

1. Port `waitForSettled.ts/.js` into the project root (like `markerUtils`, `transitionHelper`)
2. Add it to package.json exports
3. In `manageTemplateList`, after building the fragment:
   - If `resolvedParams.waitForSettled` is truthy, dynamically import and await it
   - On timeout rejection: log warning, insert fragment anyway
4. Add to types

Ready to implement when you confirm.

---

## Human Response I

Confirmed, please implement.
