# withAttrs requirement

object-extension, while spawning a new class instance, checks to see if it has existing values to pass into initVals, around line 137 currently.

Before this check, we need to conditionally parse and also pass in, as part of the initVals object, values obtained from the attributes.

The initVals object will conform to the object structure used by assign-gingerly as far as merging in properties, including nested paths.

The type definition of IBaseRegistryItem<T = any> in types.d.ts has been updated to include a new optional property, `withAttrs`.

## Core Concepts

### Template Variable Resolution
Template variables like `${base}` and `${hello}` are resolved recursively:
1. `${base}` resolves to the value of the `base` property
2. Nested references like `${hello}` in `isHappy: '${hello}:is-happy'` resolve to the already-resolved value of `hello`
3. Resolution happens at initialization time, not runtime

### Default Behaviors
When configuration is omitted, these defaults apply:

1. **No `_base` specified**: Assumes `{ mapsTo: '.', instanceOf: 'Object', parser: v => JSON.parse(v) }`
2. **No `_<key>` specified**: Assumes `{ mapsTo: '<key>', instanceOf: 'String', parser: v => v }`
3. **`instanceOf: 'Object'`**: Parser defaults to `v => JSON.parse(v)`
4. **`instanceOf: 'String'`**: Parser defaults to `v => v` (identity)
5. **`instanceOf: 'Number'`**: Parser defaults to `v => Number(v)`
6. **`instanceOf: 'Boolean'`**: Parser defaults to `v => v !== null` (presence check)
7. **`instanceOf: 'Array'`**: Parser defaults to `v => JSON.parse(v)`

### Missing Attributes
If an attribute is not present on the element, it should not be added to `initVals`. Only attributes that exist should contribute to the initialization object.

## Example 1: Base Object with JSON

```TypeScript
{
    withAttrs: {
        base: 'greet-ings'
    }
}
```

```HTML
<div greet-ings='{"hello": "world"}'></div>
```

```JavaScript
console.log(initVals);
// {hello: 'world'}
```

**Explanation**: Since no `_base` is specified, it defaults to `{ mapsTo: '.', instanceOf: 'Object' }`. The `instanceOf: 'Object'` triggers JSON parsing, and `mapsTo: '.'` spreads the parsed object into the root of `initVals`.

## Example 2: Base Object with Custom mapsTo

```TypeScript
{
    withAttrs: {
        base: 'greet-ings',
        _base: {
            mapsTo: 'greetings',
            instanceOf: 'Object',
        },
    }
}
```

```HTML
<div greet-ings='{"hello": "world", "goodbye": {"place": "Mars"}}'></div>
```

```JavaScript
console.log(initVals);
// {greetings: {hello: "world", goodbye: {place: "Mars"}}}
```

**Explanation**: The `mapsTo: 'greetings'` places the parsed JSON object under the `greetings` property instead of spreading it to the root.

## Example 3: Simple String Attribute

```TypeScript
{
    withAttrs: {
        base: 'greet-ings',
        hello: '${base}-hello'
    }
}
```

```HTML
<div greet-ings-hello='how-are-you'></div>
```

```JavaScript
console.log(initVals);
// {hello: 'how-are-you'}
```

**Explanation**: 
- `hello: '${base}-hello'` resolves to attribute name `'greet-ings-hello'`
- No `_hello` is specified, so defaults to `{ mapsTo: 'hello', instanceOf: 'String', parser: v => v }`
- The attribute value `'how-are-you'` is passed through as-is

## Example 4: Boolean with Nested Path

```TypeScript
{
   withAttrs: {
        base: 'greet-ings',
        hello: '${base}-hello',
        isHappy: '${hello}:is-happy',
        _isHappy: {
            instanceOf: 'Boolean',
            mapsTo: '?.moods?.personIsHappy'
        }
    }
}
```

```HTML
<div greet-ings-hello:is-happy></div>
```

```JavaScript
console.log(initVals);
// {"?.moods?.personIsHappy": true}
```

**Explanation**:
- `hello` resolves to `'greet-ings-hello'`
- `isHappy` resolves to `'greet-ings-hello:is-happy'`
- `instanceOf: 'Boolean'` defaults to presence check: attribute exists → `true`
- The nested path `'?.moods?.personIsHappy'` is passed as-is to assign-gingerly for processing

## Example 5: Number Attribute with Custom Parser

```TypeScript
{
    withAttrs: {
        base: 'data',
        count: '${base}-count',
        _count: {
            instanceOf: 'Number',
            mapsTo: 'itemCount'
        }
    }
}
```

```HTML
<div data-count='42'></div>
```

```JavaScript
console.log(initVals);
// {itemCount: 42}
```

**Explanation**: `instanceOf: 'Number'` triggers `Number(v)` parser, converting the string `'42'` to the number `42`.

## Example 6: Missing Attribute (No Contribution)

```TypeScript
{
    withAttrs: {
        base: 'data',
        count: '${base}-count',
        label: '${base}-label'
    }
}
```

```HTML
<div data-count='5'></div>
<!-- Note: data-label is missing -->
```

```JavaScript
console.log(initVals);
// {count: '5'}
// label is NOT in initVals because the attribute doesn't exist
```

**Explanation**: Only attributes that exist on the element contribute to `initVals`.

## Example 7: Multiple Attributes with Different Types

```TypeScript
{
    withAttrs: {
        base: 'config',
        name: '${base}-name',
        age: '${base}-age',
        _age: {
            instanceOf: 'Number',
            mapsTo: 'userAge'
        },
        active: '${base}-active',
        _active: {
            instanceOf: 'Boolean',
            mapsTo: 'isActive'
        }
    }
}
```

```HTML
<div config-name='Alice' config-age='30' config-active></div>
```

```JavaScript
console.log(initVals);
// {
//   name: 'Alice',
//   userAge: 30,
//   isActive: true
// }
```

**Explanation**: Demonstrates multiple attributes with different types being parsed and mapped to different property names.

## Example 8: Array Attribute

```TypeScript
{
    withAttrs: {
        base: 'data',
        tags: '${base}-tags',
        _tags: {
            instanceOf: 'Array',
            mapsTo: 'tagList'
        }
    }
}
```

```HTML
<div data-tags='["javascript", "typescript", "web"]'></div>
```

```JavaScript
console.log(initVals);
// {tagList: ["javascript", "typescript", "web"]}
```

**Explanation**: `instanceOf: 'Array'` triggers JSON parsing, expecting a JSON array string.

## Example 9: Custom Parser Function

```TypeScript
{
    withAttrs: {
        base: 'data',
        timestamp: '${base}-timestamp',
        _timestamp: {
            instanceOf: 'Number',
            mapsTo: 'createdAt',
            parser: (v) => v ? new Date(v).getTime() : null
        }
    }
}
```

```HTML
<div data-timestamp='2024-01-15T10:30:00Z'></div>
```

```JavaScript
console.log(initVals);
// {createdAt: 1705315800000}
```

**Explanation**: Custom parser converts ISO date string to Unix timestamp.

## Example 10: Nested Template References

```TypeScript
{
    withAttrs: {
        base: 'x',
        level1: '${base}-level1',
        level2: '${level1}-level2',
        level3: '${level2}-level3'
    }
}
```

```HTML
<div x-level1-level2-level3='deep-value'></div>
```

```JavaScript
console.log(initVals);
// {level3: 'deep-value'}
```

**Explanation**: 
- `level1` resolves to `'x-level1'`
- `level2` resolves to `'x-level1-level2'`
- `level3` resolves to `'x-level1-level2-level3'`
- Demonstrates recursive template resolution

## Example 11: Combining Base Object with Additional Attributes

```TypeScript
{
    withAttrs: {
        base: 'config',
        _base: {
            mapsTo: 'settings',
            instanceOf: 'Object'
        },
        override: '${base}-override',
        _override: {
            mapsTo: 'overrideValue',
            instanceOf: 'String'
        }
    }
}
```

```HTML
<div config='{"theme": "dark", "lang": "en"}' config-override='light'></div>
```

