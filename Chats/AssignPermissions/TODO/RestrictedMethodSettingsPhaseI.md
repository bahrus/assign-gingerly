# Restricted Method Settings Phase I

---

## Human Ask

```JS
{
    restrictedMethodSettings: [
        //Phase I
        'setHTMLUnsafe', //not allowed at all
        ...
    ]
}
```

This overrides 

withMethods: ['setHTMLUnsafe']

The withMethods might be configurable in an HTML attribute, whereas restrictedMethodSettings only gets set from  