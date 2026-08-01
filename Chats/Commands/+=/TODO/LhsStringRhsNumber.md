# LHS is of type string that can be parsed as a number, RHS is of type number

---

## Human Ask

As always, feel free to push back on this request.

This is a common scenario that it would be nice to make work the way I think developers would want it to work:

```html
<button data-diff=12>Click</button>
```

```JS
assignGingerly(oButton, {
    dataset:{
        '?.diff +=': 13
    }
});
```

What should happen:

LHS = (Number(LHS) + RHS).toString()

So that the outcome of this should be:

```html
<button data-diff=25>Click</button>
```