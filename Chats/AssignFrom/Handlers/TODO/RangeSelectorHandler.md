# Range Selector Handler


---

## Human Ask

In looking at the roundabout documentation, we were able to convert a typical web component with lots of JavaScript into a 95% JSON configuration, thanks to merging with assignFrom.  The reason it wasn't 100% was due to this function:

```JS
updateStatus(self) {
    const { count } = self;
    if (count <= 10) return { status: 'low', statusMessage: 'Low count' };
    if (count < 20) return { status: 'medium', statusMessage: 'Medium count' };
    return { status: 'high', statusMessage: 'High count!' };
}
```

The closest thing we currenlt have for this is ' ?=' operator, but I think extending that to support this scenario is too big a stretch.

Since builtins are loaded on demand asynchronously (but can be invoked synchronously by pointing to it in the handlers option), I think we can justify defining a "rangeSelector" handler to make the first example 100% JSON, even if it isn't altogether pleasant to look at.

I'm thinking:

```JS
oCustomEl.assignFrom(
    {
        '?. =>': {
            do: 'builtins.rangeSelector',
            get: {
                select: '?.count',
                ranges: {
                    low: 10, //up to, including 10
                    med: [20], //last value (10) up to, not including 20
                    high: []
                },
                merge: {
                    low: {status: 'low', statusMessage: 'Low count' },
                    med: { status: 'medium', statusMessage: 'Medium count' },
                    high: { status: 'high', statusMessage: 'High count!' }
                }
            }
        }
    },
    {
        from: vm
    }
);
```

I'm open to alternative suggestions.

