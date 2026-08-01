# Restricted Prop Setting Phase II

```JS
{
    restrictedPropSettings: [
        ...
        //Phase II
        {
            prop: 'outerHTML',
            useMethod: 'replaceWithHTML',
        },
    ]
    ...
}
```

Recall that Phase V will include:

```JS
restrictedMethodSettings: [
    //Phase IV
    'setHTMLUnsafe', //not allowed at all
    customSettings:{
        sanitizerOptions: {...},
    },
    
    {
        //Phase V
        method: 'replaceWithHTML',
        addArgs: [
            '?.customSettings?.sanitizerOptions'
        ]
    }
]
```

... so "leave room " for that when the time comes, if relevant.