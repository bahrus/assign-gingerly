# Rename fromSourceToFromHost

---

## Human Ask

The documentation [on the manageTemplateList](/docs/manage-template-list.md) indicates we are still using "fromSource" for what I would like us to uniformly refer to as the "host":

```JS
await assignFrom(document.getElementById('rankings-body') /** this is the target **/, {
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
        },

        // Shared data from the outer source (optional)
        // this should change to fromHost
        fromSource: { 
            toClone: {
                '?.querySelector?.[part~="total"]?.textContent': '?.totalMedalCount'
            },
            withOptions: {
                withMethods: ['querySelector']
            }
        }
    }
}, {
    from: vm, /** this is the host **/
    protocols: { globalThis: k => globalThis[k] }
});
```

Also, I don't think we ever added support for "fromTarget".

The [event-binding += overload](/docs/event-binding.md) established a clear pattern for all this, which we started bringing in with [RenameAssignToFragment](/Chats/AssignFrom/Handlers/ManageTemplateList/RenameAssignToFragment.md).

I would like us to be consistent with that, even with code reuse where applicable.

---

## AI Response

Agreed — consistency with the event-binding pattern is the right call. Let me map the terminology:

### Current state in `manageTemplateList`

| Current name | What it means | Event-binding equivalent |
|-------------|---------------|--------------------------|
| `fromSource` | Assigns from `options.from` (the outer VM) to each clone | `fromHost` |
| (not supported) | Assigns from the `target` (first arg to assignFrom) to each clone | `fromTarget` |

### Proposed alignment

```JS
'?. =>': {
    do: 'builtIns.manageTemplateList',
    get: { forEach: '?.rankings', instantiate: 'globalThis://country-ranking' },
    fromEachItem: {
        '?.querySelector?.tr?.ish': '?.',     // shorthand → toClone (from each item)
        withOptions: { ... },
        resolve: { key: '?.rank' }
    },
    // Renamed: fromSource → fromHost
    fromHost: {
        '?.querySelector?.[part~="total"]?.textContent': '?.totalMedalCount',
        withOptions: { withMethods: ['querySelector'] }
    },
    // New: fromTarget
    fromTarget: {
        '?.querySelector?.[part~="count"]?.textContent': '?.childElementCount',
        withOptions: { withMethods: ['querySelector'] }
    }
}
```

### On `fromTarget` support

Use case: you want to read something from the *container element* (the `<tbody>`, first arg to `assignFrom`) and assign it to each clone. Examples:
- Container's `dataset` values shared across all rows
- A computed count from the container itself
- Accessibility labels derived from the container

It's less common than `fromHost` but legitimate. And since the event-binding system already defines the full matrix, supporting it here is just: `assignFrom(clone, pattern, { from: target, ...withOptions })`.

### Code reuse opportunity

The processing logic for `fromHost` and `fromTarget` in manageTemplateList is identical to the event binding pattern:

```JS
if (fromHost) {
    const pattern = fromHost.toClone ?? extractToClone(fromHost);
    if (Object.keys(pattern).length > 0) {
        assignFrom(rootEl, pattern, { from: host, ...fromHost.withOptions });
    }
}
if (fromTarget) {
    const pattern = fromTarget.toClone ?? extractToClone(fromTarget);
    if (Object.keys(pattern).length > 0) {
        assignFrom(rootEl, pattern, { from: target, ...fromTarget.withOptions });
    }
}
```

The `extractToClone` helper (shorthand detection) is already in place. This is ~10 lines to add both.

### Backwards compatibility

Keep `fromSource` as a fallback alias (like we did with `assignToFragment`):
```JS
const fromHost = this.config.fromHost ?? this.config.fromSource;
```

### Implementation scope

| Change | Files |
|--------|-------|
| Rename `fromSource` → `fromHost` (+ alias fallback) | `manageTemplateList.ts` / `.js` |
| Add `fromTarget` support | Same files, ~10 lines |
| Update docs | `docs/manage-template-list.md`, `README.md` |
| Update types | `types/assign-gingerly/types.d.ts` |

Want me to implement?

---

## Human Response I

Looks good.  Let's please remove the backwards compatibility for both assignToFragment and fromSource, as there's no use of this yet outside this package.

Don't forget to look for destructuring opportunities.

If my response didn't open up any uncertainties, please implement.

## Implementation Notes

Now I have the full picture. Let me replace the `fromSource` section with `fromHost` + `fromTarget`, remove backwards compat for `assignToFragment`, and apply destructuring:

Now replace the `sourceToClone` usages with `hostToClone` + add `targetToClone`:

That regex didn't match cleanly. Let me do it with str_replace directly:

It seems the regex did replace them. Let me check diagnostics:

Good. Let me verify the file looks correct around the fromHost/fromTarget sections:

Now update the JS file similarly:

Now I need to add the `fromTarget` handling after each `hostToClone` block in the JS file. Let me also add the `fromTarget` support:

The JS file already has `targetToClone` support (the regex applied the TS changes). Let me verify the second occurrence:

Both are in place. Now update the docs:

Now update types:

Good — types already don't have `fromSource`. Let me also remove any remaining `assignToFragment` backwards compat in the TS file:

Remove `'assignToFragment'` from the reserved keys set (no backwards compat):

Same in JS:

Also remove the `?? fromEachItem?.assignToFragment` fallback in the TS `toClone` line:
