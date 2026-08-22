# withAttrs Attribute Patterns

## Parsing Attributes with `parseWithAttrs`

The `parseWithAttrs` function provides a declarative way to read and parse HTML attributes and pass the parsed values into the spawned enhancement constructor. 

### Automatic Integration with Enhancement Spawning

**Important**: When using the `enh.get()`, `enh.set`, or `assignGingerly()` methods with registry items, you typically **do not need to call `parseWithAttrs()` manually**. The attribute parsing happens automatically during enhancement spawning when you include a `withAttrs` property in your registry item configuration.

```html
<my-element my-enhancement-count="42" my-enhancement-theme="dark"></my-element>
```

```TypeScript
import 'assign-gingerly/object-extension.js';

class MyEnhancement {
  elementRef;
  ctx;
  count = 0;
  theme = 'light';
  
  constructor(oElement, ctx, initVals) {
    this.element = new WeakRef(oElement);
    this.ctx = ctx;
    // initVals automatically contains parsed attributes!
    if (initVals) {
      Object.assign(this, initVals);
    }
  }
}

const element = document.querySelector('my-element');
const enhancementConfig = {
  spawn: MyEnhancement,
  enhKey: 'myEnh',
  withAttrs: {
    base: 'my-enhancement',
    count: '${base}-count',
    _count: { instanceOf: 'Number' },
    theme: '${base}-theme'

  }
};


// Spawn the enhancement - attributes are automatically parsed!
const instance = element.enh.get(enhancementConfig);
console.log(instance.count);  // 42 (parsed from attribute)
console.log(instance.theme);  // 'dark' (parsed from attribute)
```

<details>
  <summary>Example without enhKey</summary>

```TypeScript
// withAttrs works even without enhKey
class SimpleEnhancement {
  element;
  ctx;
  value = null;
  
  constructor(oElement, ctx, initVals) {
    this.element = oElement;
    this.ctx = ctx;
    if (initVals) {
      Object.assign(this, initVals);
    }
  }
}

const element = document.createElement('div');
element.setAttribute('data-value', 'test123');

const config = {
  spawn: SimpleEnhancement,
  // No enhKey - attributes still parsed!
  withAttrs: {
    base: 'data-',
    value: '${base}value'
  }
};

const instance = element.enh.get(config);
console.log(instance.value);  // 'test123' (parsed from attribute)
```

</details>

<details>
  <summary>How it works</summary>

1. When an enhancement is spawned via `enh.get()`, `enh.set`, or `assignGingerly()`
2. If the registry item has a `withAttrs` property defined
3. `parseWithAttrs(element, registryItem.withAttrs)` is automatically called
4. The parsed attributes are passed to the enhancement constructor as `initVals`
5. If the registry item also has an `enhKey`, the parsed attributes are merged with any existing values from `element.enh[enhKey]` (existing values take precedence)

</details>

> [!NOTE]
> `withAttrs` works with or without `enhKey`. When there's no `enhKey`, the parsed attributes are passed directly to the constructor. When there is an `enhKey`, they're merged with any pre-existing values on the enh container.

### The `enh-` Prefix for Attribute Isolation

The `parseWithAttrs` function supports an `enh-` prefix for attributes to provide better isolation and avoid conflicts, especially for custom elements and SVG elements.

**Behavior by Element Type:**

- **Built-in HTML elements** (div, span, etc.): The `enh-` prefix acts as an **alias**. The function tries `enh-` prefixed attributes first, then falls back to unprefixed attributes.
  ```html
  <!-- Both work for built-in elements -->
  <div data-count="42"></div>
  <div enh-data-count="42"></div>
  
  <!-- enh- prefix takes precedence -->
  <div data-count="10" enh-data-count="42"></div>  <!-- Uses 42 -->
  ```

- **Custom elements and SVG elements**: The `enh-` prefix is **strictly enforced** by default. Only `enh-` prefixed attributes are read.
  ```html
  <!-- Only enh- prefixed attributes work -->
  <my-element data-count="42"></my-element>           <!-- Ignored -->
  <my-element enh-data-count="42"></my-element>       <!-- Works -->
  
  <svg enh-data-theme="dark"></svg>                   <!-- Works -->
  <svg data-theme="dark"></svg>                       <!-- Ignored -->
  ```

**Overriding with `allowUnprefixed`:**

For custom elements and SVG, you can opt-in to reading unprefixed attributes by specifying a pattern (string or RegExp) that the element's tag name must match:

