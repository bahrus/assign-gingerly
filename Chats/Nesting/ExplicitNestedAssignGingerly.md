# Explicit Nested Assignment

---

## Human Ask

I still think that:

```JS
assignGingerly(oElement, {
    '?.style?.width' : '100px',
    '?.style?.height': '40px',
});
```

is less ergonomic than I'd like.

I would like to be able to say somehow "this is a recursive call to assignGingerly" in an ergonomic way.

So one idea would be something like this:

```JS
assignGingerly(oElement, {
    'style $=': {
        width: '100px',
        height: '50px'
    }
});
```

Another:

```JS
assignGingerly(oElement, {
    _style_: {
        width: '100px',
        height: '50px'
    }
} {
    explicitNested: true // or ['_', '_']
});
```

Other ideas?  

Do any of them seem worth it?