```JavaScript
console.log(initVals);
// {
//   settings: {theme: "dark", lang: "en"},
//   overrideValue: 'light'
// }
```

**Explanation**: Base object and additional attributes can coexist in `initVals`.

## Ambiguities to Address

### 1. Error Handling
**Question**: What should happen if:
- JSON parsing fails for `instanceOf: 'Object'` or `'Array'`?
- A template variable references an undefined key (e.g., `${nonexistent}`)?
- `Number()` parsing results in `NaN`?

**Answer**: 
- Throw an error which includes the string it couldn't parse in the error message.


### 2. Boolean Attribute Values
**Question**: Should boolean attributes support explicit `'true'`/`'false'` strings, or only presence/absence?

Answer:  By default, only set to true if attribute present.  Never set it to false (as the attribute won't exist).  We may allow for nuance based on additional config settings in the future.

### 3. Null vs Undefined Attributes
**Question**: If an attribute exists but has an empty value (`data-count=''`), should it be treated differently than a missing attribute?

**Answer**: Empty string should be passed to the parser, allowing custom handling

### 4. Order of Processing
**Question**: Should attributes be processed in a specific order (e.g., `base` first, then others)?

**Answer**: Process in definition order, but ensure template resolution happens correctly regardless

### 5. Case Sensitivity
**Question**: Are attribute names case-sensitive? HTML attributes are case-insensitive, but the resolved template strings might have specific casing.

**Answer**: Use `getAttribute()` which is case-insensitive in HTML, case-sensitive in XML/SVG

### 6. mapsTo Default for _base
**Question**: The document states `_base` defaults to `mapsTo: '.'`, but should this be explicit in the code?

**Answer**: Confirm that when `_base` is omitted entirely, it defaults to `{ mapsTo: '.', instanceOf: 'Object' }`

## Implementation Checklist

- [x] Implement template variable resolution with cycle detection
- [x] Implement default parser functions for each `instanceOf` type
- [x] Handle missing attributes (don't add to `initVals`)
- [x] Handle empty string attribute values
- [x] Add error handling for JSON parse failures
- [x] Add validation for undefined template variable references
- [x] Ensure `mapsTo` defaults work correctly (especially for `_base`)
- [x] Test nested template references
- [x] Test combination of base object + additional attributes
- [x] Document error handling behavior

## Implementation Complete

The `withAttrs` feature has been implemented with the following components:

### Files Created/Modified:

1. **assign-gingerly/parseWithAttrs.ts** (new) - Core parsing logic
   - Template variable resolution with cycle detection
   - Default parsers for all `instanceOf` types
   - Error handling for parse failures
   
2. **assign-gingerly/parseWithAttrs.js** (generated) - Compiled JavaScript version

3. **assign-gingerly/object-extension.ts** (modified) - Integration point
   - Added import for `parseWithAttrs`
   - Modified `get()` method to parse attributes before spawning
   - Merges attribute-derived `initVals` with existing `initVals`

4. **assign-gingerly/types.d.ts** (already had `withAttrs` property)
   - `IBaseRegistryItem` interface includes `withAttrs?: AttrPatterns<T>`

5. **assign-gingerly/demos/withAttrs-demo.html** (new) - Comprehensive demo
   - All 11 examples from requirements
   - Error handling demonstration
   - Visual pass/fail indicators

### How It Works:

1. When `ElementEnhancementContainer.get()` is called with a `registryItem` that has `withAttrs` defined
2. `parseWithAttrs()` is called with the element and the `withAttrs` configuration
3. Template variables are resolved recursively (e.g., `${base}`, `${hello}`)
4. Attributes are read from the element using the resolved attribute names
5. Values are parsed according to `instanceOf` type or custom parser
6. Results are mapped to property names via `mapsTo`
7. The parsed values become `attrInitVals`
8. `attrInitVals` is merged with any existing `initVals` (existing takes precedence)
9. The merged `initVals` is passed to the spawn constructor

### Testing:

Open `assign-gingerly/demos/withAttrs-demo.html` in a browser to see all examples working.

Each test shows:
- The result from `parseWithAttrs()`
- The expected result
- Pass/fail status