```TypeScript
// Allow unprefixed for elements matching pattern
registry.push({
  spawn: MyEnhancement,
  enhKey: 'myEnh',
  allowUnprefixed: '^my-',  // Only for elements starting with "my-"
  withAttrs: {
    base: 'data-',
    count: '${base}count',
    _count: { instanceOf: 'Number' }
  }
});

// Or use RegExp for more complex patterns
registry.push({
  spawn: MyEnhancement,
  enhKey: 'myEnh',
  allowUnprefixed: /^(my-|app-)/,  // For "my-*" or "app-*" elements
  withAttrs: {
    base: 'data-',
    count: '${base}count',
    _count: { instanceOf: 'Number' }
  }
});
```

<details>
  <summary>Why use `enh-` prefix?</summary>

1. **Avoid conflicts**: Custom elements may use unprefixed attributes for their own purposes
2. **Clear intent**: Makes it obvious which attributes are for enhancements
3. **Future-proof**: Protects against future attribute additions to custom elements
4. **Consistency**: Provides a standard convention across all enhanced elements
5. **Selective override**: Pattern-based `allowUnprefixed` lets you opt-in specific element families while maintaining strict isolation for others

</details>

<details>
  <summary>Manual Usage</summary>

While automatic parsing is the recommended approach, you can also call `parseWithAttrs()` manually when needed.

When calling `parseWithAttrs()` manually, pass the pattern as the third (optional) parameter:

```TypeScript
// Allow unprefixed only for elements matching pattern
const result = parseWithAttrs(element, attrPatterns, '^my-');

// Or with RegExp
const result = parseWithAttrs(element, attrPatterns, /^(my-|app-)/);
```

**Pattern Matching:**
- The pattern is tested against the element's **lowercase tag name**
- String patterns are automatically converted to RegExp
- If the tag name matches, unprefixed attributes are allowed (but `enh-` still takes precedence)
- If the tag name doesn't match, only `enh-` prefixed attributes are read

**Example:**
```html
<my-widget data-count="42"></my-widget>
<other-widget data-count="42"></other-widget>
```

```TypeScript
// Pattern: '^my-' (only matches "my-widget")
const result1 = parseWithAttrs(
  document.querySelector('my-widget'),
  { base: 'data-', count: '${base}count', _count: { instanceOf: 'Number' } },
  '^my-'
);
// result1.count = 42 (unprefixed allowed because tag matches)

const result2 = parseWithAttrs(
  document.querySelector('other-widget'),
  { base: 'data-', count: '${base}count', _count: { instanceOf: 'Number' } },
  '^my-'
);
// result2.count = undefined (unprefixed ignored because tag doesn't match)
```

### Basic Usage

```TypeScript
import { parseWithAttrs } from 'assign-gingerly/parseWithAttrs';

const element = document.querySelector('#myElement');
const config = parseWithAttrs(element, {
  base: 'data-',
  count: '${base}count',
  _count: {
    instanceOf: 'Number',
    mapsTo: 'itemCount'
  }
});
```

### Error Handling

The function throws descriptive errors for common issues:

```TypeScript
// Circular reference
parseWithAttrs(element, {
  a: '${b}',
  b: '${a}'  // Error: Circular reference detected
});

// Undefined variable
parseWithAttrs(element, {
  name: '${missing}'  // Error: Undefined template variable: missing
});

// Invalid JSON
// HTML: <div data-obj='{invalid}'></div>
parseWithAttrs(element, {
  base: 'data-',
  obj: '${base}obj',
  _obj: { instanceOf: 'Object' }
  // Error: Failed to parse JSON: "{invalid}"
});

// Invalid number
// HTML: <div data-count="abc"></div>
parseWithAttrs(element, {
  base: 'data-',
  count: '${base}count',
  _count: { instanceOf: 'Number' }
  // Error: Failed to parse number: "abc"
});
```

</details>

**Base Attribute Validation:**

The `base` attribute must contain either a dash (`-`) or a non-ASCII character to prevent conflicts with native attributes:

```TypeScript
// Valid base attributes
const enhConfig1 = { base: 'data-config' };     // Has dash
const enhConfig2 =  { base: '??-theme' });        // Has non-ASCII (and dash)

// Invalid - throws error
const enhConig3 = { base: 'config' };          // No dash or non-ASCII
```


<details>
  <summary>AttrPatterns Configuration</summary>

The `parseWithAttrs` function accepts an `AttrPatterns` object that defines:

1. **Attribute name templates**: String values with `${variable}` placeholders
2. **Configuration objects**: Properties prefixed with `_` that specify parsing behavior

