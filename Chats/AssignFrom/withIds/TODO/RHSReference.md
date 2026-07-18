# RHS Reference to dynamic ids

---

## Human Ask

Maybe this is already supported, but I suspect not:

```html
<form id=oForm>
    <label>
    <input>
</form>
```


```JS

assignFrom(oForm, {
    '?.querySelector?.label?.for': '#[x]'
}, {
    ...
    withIds: {
        x: {
            qry: 'input'
        }
    },
    withMethods: ['querySelector']
})
```

I'm flexible with what the best syntax would be, or if an alternative approach would be better