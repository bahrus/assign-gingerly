# Support for Optionally separating custom parser in AttrConfig

As mentioned multiple times in the README.md and elsewhere, the desire is for as much as possible of the EnhancementConfig to either be JSON serializable, or easily imported as part of the references number, or via some other mechanism (like registering names somewhere)?

I'd like to figure out the approach to be able to import the customParser of AttrConfig, so it can belong to an export js file, or named somewhere.

---

## Recommendations

### Problem Analysis

Currently, `AttrConfig.parser` is a function, which makes it:
1. **Not JSON serializable** - Functions cannot be serialized to JSON
2. **Inline only** - Must be defined inline in the config object
3. **Not reusable** - Same parser logic must be duplicated across configs
4. **Hard to share** - Cannot be easily imported from external modules or registered centrally

### Proposed Solutions

#### Option 1: Named Parser Registry (Recommended)

Create a global registry for named parsers that can be referenced by string name:

```TypeScript
// New parser registry
export class ParserRegistry {
  private parsers = new Map<string, (v: string | null) => any>();
  
  register(name: string, parser: (v: string | null) => any): void {
    this.parsers.set(name, parser);
  }
  
  get(name: string): ((v: string | null) => any) | undefined {
    return this.parsers.get(name);
  }
}

// Global instance
export const globalParserRegistry = new ParserRegistry();

// Update AttrConfig interface
export interface AttrConfig<T = any> {
  // ... existing properties ...
  
  /**
   * Parser function or name of registered parser
   */
  parser?: ((attrValue: string | null) => any) | string;
}
```

**Usage:**

```TypeScript
// Register parsers once (in app initialization)
import { globalParserRegistry } from 'assign-gingerly';

globalParserRegistry.register('timestamp', (v) => 
  v ? new Date(v).getTime() : null
);

globalParserRegistry.register('csv', (v) => 
  v ? v.split(',').map(s => s.trim()) : []
);

// Use by name (JSON serializable!)
const config = {
  withAttrs: {
    base: 'data-',
    created: '${base}created',
    _created: {
      instanceOf: 'Number',
      parser: 'timestamp'  // String reference!
    },
    tags: '${base}tags',
    _tags: {
      parser: 'csv'
    }
  }
};

// Can now be JSON serialized
const json = JSON.stringify(config);
```

**Pros:**
- ✅ JSON serializable (parser is just a string)
- ✅ Reusable across configs
- ✅ Can be imported from external modules
- ✅ Backward compatible (still supports inline functions)
- ✅ Clear separation of concerns

**Cons:**
- ⚠️ Requires registration step
- ⚠️ Runtime error if parser name not found
- ⚠️ Global registry could have naming conflicts

#### Option 2: Import Path References

Allow specifying an import path and export name:

```TypeScript
export interface AttrConfig<T = any> {
  // ... existing properties ...
  
  /**
   * Parser function, name, or import reference
   */
  parser?: 
    | ((attrValue: string | null) => any)
    | string  // Named parser from registry
    | { import: string; export?: string };  // Import path
}
```

**Usage:**

```TypeScript
// parsers.js
export function timestampParser(v) {
  return v ? new Date(v).getTime() : null;
}

export function csvParser(v) {
  return v ? v.split(',').map(s => s.trim()) : [];
}

// config (JSON serializable)
const config = {
  withAttrs: {
    base: 'data-',
    created: '${base}created',
    _created: {
      parser: { 
        import: './parsers.js', 
        export: 'timestampParser' 
      }
    }
  }
};
```

**Pros:**
- ✅ JSON serializable
- ✅ No global registry needed
- ✅ Explicit dependencies
- ✅ Works with ES modules

**Cons:**
- ⚠️ Requires dynamic import (async)
- ⚠️ More complex implementation
- ⚠️ Path resolution issues
- ⚠️ Not backward compatible without migration

#### Option 3: Hybrid Approach (Best of Both)

Combine named registry with optional import paths:

```TypeScript
export interface AttrConfig<T = any> {
  // ... existing properties ...
  
  /**
   * Parser specification:
   * - Function: Inline parser (not JSON serializable)
   * - String: Named parser from registry
   * - Object: Import reference { import: string, export?: string }
   */
  parser?: 
    | ((attrValue: string | null) => any)
    | string
    | { import: string; export?: string };
}
```