```TypeScript
interface AttrPatterns<T> {
  base?: string;                    // Base attribute name prefix
  _base?: AttrConfig<T>;            // Configuration for base attribute
  [key: string]: string | AttrConfig<T>;  // Other attributes and configs
}

interface AttrConfig<T> {
  mapsTo?: keyof T | '.';           // Target property name (or '.' to spread)
  sourceOfTruth?: boolean;          // Mark attribute as source-of-truth (mirrored by property)
  instanceOf?: string | Function;   // Type for default parser
  parser?: 
    | ((v: string | null) => any)   // Inline parser function
    | string                         // Named parser from globalParserRegistry
    | [string, string];              // [CustomElementName, StaticMethodName]
}
```
</details>

### Template Variables

Attribute names support template variables using `${varName}` syntax:

```TypeScript
// HTML: <div data-user-name="Alice" data-user-age="30"></div>

const result = parseWithAttrs(element, {
  base: 'data-',
  user: '${base}user',
  name: '${user}-name',
  age: '${user}-age'
});
// Result: { name: 'Alice', age: '30' }
```

**Deep Nesting:**

Template variables can reference other template variables to any depth, creating hierarchical attribute naming patterns:

```TypeScript
// HTML: <div data-app-user-profile-name="Alice" data-app-user-profile-email="alice@example.com"></div>

const result = parseWithAttrs(element, {
  base: 'data-',
  app: '${base}app',
  user: '${app}-user',
  profile: '${user}-profile',
  name: '${profile}-name',
  email: '${profile}-email'
});
// Result: { name: 'Alice', email: 'alice@example.com' }

// The resolution chain: base ? app ? user ? profile ? name/email
// Resolves to: data-app-user-profile-name and data-app-user-profile-email
```

**Benefits of hierarchical variables:**
- Build complex attribute names from simple parts
- Maintain consistency across related attributes
- Easy to refactor by changing a single variable
- Self-documenting attribute structure

Template variables are resolved recursively and cached for performance. Circular references are detected and throw an error.

### Type Parsing with instanceOf

The `instanceOf` property determines how attribute values are parsed:

```TypeScript
// HTML: <div data-count="42" data-active data-tags='["a","b"]'></div>

const result = parseWithAttrs(element, {
  base: 'data-',
  count: '${base}count',
  _count: { instanceOf: 'Number' },
  
  active: '${base}active',
  _active: { instanceOf: 'Boolean' },  // Presence check
  
  tags: '${base}-tags',
  _tags: { instanceOf: 'Array' }
});
// Result: { count: 42, active: true, tags: ['a', 'b'] }
```

**Built-in type parsers:**
- `String`: Identity (default)
- `Number`: Parses numeric values, throws on invalid numbers
- `Boolean`: Presence check (attribute exists = true)
- `Object`: Parses JSON objects
- `Array`: Parses JSON arrays

### Custom Parsers

Provide a custom `parser` function for specialized parsing:

```TypeScript
// HTML: <div data-timestamp="2024-01-15T10:30:00Z"></div>

const result = parseWithAttrs(element, {
  base: 'data-',
  timestamp: '${base}timestamp',
  _timestamp: {
    mapsTo: 'createdAt',
    parser: (v) => v ? new Date(v).getTime() : null
  }
});
// Result: { createdAt: 1705315800000 }
```

### Named Parsers for Reusability and JSON Serialization

Instead of inline functions, you can reference parsers by name, making configs JSON serializable and parsers reusable:

```TypeScript
import { globalParserRegistry, parseWithAttrs } from 'assign-gingerly';

// Register parsers once (typically in app initialization)
globalParserRegistry.register('timestamp', (v) => 
  v ? new Date(v).getTime() : null
);

globalParserRegistry.register('csv', (v) => 
  v ? v.split(',').map(s => s.trim()) : []
);

// Use by name - config is now JSON serializable!
const config = {
  base: 'data-',
  created: '${base}created',
  _created: {
    parser: 'timestamp'  // String reference instead of function
  },
  tags: '${base}tags',
  _tags: {
    parser: 'csv'
  }
};

// Can serialize to JSON
const json = JSON.stringify(config);

// Use the config
const result = parseWithAttrs(element, config);
```

#### **Built-in Named Parsers:**

[TODO]: Check if this is all needed

The following parsers are pre-registered in `globalParserRegistry`:

