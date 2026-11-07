# Rename AssignToFragment

---

## Human Ask

Feel free to push back on this.  No worries about backwards compatibility, as no external dependencies so far.

In walking through the [Add Event Listener Command](/docs/event-binding.md) I was trying to follow naming conventions established by the ManageTemplateList handler, but found that the overuse of "assign" made things overly verbose, since the whole thing is wrapped inside an "assign".  Especially in the context of "from", simply saying "to" should be sufficient.  This makes me think we should now revisit the naming in ManageTemplateList.

Instead of:

```JS
await assignFrom(document.getElementById('rankings-body'), {
    '?. =>': {
        do: 'builtIns.manageTemplateList',
        resolve: {
            forEach: '?.rankings',
            instantiate: 'globalThis://country-ranking',
        },
        fromEachItem: {
            assignToFragment: { '?.querySelector?.tr?.ish': '?.' },
            withOptions: {
                withMethods: ['querySelector'],
                infer: { byItemprop: true }
            },
            resolve: { key: '?.rank' }
        }
    }
}, {
    from: vm,
    protocols: { globalThis: k => globalThis[k] }
});
```

```JS
await assignFrom(document.getElementById('rankings-body'), {
    '?. =>': {
        do: 'builtIns.manageTemplateList',
        resolve: {
            forEach: '?.rankings',
            instantiate: 'globalThis://country-ranking',
        },
        fromEachItem: {
            toClone: { '?.querySelector?.tr?.ish': '?.' },
            withOptions: {
                withMethods: ['querySelector'],
                infer: { byItemprop: true }
            },
            resolve: { key: '?.rank' }
        }
    }
}, {
    from: vm,
    protocols: { globalThis: k => globalThis[k] }
});
```

I'm thinking it might make more sense to rename toFragment toClone while we are at it.

But then, in the case of event binding, Kiro AI suggested dispensing each with the "toHost" even, since it can be inferred.  In this case, that would like:

```JS
await assignFrom(document.getElementById('rankings-body'), {
    '?. =>': {
        do: 'builtIns.manageTemplateList',
        resolve: {
            forEach: '?.rankings',
            instantiate: 'globalThis://country-ranking',
        },
        fromEachItem: {
            '?.querySelector?.tr?.ish': '?.',
            withOptions: {
                withMethods: ['querySelector'],
                infer: { byItemprop: true }
            },
            resolve: { key: '?.rank' }
        }
    }
}, {
    from: vm,
    protocols: { globalThis: k => globalThis[k] }
});
```

Since merging cloned templates into the target is such a common requireent we could even overload even more the += operator, so that if the rhs object has "forEach", map it to this handler:

```JS
await assignFrom(document.getElementById('rankings-body'), {
    '?. +=': {
        forEach: '?.rankings',
        instantiate: 'globalThis://country-ranking',
        fromEachItem: {
            '?.querySelector?.tr?.ish': '?.',
            withOptions: {
                withMethods: ['querySelector'],
                infer: { byItemprop: true }
            },
            resolve: { key: '?.rank' }
        }
    }
}, {
    from: vm,
    protocols: { globalThis: k => globalThis[k] }
});
```

Which step(s), if any, is a step too far?

I guess one could argue that the number of event handlers will tend to far exceed the number of looping content, and it's an inheritently more complex beast anyway, hence the need to make the syntax as compact as adding an event handler might not make it worth it?




---

## AI Response

Good instinct to revisit naming as the system matures. Let me evaluate each step:

### Step 1: `assignToFragment` → `toClone`

**Yes — do this.** Reasons:

- "assignToFragment" is verbose and redundant (everything is an assign here)
- "toClone" is accurate — you're assigning *to* the cloned template content
- Consistent with the `toHost`/`toTarget`/`toLHS` naming from the event binding system
- Shorter by 11 characters per occurrence

### Step 2: Shorthand (dispense with `toClone` key, inline patterns directly)

**This is where I'd pause.** The event binding shorthand works because:
- There's one clear default destination (`toHost`) 
- The `fromX` blocks provide unambiguous context for what the patterns mean

In `fromEachItem`, the patterns go to *the clone*. But `fromEachItem` also has `withOptions`, `resolve`, and potentially `configs` as sibling keys. The shorthand detection ("any key starting with `?.` or containing operators") works, but it means:

```JS
fromEachItem: {
    '?.querySelector?.tr?.ish': '?.',   // ← this is a pattern (toClone)
    withOptions: { ... },                // ← this is config
    resolve: { key: '?.rank' }           // ← this is config
}
```

That's actually not confusing — the reserved keys (`withOptions`, `resolve`, `configs`, `get`) are distinct from pattern keys (`?.` prefix, operators). It reads fine. And it mirrors the event binding shorthand exactly.

**Verdict: do this too.** The reserved key set is small and well-defined. Pattern keys are visually distinct.

### Step 3: `+=` with `forEach` → auto-map to `manageTemplateList`

**This is a step too far.** Here's why:

1. **`+=` already does too much** — it handles numbers, strings, arrays, and now event listeners. Adding template list management makes it a grab-bag operator where the behavior depends entirely on the RHS shape. That's hard to reason about.

2. **The ` =>` operator exists for exactly this purpose** — handlers are the designated "do complex things" mechanism. `manageTemplateList` is complex (reconciliation, keyed updates, multi-element templates, yieldEvery, waitForSettled). It *should* look complex at the call site because it *is* complex.

3. **Event binding on `+=` works because it's literally "adding" something** — you're adding an event listener to an element, which is conceptually `element += listener`. But "element += list" doesn't have a natural semantic. `element => { do: 'list' }` reads more honestly.

4. **Your own closing thought is correct** — event handlers far outnumber template lists, and template lists inherently warrant more explicit configuration. The ceremony of ` =>` is justified here.

### My recommendation

| Step | Verdict | Action |
|------|---------|--------|
| `assignToFragment` → `toClone` | ✓ Yes | Rename — cleaner, consistent |
| Shorthand (inline patterns in `fromEachItem`) | ✓ Yes | Same mechanism as event binding |
| `+=` with `forEach` | ✗ No | Too much overloading; ` =>` is the right tool |

Would also apply the shorthand to `fromSource` (if that exists in manageTemplateList) — same pattern.

### One thought on `toClone` vs bare shorthand

If we support the shorthand (patterns directly in `fromEachItem`), then `toClone` becomes the *explicit* form — used only when you also need `toHost` or `toLHS` in the same block:

```JS
// Simple case — shorthand (default destination = clone)
fromEachItem: {
    '?.querySelector?.tr?.ish': '?.',
    withOptions: { ... },
    resolve: { key: '?.rank' }
}

// Complex case — explicit destinations
fromEachItem: {
    toClone: { '?.querySelector?.tr?.ish': '?.' },
    toHost: { '?.lastRenderedKey': '?.rank' },
    withOptions: { ... },
    resolve: { key: '?.rank' }
}
```

This parallels the event binding design exactly. Clean.

---

## Human Response

Please implement

| Step | Verdict | Action |
|------|---------|--------|
| `assignToFragment` → `toClone` | ✓ Yes | Rename — cleaner, consistent |
| Shorthand (inline patterns in `fromEachItem`) | ✓ Yes | Same mechanism as event binding |

and update the README.md as well as the demos/js-framework-benchmark.html, demos/multi-row-template.html