**Pros:**
- ✅ Maximum flexibility
- ✅ Backward compatible
- ✅ JSON serializable options
- ✅ Progressive enhancement

**Cons:**
- ⚠️ More complex API
- ⚠️ Multiple ways to do the same thing

### Recommended Implementation: Option 1 (Named Parser Registry)

**Rationale:**
1. **Simplest** - Easy to understand and use
2. **Backward compatible** - Existing inline functions still work
3. **JSON serializable** - String names can be serialized
4. **Performant** - No async imports, immediate lookup
5. **Flexible** - Can register parsers from any source

**Implementation Steps:**

1. Create `ParserRegistry` class in new file `parserRegistry.ts`
2. Export global instance `globalParserRegistry`
3. Update `AttrConfig.parser` type to `((v: string | null) => any) | string`
4. Update `parseWithAttrs` to check if parser is string and lookup in registry
5. Add built-in parsers to registry (optional convenience)
6. Update documentation with examples

**Example Implementation:**

```TypeScript
// parserRegistry.ts
export class ParserRegistry {
  private parsers = new Map<string, (v: string | null) => any>();
  
  register(name: string, parser: (v: string | null) => any): void {
    if (this.parsers.has(name)) {
      console.warn(`Parser "${name}" already registered, overwriting`);
    }
    this.parsers.set(name, parser);
  }
  
  get(name: string): ((v: string | null) => any) | undefined {
    return this.parsers.get(name);
  }
  
  has(name: string): boolean {
    return this.parsers.has(name);
  }
  
  unregister(name: string): boolean {
    return this.parsers.delete(name);
  }
}

export const globalParserRegistry = new ParserRegistry();

// Optional: Register common parsers
globalParserRegistry.register('timestamp', (v) => 
  v ? new Date(v).getTime() : null
);

globalParserRegistry.register('date', (v) => 
  v ? new Date(v) : null
);

globalParserRegistry.register('csv', (v) => 
  v ? v.split(',').map(s => s.trim()) : []
);

globalParserRegistry.register('int', (v) => 
  v ? parseInt(v, 10) : null
);

globalParserRegistry.register('float', (v) => 
  v ? parseFloat(v) : null
);
```

```TypeScript
// In parseWithAttrs.ts
import { globalParserRegistry } from './parserRegistry.js';

// When getting parser:
const parser = typeof config.parser === 'string'
  ? globalParserRegistry.get(config.parser)
  : config.parser || getDefaultParser(config.instanceOf);

if (!parser) {
  throw new Error(`Parser "${config.parser}" not found in registry`);
}
```

### Additional Considerations

1. **Caching Compatibility**: Named parsers work well with `parseCache` since cache key can include parser name
2. **Type Safety**: Consider adding TypeScript generics for parser registry
3. **Scoped Registries**: Could add per-element or per-registry parser registries if needed
4. **Error Handling**: Clear error messages when named parser not found
5. **Documentation**: Examples showing how to organize and import parsers

### Alternative: Keep It Simple

If JSON serialization is not critical, consider:
- **Just use imports**: Import parser functions and reference them directly
- **No registry needed**: Simpler, more explicit
- **Trade-off**: Config objects can't be JSON serialized, but that may be acceptable

```TypeScript
// parsers.js
export const timestampParser = (v) => v ? new Date(v).getTime() : null;

// config.js
import { timestampParser } from './parsers.js';

export const myConfig = {
  withAttrs: {
    base: 'data-',
    created: '${base}created',
    _created: {
      parser: timestampParser  // Direct reference
    }
  }
};
```

This is simpler but requires the config to be in a JS/TS file, not JSON.

### Option 4

Same as option 1, but if the name of the parser is [custom-element-name].functionName, then instead of going to the global registry defined in Option 1, it will do something like:

```JavaScript
const [customElementName, functionName] = parser.split('.');
const ctr = customElements.get(customElementName);
if(ctr === undefined || typeof ctr[functionName] !== 'function') {
    //throw some error
}
parser = ctr[functionName];
```