- `'timestamp'` - Parses ISO date string to Unix timestamp (milliseconds)
- `'date'` - Parses string to Date object
- `'csv'` - Splits comma-separated values into trimmed array
- `'int'` - Parses integer with `parseInt(v, 10)`
- `'float'` - Parses float with `parseFloat(v)`
- `'boolean'` - Presence check (same as `instanceOf: 'Boolean'`)
- `'json'` - Parses JSON (same as `instanceOf: 'Object'` or `'Array'`)

**Custom Element Static Method Parsers:**

You can reference static methods on custom elements using tuple syntax `[elementName, methodName]`:

```TypeScript
class MyWidget extends HTMLElement {
  static parseSpecialFormat(v) {
    return v ? v.toUpperCase() : null;
  }
  
  static parseWithPrefix(v) {
    return v ? `PREFIX:${v}` : null;
  }
}
customElements.define('my-widget', MyWidget);

// Reference custom element parsers using tuple syntax
const config = {
  base: 'data-',
  value: '${base}value',
  _value: {
    parser: ['my-widget', 'parseSpecialFormat']  // [element-name, methodName]
  },
  title: '${base}title',
  _title: {
    parser: ['my-widget', 'parseWithPrefix']
  }
};

const result = parseWithAttrs(element, config);
```

**Parser Resolution:**

When a parser is specified, it can be:

1. **Inline function** - `parser: (v) => v.toUpperCase()` - Used directly
2. **String reference** - `parser: 'timestamp'` - Looks up in `globalParserRegistry`
3. **Tuple reference** - `parser: ['my-widget', 'parseMethod']` - Looks up static method on custom element constructor

**Error Handling:**

The tuple syntax provides clear error messages:

```TypeScript
// Element not found
parser: ['non-existent', 'method']
// Error: Cannot resolve parser [non-existent, method]: custom element "non-existent" not found

// Method not found
parser: ['my-widget', 'nonExistent']
// Error: Cannot resolve parser [my-widget, nonExistent]: static method "nonExistent" not found on custom element "my-widget"

// String not found in registry
parser: 'unknown'
// Error: Parser "unknown" not found in globalParserRegistry. If you want to reference a custom element static method, use tuple syntax: ["element-name", "methodName"]
```

**Example: Organizing Parsers**

```TypeScript
// parsers.js - Centralized parser definitions
export function registerCommonParsers(registry) {
  registry.register('uppercase', (v) => v ? v.toUpperCase() : null);
  registry.register('lowercase', (v) => v ? v.toLowerCase() : null);
  registry.register('trim', (v) => v ? v.trim() : null);
  registry.register('phone', (v) => v ? v.replace(/\D/g, '') : null);
}

// app.js - Register at startup
import { globalParserRegistry } from 'assign-gingerly';
import { registerCommonParsers } from './parsers.js';

registerCommonParsers(globalParserRegistry);

// Now all configs can use these parsers by name
```

**Benefits of Named Parsers:**

- ? **JSON serializable** - Configs can be stored/transmitted as JSON
- ? **Reusable** - Define once, use everywhere
- ? **Maintainable** - Update parser logic in one place
- ? **Testable** - Test parsers independently
- ? **Discoverable** - `globalParserRegistry.getNames()` lists all available parsers
- ? **Backward compatible** - Inline functions still work

**Mixing Inline and Named Parsers:**

```TypeScript
const config = {
  base: 'data-',
  created: '${base}created',
  _created: {
    parser: 'timestamp'  // Named parser
  },
  special: '${base}special',
  _special: {
    parser: (v) => v ? v.split('').reverse().join('') : null  // Inline
  }
};
```

### Property Mapping with mapsTo

The `mapsTo` property controls where parsed values are placed:

```TypeScript
// HTML: <div data-count="5"></div>

const result = parseWithAttrs(element, {
  base: 'data-',
  count: '${base}count',
  _count: {
    instanceOf: 'Number',
    mapsTo: 'itemCount'  // Maps to different property name
  }
});
// Result: { itemCount: 5 }
```

**Special value `'.'`**: Spreads the parsed object into the root:

```TypeScript
// HTML: <div data-config='{"theme":"dark","lang":"en"}'></div>

const result = parseWithAttrs(element, {
  base: 'data-config',
  _base: {
    instanceOf: 'Object',
    mapsTo: '.'  // Spread into root
  }
});
// Result: { theme: 'dark', lang: 'en' }
```

### Default Values with valIfNull

The `valIfNull` property allows us to specify default values when attributes are missing:

