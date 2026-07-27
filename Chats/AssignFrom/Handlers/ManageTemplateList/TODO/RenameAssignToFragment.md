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

But then, in the case of event binding, Kiro AI suggested