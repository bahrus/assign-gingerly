


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
            assignAsyncToFragment: {
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