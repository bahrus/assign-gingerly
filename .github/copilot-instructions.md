# assign-gingerly AI Coding Guidelines

## Project Overview

**assign-gingerly** is a utility library that extends `Object.assign` with two key capabilities:
1. **Nested property merging** via `?.` notation (e.g., `'?.style?.height': '15px'`)
2. **Dependency injection** through a registry pattern with Symbol-based mappings

The library is purely functional with no external runtime dependencies, published as ES modules.

## Architecture & Key Components

### Core Concepts

**Nested Path Pattern (Dotted Paths)**
- Keys starting with `?.` trigger nested object creation instead of flat assignment
- Example: `assignGingerly(obj, {'?.a?.b?.c': value})` creates deeply nested structures
- The `?.` prefix is stripped before creating intermediate objects (see [assignGingerly.ts](assignGingerly.ts#L82))
- Non-nested properties are merged with recursive application for plain objects

**Dependency Injection via Registry**
- Symbol-based mappings allow classes to be registered as injectable services
- `BaseRegistry` stores `IBaseRegistryItem` entries (spawn class + symbol-to-property map)
- When symbols are assigned to targets, instances are lazily spawned and cached via `WeakMap`
- The `.set` proxy (lines 159-190) enables reactive updates to instances

### Main Files

- [assignGingerly.ts](assignGingerly.ts) - Core implementation (245 lines)
  - `assignGingerly()` function - two-pass: handles nested keys, then symbol-based DI
  - `BaseRegistry` class - registry for dependency injection mappings
  - Helper functions: `parsePath()`, `isNestedPath()`, `ensureNestedPath()`, Symbol parsing
- [object-extension.ts](object-extension.ts) - Adds `Object.prototype.assignGingerly()` method
- [types.d.ts](types.d.ts) - TypeScript type declarations for consumer packages

## Critical Implementation Details

**Two-Pass Processing**
1. **First pass** (lines 107-136): Handles all string/nested keys
   - Recursive merging for plain objects (not arrays)
   - Nested path creation via `ensureNestedPath()`
2. **Second pass** (lines 138-157): Symbol key handling for DI
   - Lazily instantiates registered classes
   - Caches instances in `instanceMap` (WeakMap on target object)
   - Maps symbols to instance properties via registry

**Symbol Parsing**
- JSON cannot encode Symbols, so string keys like `[Symbol.for('id')]` are supported
- `isSymbolForKey()` and `parseSymbolForKey()` convert these to actual symbols
- Registry lookup uses both direct symbol keys and parsed Symbol.for keys

**Edge Case Handling**
- Arrays are **not** recursed into (treated as leaf values) - see [edge-cases.spec.ts](tests/edge-cases.spec.ts#L5)
- Null values are treated as non-objects (unlike `Object.assign`)
- Non-object targets return unchanged
- Symbol keys in source are preserved and processed in second pass

## Testing & Quality

**Test Organization** (Playwright)
- [tests/basic.spec.ts](tests/basic.spec.ts) - Core Object.assign compatibility
- [tests/nested.spec.ts](tests/nested.spec.ts) - Dotted path creation and merging
- [tests/dependency-injection.spec.ts](tests/dependency-injection.spec.ts) - Registry & Symbol DI
- [tests/edge-cases.spec.ts](tests/edge-cases.spec.ts) - Arrays, primitives, special values
- [tests/json-symbol-support.spec.ts](tests/json-symbol-support.spec.ts) - Symbol.for parsing
- [tests/readme-examples.spec.ts](tests/readme-examples.spec.ts) - Live README examples

**Commands**
- `npm test` - Run full Playwright test suite
- TypeScript compiles only [assignGingerly.ts](assignGingerly.ts) (tsconfig.json line 9)

## Coding Patterns & Conventions

1. **Path Processing**: Always call `parsePath()` to normalize dotted keys (strips `?`)
2. **Recursive Merging**: Check `typeof value === 'object' && value !== null && !Array.isArray(value)` before recursing
3. **Registry Access**: Pass via `options?.registry`; normalize to instance if class is provided
4. **WeakMap for Caching**: Use for instance storage keyed on target object to avoid memory leaks
5. **TypeScript**: Strict mode enabled; use generics for flexible registries (e.g., `IBaseRegistryItem<T>`)

## Build & Distribution

- **Module Format**: ESNext (import/export)
- **Export Point**: [assignGingerly.js](assignGingerly.js) (transpiled from .ts)
- **Type Definitions**: [types.d.ts](types.d.ts) for consumers
- **No Build System**: TypeScript compiler directly outputs to root
- **Package**: Published as `assign-gingerly` on NPM with bundled .js/.d.ts files

## Common Tasks

**Adding a Feature**: 
1. Implement in .ts file
2. Add tests in appropriate [tests/](tests/) file
3. Run `npm test` to validate
4. Update [types.d.ts](types.d.ts) if API changed

**Debugging Registry Issues**:
- Verify Symbol identity: symbols created with `Symbol.for(id)` are globally unique
- Check `registry.findBySymbol()` - must match exact symbol or string representation
- Use `instanceMap.has(target)` to check if instances have been spawned

**Working with Nested Paths**:
- Keys must start with `?.` exactly; case-sensitive
- Intermediate objects auto-created if missing or non-object
- Existing objects are preserved; properties are merged recursively
