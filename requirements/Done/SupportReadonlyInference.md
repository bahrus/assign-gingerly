# Support For Readonly Inference and Subclass Prioritization

## Part I -- Readonly properties

This is kind of a pain:

```JavaScript
const div = document.createElement('div');
assignGingerly(div, {
    '?.style?.height': '15px',
});
```

Why can't we just do this?:

```JavaScript
const div = document.createElement('div');
assignGingerly(div, {
    style: {
        height: '15px'
    },
});
```

The simple answer is that some objects may want to support properties that will typically want to be replaced totally in one step, and supporting the above syntax would raise questions about how we could do so.  I will note that some popular deepMerge libraries just assume everything should be done carefully and recursively, without requiring the ?.style?.height syntax.

In a way, since assignGingerly does have the ability to delete a property first, then set it, this could be done, but feels kind of clunky.

So this amended behavior proposal is to:

Check when assigning a new value that the following conditions hold:

1.  The new value is an object, and 
2.  The property being assigned to is readonly.  

If this is the case, then infer that the author intends to assign gingerly:

```JavaScript
assignGingerly(div.style, {height: '15px'}, options /* pass through if provided */);
```

**Detection**: A property is considered readonly if:
- It's a data property with `writable: false`, OR
- It's an accessor property with a getter but no setter


**Performance consideration**: This check only happens when:

- The new value is an object (not primitive)
- The property already exists on the target
- This avoids unnecessary descriptor lookups for most cases

**Error handling**: If the property is readonly AND its current value is a primitive (not an object), throw an error like "Cannot merge object into readonly primitive property 'propertyName'".

I don't see the benefits of being able to opt out of this feature, as the old behavior would just throw an error, and the usage is quite limited for now, so no concerns about breaking backwards compatibility.

The right protocol becomes a little more questionable when it comes to enhancements.  Assign-gingerly of course supports delicate property setting, as shown in the README.md:

<details>
  <summary>Support for JSON assignment with Symbol.for symbols</summary>

```JavaScript
const result = assignGingerly({}, {
    "[Symbol.for('TFWsx0YH5E6eSfhE7zfLxA')]": true,
    "[Symbol.for('BqnnTPWRHkWdVGWcGQoAiw')]": true,
    '?.style.height': '40px',
    '?.enh?.mellowYellow?.madAboutFourteen': true
}, {
    registry: EnhancementRegistry
});
```
</details>
```

