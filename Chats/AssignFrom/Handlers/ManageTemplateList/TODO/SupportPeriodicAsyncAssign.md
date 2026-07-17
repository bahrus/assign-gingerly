# Support Periodix Async Assign

---

## Human Ask

The performance gains we achieved bt making assigFrom sync by default has a catch:  Rendering a large number of rows will freeze the browser or at a minimum cause jank.

I'd like to support another parameter:

```JS
const assignValues = {
    '?. =>': {
        do: 'builtIns.manageTemplateList',
        resolve: {
            forEach: '?.data',
            instantiate: 'globalThis://row-tpl',
            forget: true,
            yieldEvery: 1000
        },
        fromEachItem: {
            assignToFragment: {
                '?.cells?.0?.textContent': '?.id',
                '?.cells?.1?.textContent': '?.label'
            },
            // withOptions: {
            //     inferredAssignments: { byItemprop: true }
            // },
            resolve: { key: '?.id' }
        }
    }
};
```

I'm open to suggestions on the name. I guess this would be a modulo check, but don't make row "0" asynchronous, only 1000th, 2000th, etc

---

## Response

### The Concept

Process N items synchronously (fast, no overhead), then yield to the browser (one `setTimeout(0)` or `requestAnimationFrame`) so it can paint and handle input events, then continue with the next N items. First batch is always sync (no yield before item 0).

This is the "chunked rendering" pattern — same idea as React's concurrent mode or `requestIdleCallback`-based schedulers.

### On the Name

`yieldEvery` is clear and descriptive — "yield to the browser every N items." Alternatives:

| Name | Feel |
|------|------|
| `yieldEvery` | Clear, action-oriented |
| `batchSize` | Common in data processing, but doesn't say "yield" |
| `chunkSize` | Similar to batchSize |
| `yieldAfter` | "Yield after N items" — slightly different emphasis |
| `renderBatch` | Implies rendering |

**I'd stick with `yieldEvery`** — it communicates both what happens (yield) and when (every N).

### Implementation

```ts
// Inside the item loop:
for (let i = 0; i < itemsArray.length; i++) {
    // Yield to browser periodically (but not on the first item)
    if (yieldEvery && i > 0 && i % yieldEvery === 0) {
        // Insert current fragment batch
        if (fragment.childNodes.length > 0) {
            endMarker.parentNode!.insertBefore(fragment, endMarker);
            fragment = document.createDocumentFragment(); // fresh fragment for next batch
        }
        // Yield
        await new Promise(r => setTimeout(r, 0));
    }

    // ... normal per-item processing ...
}
```

Key points:
- First batch (items 0-999) runs synchronously — no yield before anything renders
- At item 1000, insert the current fragment, yield, then start a new fragment for items 1000-1999
- Each batch gets its own `insertBefore` call (progressive rendering — user sees rows appearing in chunks)
- The `await` makes the `assign` method return a Promise on the 1000th item — but since the caller (`processHandlerCommands`) already awaits it, this is fine

### One Consideration

This means `assign()` needs to remain `async` (or become async when `yieldEvery` is set). Currently it's `async` already. The sync `assignFrom` fire-and-forgets the handler call anyway — so the yielding happens in the background without blocking the caller. Good.

### Progressive vs Buffered Rendering

Two strategies:
- **Progressive** (insert fragment at each yield): User sees rows appearing in chunks. Better perceived performance.
- **Buffered** (one insert at the end): User sees nothing until all items are done. Worse perceived perf but fewer reflows.

I'd default to **progressive** — insert whatever's ready at each yield point. The user sees content appearing incrementally.

### Questions

1. **Does progressive rendering (insert at each yield) feel right?** Or should all items buffer until the end?
2. **Should `yieldEvery` default to `undefined` (no yielding) or a sensible default like 1000?** I'd say undefined — opt-in only.
3. **Ready to implement?**

---

## Human Response

Sorry, no, we had a disconnect:

The code change should be something like:

```TS
for (let i = 0; i < itemsArray.length; i++) {
    ...
    if (yieldEvery && i > 0 && i % yieldEvery === 0) {
         await assignFromSync(rootEl, assignToFragment, { from: item, ...withOptions });
    }else{
         assignFrom(rootEl, assignToFragment, { from: item, ...withOptions });
    }
```

