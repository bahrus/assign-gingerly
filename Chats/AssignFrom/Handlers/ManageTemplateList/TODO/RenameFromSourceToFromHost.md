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