```TypeScript
// HTML: <div></div>  (no attributes)

const result = parseWithAttrs(element, {
  base: 'data-',
  theme: '${base}theme',
  _theme: {
    instanceOf: 'String',
    valIfNull: 'light'  // Default when attribute is missing
  },
  count: '${base}count',
  _count: {
    instanceOf: 'Number',
    valIfNull: 0  // Default to 0
  }
});
// Result: { theme: 'light', count: 0 }
```

**How it works:**
- **Attribute missing**: If the attribute doesn't exist and `valIfNull` is defined, the default value is used **without calling the parser**
- **Attribute present**: If the attribute exists (even if empty string), the parser is called normally and `valIfNull` is ignored
- **No valIfNull**: If `valIfNull` is undefined and the attribute is missing, the property is not added to the result (current behavior)

**Important notes:**
1. **Parser is bypassed**: When `valIfNull` is used, the parser is NOT called - the default value is used as-is
2. **Empty string vs missing**: `valIfNull` only applies when the attribute is completely absent. If the attribute exists but is empty (`data-count=""`), the parser IS called
3. **Any value allowed**: `valIfNull` can be any JavaScript value: string, number, boolean, object, array, null, etc.
4. **Falsy values work**: Even falsy values like `0`, `false`, `''`, or `null` are valid defaults

**Examples with different types:**

```TypeScript
// Object default
const result1 = parseWithAttrs(element, {
  base: 'config-',
  settings: '${base}settings',
  _settings: {
    instanceOf: 'Object',
    valIfNull: { enabled: false, mode: 'auto' }
  }
});
// Result: { settings: { enabled: false, mode: 'auto' } }

// Boolean default
const result2 = parseWithAttrs(element, {
  base: 'feature-',
  enabled: '${base}enabled',
  _enabled: {
    instanceOf: 'Boolean',
    valIfNull: false
  }
});
// Result: { enabled: false }

// Array default
const result3 = parseWithAttrs(element, {
  base: 'data-',
  items: '${base}items',
  _items: {
    instanceOf: 'Array',
    valIfNull: []
  }
});
// Result: { items: [] }

// null as default
const result4 = parseWithAttrs(element, {
  base: 'data-',
  value: '${base}value',
  _value: {
    instanceOf: 'String',
    valIfNull: null
  }
});
// Result: { value: null }
```

**Comparison: Empty string vs missing attribute:**

```html
<!-- Attribute is missing -->
<div></div>

<!-- Attribute exists but is empty -->
<div data-count=""></div>
```

```TypeScript
const config = {
  base: 'data-',
  count: '${base}count',
  _count: {
    instanceOf: 'Number',
    valIfNull: 99
  }
};

// Missing attribute - uses valIfNull
const result1 = parseWithAttrs(document.querySelector('div:nth-child(1)'), config);
// Result: { count: 99 }

// Empty string - calls parser (returns null for empty Number)
const result2 = parseWithAttrs(document.querySelector('div:nth-child(2)'), config);
// Result: { count: null }
```

### Performance Optimization with parseCache

The `parseCache` property enables caching of parsed attribute values to improve performance when the same attribute values appear repeatedly throughout the document:

```TypeScript
// HTML: Multiple elements with same attribute values
// <div data-config='{"theme":"dark","size":"large"}'></div>
// <div data-config='{"theme":"dark","size":"large"}'></div>
// <div data-config='{"theme":"dark","size":"large"}'></div>

const config = {
  base: 'data-',
  config: '${base}config',
  _config: {
    instanceOf: 'Object',
    parseCache: 'shared'  // Cache and reuse parsed objects
  }
};

// First parse - parses and caches
const result1 = parseWithAttrs(element1, config);

// Subsequent parses - returns cached value (no parsing)
const result2 = parseWithAttrs(element2, config);
const result3 = parseWithAttrs(element3, config);
```

**Cache Strategies:**

1. **`'shared'`**: Returns the same object reference from cache
   - **Fastest**: No cloning overhead
   - **Risk**: Enhancements that mutate the object will affect all instances
   - **Best for**: Immutable data or when you trust enhancements not to mutate

2. **`'cloned'`**: Returns a structural clone of the cached object
   - **Safer**: Each instance gets its own copy
   - **Slower**: Uses `structuredClone()` which has overhead
   - **Best for**: Mutable data or when enhancements might modify values

**Examples:**

