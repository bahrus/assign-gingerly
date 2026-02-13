## No more asynchronous + AttrPatterns Support

Let's simplify this package and add declarative attribute pattern support by:

1.  No longer allowing asynchronous spawns

```TypeScript
export interface IBaseRegistryItem<T = any> {
  spawn: { new (): T } | Promise<{ new (): T }>;
  map: { [key: string | symbol]: keyof T };
  enhKey?: string;
}
```

becomes:

```TypeScript
export interface IBaseRegistryItem<T = any> {
  spawn: { new (oElement?: Element, ctx?: any, initVals?: Partial<T>): T };
  map: { [key: string | symbol]: keyof T };
  enhKey?: string;
  lifecycleKeys?: {
    dispose?: string;
    resolved?: string;
  };
  attrPatterns?: Array<{
    attrName: string;
    propName: string | '.';
    parser: (value: string | null) => any;
    initialOnly: boolean;
  }> | AttrPatterns<T>;
}
```

2.  Remove all conditional logic based on spawn being possibly asynchronous.

3.  Make assignGingerly synchronous.

4.  Add support for declarative AttrPatterns with TypeScript type safety:

### AttrPatterns Interface

```TypeScript
interface AttrConfig<T = any> {
    instanceOf?: 'Object' | 'String' | 'Number' | 'Boolean' | 'Array' 
                | typeof Object | typeof String | typeof Number | typeof Boolean | typeof Array;
    mapsTo: '.' | keyof T;
    parser?: (attrValue: string | null) => any;
    initialOnly?: boolean;
}

interface AttrPatterns<T = any> {
    base: string;
    _base: AttrConfig<T>;
    [key: string]: string | AttrConfig<T>;
}
```

### Usage Example

```TypeScript
const patterns = createAttrPatterns({
    base: 'greetings',
    _base: { instanceOf: 'Object', mapsTo: '.' },
    a: '${base}:hello',           // Resolves to 'greetings:hello'
    _a: { instanceOf: 'String', mapsTo: 'hello' },
    b: '${a}--i-am-well',         // Resolves to 'greetings:hello--i-am-well'
    _b: { instanceOf: 'Boolean', mapsTo: 'wellBeing' }
});
```

### Implementation Requirements

- Support both array format (existing) and declarative format (new)
- Implement `normalizeAttrPatterns()` to convert declarative to array format
- Implement `resolveTemplate()` for recursive template variable resolution
- Provide `createAttrPatterns()` helper for type-safe pattern creation
- Validate template variable references at runtime
- Support JSON serialization (use string-based `instanceOf`)

See `Requirements/AttrPatterns-TypeScript-Modeling.md` for full specification.