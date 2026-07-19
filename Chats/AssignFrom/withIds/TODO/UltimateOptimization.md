# Ultimate Optimization

---

# Human Ask

I am perplexed how to create an authoring utility to help make use of this feature robust to UI redesign, but perhaps you have some ideas on that.

The easier thing to implement, though is the following optimization:

```html
<form id=oForm>
    <label>My Label</label>
    <input>
</form>
```

```JS
assignFrom(oForm, {
    '#[b]?.htmlFor': '#[a]?.id'
}, {
    ...
    withIds: {
        a: [0, 1],
        b: [0, 2]
    },
    withMethods: ['querySelector']
})
```

So if the rhs of the expressions inside the withIds is an array, assume it it lists the sequence of index of element children.

How much weight would this add?

Any idea how to improve the DX for this during build time / server side rendering time?  Assume the html is defined as a const variable using a (tagged) template literal to define it.