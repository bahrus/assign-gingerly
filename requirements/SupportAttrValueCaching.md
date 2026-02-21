# Support Attr Parse caching

Th withAttrs underscore named config settings supports built-in or custom parsing:

```TypeScript
{
    withAttrs: {
        base: 'my-enhancement',
        timestamp: '${base}-timestamp',
        _timestamp: {
            instanceOf: 'Number',
            mapsTo: 'createdAt',
            parser: (v) => v ? new Date(v).getTime() : null
        },
        tags: '${base}-tags',
        _tags: {
            instanceOf: 'Array',
            mapsTo: 'tagList'
        }
    }
}
```

In some cases, these same attributes may appear repeatedly throughout the document, with the same exact value.  In such a case, performance may improve by caching the parsed value.

In some cases, it is safe to parse once, and pass in repeatedly to multiple enhancements via the initVals, and trust that those enhancements won't mutate the parsed object.  In some cases, that risk may be too great to bear, so that a structural clone should be needed (which may cancel out some of the benefits of caching in the first place) 

To support caching, add the following property to AttrConfig:

```TypeScript
export interface AttrConfig<T = any> {
    parseCache?: 'shared' | 'cloned'
}
```

If this value is 'shared' or 'cloned' a cache would be established keyed off the string value (including the null possibility somehow.)