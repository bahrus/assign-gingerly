# Restricted Prop Config

---

## Human Ask

So I would like to support nuanced prop setting restrictions:

```JS
{
    sanitizerOptions: {...},
    restrictedPropSetting: [
        'innerHTML' /** not allowed **/, 
        {
            prop: 'outerHTML',
            useMethod: 'replaceWithHTML',
            withOptions: '?.sanitizerOptions',
        },
        {
            prop: 'src',
            attr: 'src',
            allowFromSameHost: true,
            allowCrossDomain: false,
        }
    ]
}
```