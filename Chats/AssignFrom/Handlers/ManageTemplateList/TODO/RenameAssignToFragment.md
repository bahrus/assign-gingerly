# Rename AssignToFragment

---

## Human Ask

In walking through the [Add Event Listener Command](../../../../Commands/+=/TODO/AddEventListener.md) the overuse of "assign" made things overly verbose.  Especially in the context of "from", simply saying "to" should be sufficient:

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
            toFragment: { '?.querySelector?.tr?.ish': '?.' },
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