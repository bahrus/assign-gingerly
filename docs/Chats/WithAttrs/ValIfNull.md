#  Support for ValIfNull

While parsing the `withAttrs` in order to create the `initVals` object, it may be useful to specify what should happen when an attribute is not present on the element.

Currently, if an attribute is missing, it is not added to `initVals` at all. This requirement adds the ability to specify a default value when an attribute is null/missing.

## Proposed Enhancement to AttrConfig

```TypeScript
export interface AttrConfig<T = any> {
  valIfNull?: any
}
```

## Behavior

When an attribute is not present on the element:

1. **`valIfNull` is undefined (default)**: The property is not added to `initVals` (current behavior)
2. **`valIfNull` is defined**: The property is added to `initVals` with the specified default value, **bypassing all parsing** if the attribute isn't present.

## Examples

### Example 1: Default Value for Missing Attribute

```TypeScript
{
    withAttrs: {
        base: 'config',
        theme: '${base}-theme',
        _theme: {
            instanceOf: 'String',
            mapsTo: 'theme',
            valIfNull: 'light'  // Default to 'light' if attribute missing
        }
    }
}
```

```HTML
<div></div>  <!-- No config-theme attribute -->
```

```JavaScript
console.log(initVals);
// {theme: 'light'}
```

### Example 2: Numeric Default

```TypeScript
{
    withAttrs: {
        base: 'data',
        count: '${base}-count',
        _count: {
            instanceOf: 'Number',
            mapsTo: 'count',
            valIfNull: 0  // Default to 0 if attribute missing
        }
    }
}
```

```HTML
<div></div>  <!-- No data-count attribute -->
```

```JavaScript
console.log(initVals);
// {count: 0}
```

### Example 3: No Default (Current Behavior)

```TypeScript
{
    withAttrs: {
        base: 'data',
        optional: '${base}-optional',
        _optional: {
            instanceOf: 'String',
            mapsTo: 'optional'
            // No valIfNull specified
        }
    }
}
```

```HTML
<div></div>  <!-- No data-optional attribute -->
```

```JavaScript
console.log(initVals);
// {}  (optional is not present)
```

### Example 4: Object Default

```TypeScript
{
    withAttrs: {
        base: 'config',
        settings: '${base}-settings',
        _settings: {
            instanceOf: 'Object',
            mapsTo: 'settings',
            valIfNull: { enabled: false }  // Default object
        }
    }
}
```

```HTML
<div></div>  <!-- No config-settings attribute -->
```

```JavaScript
console.log(initVals);
// {settings: {enabled: false}}
```

### Example 5: Boolean Default

```TypeScript
{
    withAttrs: {
        base: 'feature',
        enabled: '${base}-enabled',
        _enabled: {
            instanceOf: 'Boolean',
            mapsTo: 'isEnabled',
            valIfNull: false  // Default to false if attribute missing
        }
    }
}
```

```HTML
<div></div>  <!-- No feature-enabled attribute -->
```

```JavaScript
console.log(initVals);
// {isEnabled: false}
```

## Important Notes

1. **Parser is bypassed**: When `valIfNull` is defined and the attribute is missing, the parser is NOT called. The default value is used as-is.
2. **Empty string vs missing**: If the attribute exists but is empty (`data-count=''`), the parser IS called with the empty string. `valIfNull` only applies when the attribute is completely absent.
3. **Type safety**: The default value should match the expected type, but this is not enforced at runtime.
4. **Any value allowed**: `valIfNull` can be any JavaScript value: string, number, boolean, object, array, null, etc.

## Implementation Location

This should be implemented in `parseWithAttrs.ts`, in the section that checks if an attribute exists before parsing it.

## Implementation Pseudocode

```TypeScript
// In parseWithAttrs.ts, for each attribute:
const attrValue = element.getAttribute(resolvedAttrName);

if (attrValue === null) {
  // Attribute is missing
  if (config.valIfNull !== undefined) {
    // Use the default value, bypass parser
    result[config.mapsTo] = config.valIfNull;
  }
  // else: don't add to result (current behavior)
} else {
  // Attribute exists, parse it normally
  const parsedValue = parser(attrValue);
  result[config.mapsTo] = parsedValue;
}
```