```TypeScript
// Shared cache - fast but requires discipline
const sharedConfig = {
  base: 'data-',
  settings: '${base}settings',
  _settings: {
    instanceOf: 'Object',
    parseCache: 'shared'  // All instances share same object
  }
};

// Cloned cache - safer for mutable data
const clonedConfig = {
  base: 'data-',
  state: '${base}state',
  _state: {
    instanceOf: 'Object',
    parseCache: 'cloned'  // Each instance gets a copy
  }
};

// Custom parser with caching
let parseCount = 0;
const customConfig = {
  base: 'data-',
  timestamp: '${base}timestamp',
  _timestamp: {
    parser: (v) => {
      parseCount++;  // Track parse calls
      return v ? new Date(v).getTime() : null;
    },
    parseCache: 'shared'  // Parser only called once per unique value
  }
};
```

**Important Notes:**

1. **Parser purity**: Parsers should be pure functions (no side effects) when using caching
2. **Boolean types**: Caching is skipped for Boolean types (presence check doesn't benefit)
3. **Cache scope**: Cache is module-level and persists across all `parseWithAttrs()` calls
4. **Cache key**: Values are cached per `(instanceOf, parserType, attributeValue)` tuple
5. **Memory**: Cache grows with unique attribute values encountered (no automatic cleanup)
6. **Browser support**: `'cloned'` strategy requires `structuredClone()` (modern browsers)

**Performance Considerations:**

- **Shared cache**: Best for simple objects, arrays, or when parsing is expensive
- **Cloned cache**: Overhead may negate benefits for simple values (strings, numbers)
- **No cache**: Better for unique values or when parsing is trivial
- **Custom parsers**: Caching is most beneficial when parser does expensive operations (Date parsing, complex transformations)

**Example: Shared cache mutation risk**

```TypeScript
const config = {
  base: 'data-',
  items: '${base}items',
  _items: {
    instanceOf: 'Array',
    parseCache: 'shared'
  }
};

// HTML: <div data-items='[1,2,3]'></div>

const result1 = parseWithAttrs(element1, config);
result1.items.push(4);  // Mutation!

const result2 = parseWithAttrs(element2, config);
console.log(result2.items);  // [1,2,3,4] - mutation is visible!
```

**Example: Cloned cache safety**

```TypeScript
const config = {
  base: 'data-',
  items: '${base}items',
  _items: {
    instanceOf: 'Array',
    parseCache: 'cloned'  // Safe from mutations
  }
};

const result1 = parseWithAttrs(element1, config);
result1.items.push(4);  // Mutation

const result2 = parseWithAttrs(element2, config);
console.log(result2.items);  // [1,2,3] - original value preserved
```

### Source of truth

The `sourceOfTruth` flag on an `AttrConfig` marks an attribute whose value should stay in sync with a host property of the same name. `parseWithAttrs` itself does not enforce this synchrony; it only records the intent in the parsed configuration so that higher-level features can act on it.

```TypeScript
withAttrs: {
  name: 'name',
  _name: { sourceOfTruth: true }
}
```

A common consumer is the [truth-sourcer](https://github.com/bahrus/truth-sourcer) feature. When a custom element declares a source-of-truth attribute:

1. The host element lists the attribute in `static observedAttributes`.
2. The host property is initialized to a non-null value so the feature can infer its type (`string`, `boolean`, or `number`).
3. The host dispatches a propagator event when the property changes.
4. The feature reflects the property value back to the attribute via `setAttribute` (or `removeAttribute` for `null` / `false`).
5. When the attribute changes (for example from server-side rendering or DOM manipulation), the feature coerces the string value to the inferred type and sets the host property.

This gives a small, controlled set of attributes that mirror properties exactly, which is useful for attributes like the platform's native `name` that genuinely need to be present in the DOM. For most custom element state, prefer one-way initial attributes or internal properties instead.

See the [truth-sourcer README](https://github.com/bahrus/truth-sourcer) for a complete working example.

### Base Attribute

The special `base` property handles a single attribute that spreads into the result:

```TypeScript
// HTML: <div data-greetings='{"hello":"world","goodbye":"Mars"}'></div>

const result = parseWithAttrs(element, {
  base: 'data-greetings'
  // Default: spreads into root with Object parser
});
// Result: { hello: 'world', goodbye: 'Mars' }

// With custom mapsTo:
const result2 = parseWithAttrs(element, {
  base: 'data-greetings',
  _base: {
    mapsTo: 'greetings',
    instanceOf: 'Object'
  }
});
// Result: { greetings: { hello: 'world', goodbye: 'Mars' } }
```

### Best Practices

1. **Use base for common prefixes**: Reduces repetition in attribute names
2. **Leverage template variables**: Build complex attribute names from simple parts
3. **Specify instanceOf**: Ensures proper type conversion
4. **Use mapsTo for clarity**: Map attribute names to meaningful property names
5. **Combine with assignGingerly**: Use nested paths (`?.`) for deep property assignment
6. **Handle missing attributes**: Non-existent attributes are skipped (except Boolean types)

### Nested Paths with assignGingerly

Combine `parseWithAttrs` with `assignGingerly` for nested property assignment:

```TypeScript
// HTML: <div data-height="100px" data--is-happy></div>

const element = document.createElement('div');
const attrs = parseWithAttrs(element, {
  base: 'data-',
  height: '${base}height',
  _height: {
    mapsTo: '?.style?.height'
  },
  isHappy: '${base}-is-happy',
  _isHappy: {
    instanceOf: 'Boolean',
    mapsTo: '?.moods?.personIsHappy'
  }
});

assignGingerly(element, attrs);
// element.style.height === '100px'
// element.moods.personIsHappy === true
```


## Attribute patterns for custom element features

Custom element features use `withAttrs` in the same way as enhancements, but attributes are always read unprefixed (there is no `enh-` prefix for features). The parsed values are merged with any programmatic `initVals`; programmatic values take precedence.

```JavaScript
customElements.assignFeatures(ClubMember, {
    photoTaker: {
        spawn: PhotoTakerImpl,
        withAttrs: {
            base: 'photo',
            resolution: '${base}-resolution',
            format: '${base}-format'
        }
    }
});
```

```HTML
<club-member photo-resolution="4k" photo-format="png"></club-member>
```

This parses into `initVals = { resolution: '4k', format: 'png' }`. By default, non-underscore keys are assumed to be strings with `mapsTo` equal to the key name. The `_key` form is only needed to override defaults  -- for example, to parse as `Number`, map to a different property name, or use a custom parser:

```JavaScript
withAttrs: {
    base: 'photo',
    resolution: '${base}-resolution',
    // Override: parse as Number instead of String
    _resolution: { instanceOf: 'Number', mapsTo: 'resolutionPx' },
    format: '${base}-format'
    // No _format needed -- defaults to String, mapsTo: 'format'
}
```

**Merge priority (lowest to highest):**
1. Attribute-parsed values (`withAttrs`)
2. Programmatic `initVals` (from `captureFeatureInitVals`)

## Building CSS Queries with `buildCSSQuery`

The `buildCSSQuery` function generates CSS selector strings that match elements with attributes defined in an enhancement configuration's `withAttrs`. This is particularly useful for libraries like mount-observer that need to find elements that should be enhanced.

### Basic Usage

```TypeScript
import { buildCSSQuery } from 'assign-gingerly';

const config = {
  spawn: MyEnhancement,
  withAttrs: {
    base: 'my-component',
    theme: '${base}-theme'
  }
};

const query = buildCSSQuery(config, 'div, span');
console.log(query);
// 'div[my-component], span[my-component], div[enh-my-component], span[enh-my-component], 
//  div[my-component-theme], span[my-component-theme], div[enh-my-component-theme], span[enh-my-component-theme]'

// Use with querySelector
const elements = document.querySelectorAll(query);
```

**Without selectors (matches any element):**

```TypeScript
// Omit the selectors parameter
const query = buildCSSQuery(config);
// or explicitly pass empty string
const query = buildCSSQuery(config, '');

console.log(query);
// '[my-component], [enh-my-component], [my-component-theme], [enh-my-component-theme]'

// Matches any element with these attributes
const elements = document.querySelectorAll(query);
```

### How It Works

`buildCSSQuery` creates a cross-product of:
1. **Selectors**: The CSS selectors you provide (e.g., `'div, span'`)
2. **Attributes**: All attribute names from `withAttrs` (resolving template variables)
3. **Prefixes**: Both unprefixed and `enh-` prefixed versions

This ensures you find all elements that might be enhanced, regardless of whether they use the `enh-` prefix or not.

### Template Variable Resolution

Template variables in `withAttrs` are automatically resolved:

```TypeScript
const config = {
  spawn: BeABeacon,
  withAttrs: {
    base: 'be-a-beacon',
    theme: '${base}-theme',
    size: '${base}-size'
  }
};

buildCSSQuery(config, 'template, script');
// Returns selectors for: be-a-beacon, be-a-beacon-theme, be-a-beacon-size
// Each with both prefixed and unprefixed versions
```

### Complex Selectors

The function supports any valid CSS selector:

```TypeScript
const config = {
  spawn: MyEnhancement,
  withAttrs: {
    base: 'data-enhanced'
  }
};

// Classes and IDs
buildCSSQuery(config, 'div.highlight, span#special');
// 'div.highlight[data-enhanced], span#special[data-enhanced], ...'

// Combinators
buildCSSQuery(config, 'div > span, ul li');
// 'div > span[data-enhanced], ul li[data-enhanced], ...'

// Pseudo-classes
buildCSSQuery(config, 'div:hover, span:first-child');
// 'div:hover[data-enhanced], span:first-child[data-enhanced], ...'

// Attribute selectors
buildCSSQuery(config, 'div[existing-attr]');
// 'div[existing-attr][data-enhanced], ...'
```

### Underscore-Prefixed Keys Excluded

Configuration keys starting with `_` are excluded from the query:

```TypeScript
const config = {
  spawn: MyEnhancement,
  withAttrs: {
    base: 'my-attr',
    _base: {
      mapsTo: 'something'  // Config only, not an attribute
    },
    theme: '${base}-theme',
    _theme: {
      instanceOf: 'String'  // Config only
    }
  }
};

buildCSSQuery(config, 'div');
// Only includes: my-attr and my-attr-theme
// Does NOT include: _base or _theme
```

### Edge Cases

**Omitting or empty selectors return attribute-only selectors:**
```TypeScript
const config = {
  spawn: MyClass,
  withAttrs: {
    base: 'my-attr',
    theme: '${base}-theme'
  }
};

buildCSSQuery(config);  // Omit selectors parameter
// or
buildCSSQuery(config, '');  // Empty string
// Both return: '[my-attr], [enh-my-attr], [my-attr-theme], [enh-my-attr-theme]'
// Matches any element with these attributes
```

**Empty withAttrs returns empty string:**
```TypeScript
buildCSSQuery({ spawn: MyClass }, 'div');  // '' (no withAttrs)
buildCSSQuery({ spawn: MyClass, withAttrs: {} }, 'div');  // '' (empty withAttrs)
```

**Deduplication:**
```TypeScript
buildCSSQuery(config, 'div, div, div');
// Duplicates are removed automatically
```

**Whitespace handling:**
```TypeScript
buildCSSQuery(config, '  div  ,  span  ,  p  ');
// Whitespace is trimmed automatically
```

### Use Cases

1. **Mount Observer Integration**: Find elements that need enhancement
   ```TypeScript
   // Match any element with the attributes
   const matching = buildCSSQuery(enhancementConfig);
   const observer = new MountObserver({
      matching,
      do: (mountedElement) => {
        enhance(mountedElement);
      }
   });
   ```

   See [Mount-Observer](https://github.com/bahrus/mount-observer).

2. **Specific Element Types**: Enhance only certain element types
   ```TypeScript
   const query = buildCSSQuery(config, 'template, script');
   document.querySelectorAll(query).forEach(el => {
     const instance = el.enh.get(config);
   });
   ```

3. **Conditional Enhancement**: Find elements in specific contexts
   ```TypeScript
   const query = buildCSSQuery(config, '.container > div');
   const elements = document.querySelectorAll(query);
   ```

### API Reference

```TypeScript
function buildCSSQuery(
  config: EnhancementConfig,
  selectors?: string
): string
```

**Parameters:**
- `config`: Enhancement configuration with `withAttrs` property
- `selectors` (optional): Comma-separated CSS selectors (e.g., `'div, span'`)
  - If omitted or empty string, returns attribute selectors without element prefix
  - This matches any element with the specified attributes

**Returns:**
- CSS query string with cross-product of selectors and attributes
- If selectors is omitted or empty: returns attribute-only selectors (e.g., `'[attr], [enh-attr]'`)
- If withAttrs is missing or empty: returns empty string

**Throws:**
- Error if template variables have circular references
- Error if template variables reference undefined keys

### Performance Notes

- The function is synchronous and fast
- Resulting queries can be long with many attributes, but CSS engines handle this efficiently
- Queries are deduplicated automatically
- Consider caching the result if calling repeatedly with the same config

<!--

### Complete Example

```TypeScript
// HTML: <user-card 
//   data-config='{"theme":"dark"}' 
//   data-config-name="Alice" 
//   data-config-age="30" 
//   data-config-active
// ></user-card>

const element = document.querySelector('user-card');
const result = parseWithAttrs(element, {
  base: 'data-config',
  _base: {
    mapsTo: 'settings',
    instanceOf: 'Object'
  },
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
});

console.log(result);
// {
//   settings: { theme: 'dark' },
//   name: 'Alice',
//   userAge: 30,
//   isActive: true
// }
```

-->