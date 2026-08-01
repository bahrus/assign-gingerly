# Restricted Method Settings Phase I

---

## Human Ask

```JS
{
    restrictedMethodSettings: [
        //Phase II
        'setHTMLUnsafe', //not allowed at all
        {
            //Phase II
            method: 'replaceWithHTML',
            addArgs: [
                '?.sanitizerOptions'
            ]
        }
    ]
    
}
```