---

## Implementatiion Notes

Ah — I see. The yield isn't about inserting the fragment in batches. It's about using `await assignFromAsync` (which yields to the microtask queue) every Nth item to give the browser a chance to breathe, while using the sync `assignFrom` for all other items. The fragment insertion stays at the end as one operation.

I need to:
1. Extract `yieldEvery` from `resolvedParams`
2. Import `assignFromAsync` for the yield case
3. Add the modulo check in both the "existing" and "new" item paths

Now add the `assignFromAsync` import at the top:

Now update the per-item assignment calls to use `await assignFromAsync` every Nth item:

Done. The logic:
- Items 0 through `yieldEvery-1`: sync `assignFrom` (no yield)
- Every `yieldEvery`th item (1000th, 2000th, etc.): `await assignFromAsync` (for non-fast-path) or `await new Promise(r => setTimeout(r, 0))` (for fast path) — yields to the browser
- All other items: sync `assignFrom`

Usage:
```js
resolve: {
    forEach: '?.data',
    instantiate: 'globalThis://row-tpl',
    yieldEvery: 1000,  // yield to browser every 1000 items
}
```

---

## Human Response II

Hmm, looking at the code, I guess we could do this instead:

```JS
const shouldYield = yieldEvery && i > 0 && i % yieldEvery === 0;
if (shouldYield) await new Promise(r => setTimeout(r, 0));
if (processInferred) {
    processInferred(rootEl, item, inferredConfig === true ? { byItemprop: true } : inferredConfig);
} else {
    assignFrom(rootEl, assignToFragment, { from: item, ...withOptions });
}
if (sourceAssignToFragment && options?.from) {
    assignFrom(rootEl, sourceAssignToFragment, { from: options.from, ...sourceWithOptions });
}
```

I think what I was thinking is that assignFromAsync could do a little more work like use asynchronous protocols, so if someone want to take advantage of that, they could set yieldEvery to 1.

What are your thoughts?



---

## Response to Human Response II

### The Simpler Version

Your simplified code is cleaner — one yield point, then always sync processing afterward. It separates the concerns:
- "Should I yield?" — just a `setTimeout(0)` pause
- "How do I process?" — always the same (sync assignFrom or processInferred)

This is simpler to reason about and maintain.

### On `yieldEvery: 1` for Async Protocols

I see the thinking: if someone sets `yieldEvery: 1`, every item yields, which *coincidentally* means async protocols could work because there's an `await` before each item.

But there's a problem: `assignFrom` (sync) doesn't support async protocols — it uses `getValues` which calls protocol handlers synchronously. The `await new Promise(r => setTimeout(r, 0))` just yields to the browser scheduler; it doesn't make `assignFrom` itself async-protocol-aware.

For async protocols per item, you'd genuinely need `assignFromAsync` in the loop. So if you want that as an option, the code would need:

```js
if (shouldYield) {
    await assignFromAsync(rootEl, assignToFragment, { from: item, ...withOptions });
} else {
    assignFrom(rootEl, assignToFragment, { from: item, ...withOptions });
}
```

This gives `yieldEvery: 1` the "full async experience" — async protocols work, plus a natural yield per item.

### My Recommendation

Go with the simpler version (just `setTimeout` yield) for now. If someone needs async protocols per-item, they can set `yieldEvery: 1` and we switch to `assignFromAsync` only for those yield points. This keeps the common path fast while offering the escape hatch.

So the final pattern would be:

```ts
const shouldYield = yieldEvery && i > 0 && i % yieldEvery === 0;
if (shouldYield) {
    await assignFromAsync(rootEl, assignToFragment, { from: item, ...withOptions });
} else if (processInferred) {
    processInferred(rootEl, item, inferredConfig === true ? { byItemprop: true } : inferredConfig);
} else {
    assignFrom(rootEl, assignToFragment, { from: item, ...withOptions });
}
```

This gives:
- `yieldEvery: undefined` — all sync, maximum speed
- `yieldEvery: 1000` — yields every 1000th item, with full async support on those items
- `yieldEvery: 1` — full async per item (slow but supports async protocols)

Want me to update the implementation to this pattern?

---

## Human Response III

Let me think about this.
