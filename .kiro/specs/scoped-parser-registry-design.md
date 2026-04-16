# Scoped Parser Registry Design - assign-gingerly

> **Cross-Repository Feature**: This document focuses on changes to the assign-gingerly package. For the complete design including mount-observer changes, see the main design document in the workspace root at `.kiro/specs/scoped-parser-registry/design.md`.

## Overview

This feature adds scoped parser registries to assign-gingerly, enabling framework-isolated parser management. Each synthesizer element (be-hive, htmx-container, etc.) maintains its own parser registry to prevent conflicts between different framework libraries.

### Key Changes to assign-gingerly

1. **New `ScopedParserRegistry` class** - Manages parsers for a single synthesizer scope with Promise-based waiting
2. **Modified `parseWithAttrs()`** - Accepts optional `synthesizerElement` parameter for scoped parser resolution
3. **Modified `resolveParser()`** - Checks scoped registry first, then falls back to global registry
4. **Public API functions** - `registerParser()` and `getParserRegistry()` for programmatic parser management
5. **Remove tuple syntax** - Delete Custom Element Static Method Parsers (`['element-name', 'methodName']`)
6. **Extend `SpawnContext`** - Add `synthesizerElement` property to pass context through enhancement initialization

## Context Threading Solution

**The Challenge**: How does `parseWithAttrs()` access the scoped registry when the enhanced element may not be a DOM descendant of the synthesizer element?

**The Solution**: The synthesizer element reference is passed through the enhancement configuration and spawn context:

```
mount-observer EMCScript handler
  ↓
  Finds synthesizer element from script element
  ↓
  Stores in enhancement config
  ↓
  Enhancement spawns with SpawnContext
  ↓
  ctx.synthesizerElement passed to parseWithAttrs
  ↓
  parseWithAttrs passes to resolveParser
  ↓
  resolveParser accesses scoped registry
```

## New Components

### 1. ScopedParserRegistry Class

**File**: `assign-gingerly/ScopedParserRegistry.ts` (new file)

```typescript
export class ScopedParserRegistry {
  private parsers: Map<string, (v: string | null) => any>;
  private pendingWaits: Map<string, Array<{
    resolve: () => void;
    reject: (error: Error) => void;
  }>>;
  
  /**
   * Register a parser with a given name
   */
  register(name: string, parser: (v: string | null) => any): void {
    this.parsers.set(name, parser);
    
    // Resolve any pending waiters for this parser
    const waiters = this.pendingWaits.get(name);
    if (waiters) {
      waiters.forEach(({ resolve }) => resolve());
      this.pendingWaits.delete(name);
    }
  }
  
  /**
   * Get a parser by name
   */
  get(name: string): ((v: string | null) => any) | undefined {
    return this.parsers.get(name);
  }
  
  /**
   * Check if a parser is registered
   */
  has(name: string): boolean {
    return this.parsers.has(name);
  }
  
  /**
   * Wait for multiple parsers to be registered
   * @param names - Array of parser names to wait for
   * @param timeout - Timeout in milliseconds (default: 60000)
   * @returns Promise that resolves when all parsers are registered
   * @throws Error listing missing parsers if timeout expires
   */
  waitFor(names: string[], timeout: number = 60000): Promise<void> {
    // Check if all parsers already registered
    const missing = names.filter(name => !this.has(name));
    if (missing.length === 0) {
      return Promise.resolve();
    }
    
    // Create promise that resolves when all parsers registered
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const stillMissing = names.filter(name => !this.has(name));
        reject(new Error(`Timeout waiting for parsers: ${stillMissing.join(', ')}`));
      }, timeout);
      
      // Track which parsers we're waiting for
      let remainingCount = missing.length;
      
      missing.forEach(name => {
        const waiter = {
          resolve: () => {
            remainingCount--;
            if (remainingCount === 0) {
              clearTimeout(timeoutId);
              resolve();
            }
          },
          reject
        };
        
        if (!this.pendingWaits.has(name)) {
          this.pendingWaits.set(name, []);
        }
        this.pendingWaits.get(name)!.push(waiter);
      });
    });
  }
  
  /**
   * Get all registered parser names
   */
  getNames(): string[] {
    return Array.from(this.parsers.keys());
  }
}
```

### 2. Public API Functions

**File**: `assign-gingerly/parserRegistry.ts` (modify existing file)

Add these exports:

```typescript
import { ScopedParserRegistry } from './ScopedParserRegistry.js';

// Symbol for storing scoped registry on synthesizer elements
const SCOPED_REGISTRY_SYMBOL = Symbol.for('assign-gingerly.scopedParserRegistry');

/**
 * Get the scoped parser registry for a synthesizer element
 * Creates a new registry if one doesn't exist
 * @param synthesizerElement - The synthesizer element (be-hive, htmx-container, etc.)
 * @returns The scoped parser registry
 */
export function getParserRegistry(synthesizerElement: Element): ScopedParserRegistry {
  let registry = (synthesizerElement as any)[SCOPED_REGISTRY_SYMBOL];
  
  if (!registry) {
    registry = new ScopedParserRegistry();
    (synthesizerElement as any)[SCOPED_REGISTRY_SYMBOL] = registry;
  }
  
  return registry;
}

/**
 * Register a parser in a synthesizer element's scoped registry
 * @param synthesizerElement - The synthesizer element to register the parser with
 * @param name - Parser name
 * @param parser - Parser function
 */
export function registerParser(
  synthesizerElement: Element,
  name: string,
  parser: (v: string | null) => any
): void {
  const registry = getParserRegistry(synthesizerElement);
  registry.register(name, parser);
}
```

## Modified Components

### 3. parseWithAttrs Function

**File**: `assign-gingerly/parseWithAttrs.ts`

**Change**: Add optional `synthesizerElement` parameter

```typescript
export function parseWithAttrs<T = any>(
    element: Element,
    attrPatterns: AttrPatterns<T>,
    allowUnprefixed?: string | RegExp,
    synthesizerElement?: Element  // NEW PARAMETER
): Partial<T> {
  // ... existing validation code ...
  
  // Pass synthesizerElement to resolveParser calls
  const parser = resolveParser(config.parser, synthesizerElement);
  
  // ... rest of function ...
}
```

### 4. resolveParser Function

**File**: `assign-gingerly/parseWithAttrs.ts`

**Changes**:
1. Add `synthesizerElement` parameter
2. Check scoped registry before global registry
3. Remove tuple syntax support

```typescript
function resolveParser(
  parserSpec: ((v: string | null) => any) | string | undefined,
  synthesizerElement?: Element  // NEW PARAMETER
): ((v: string | null) => any) | undefined {
  // Undefined - no parser specified
  if (parserSpec === undefined) {
    return undefined;
  }
  
  // Inline function - use directly
  if (typeof parserSpec === 'function') {
    return parserSpec;
  }
  
  // REMOVE THIS BLOCK - Tuple syntax no longer supported
  // if (Array.isArray(parserSpec)) { ... }
  
  // String reference - resolve from scoped or global registry
  if (typeof parserSpec === 'string') {
    // Check scoped registry first (if synthesizerElement provided)
    if (synthesizerElement) {
      const scopedRegistry = getParserRegistry(synthesizerElement);
      const scopedParser = scopedRegistry.get(parserSpec);
      if (scopedParser) {
        return scopedParser;
      }
    }
    
    // Fallback to global registry
    const globalParser = globalParserRegistry.get(parserSpec);
    if (globalParser) {
      return globalParser;
    }
    
    // Not found in either registry
    throw new Error(
      `Parser "${parserSpec}" not found. ` +
      `Checked ${synthesizerElement ? 'scoped registry and ' : ''}global registry. ` +
      `Ensure the parser is registered via:\n` +
      `- <script type="emc-parser" src="..." parser-name="${parserSpec}">\n` +
      `- registerParser(synthesizerElement, "${parserSpec}", parserFn)\n` +
      `- globalParserRegistry.register("${parserSpec}", parserFn)`
    );
  }
  
  return undefined;
}
```

### 5. SpawnContext Interface

**File**: `assign-gingerly/types/assign-gingerly/types.d.ts` (or wherever SpawnContext is defined)

**Change**: Add `synthesizerElement` property

```typescript
export interface SpawnContext {
  // ... existing properties ...
  
  /**
   * Reference to the synthesizer element (be-hive, htmx-container, etc.)
   * that contains the EMC script defining this enhancement.
   * Used for scoped parser registry access.
   */
  synthesizerElement?: Element;
}
```

## Enhancement Constructor Pattern

Enhancements should pass `ctx.synthesizerElement` to `parseWithAttrs()`:

```typescript
class MyEnhancement {
  constructor(element: Element, ctx: SpawnContext, initVals: Partial<MyEnhancement>) {
    // Pass synthesizerElement from context to parseWithAttrs
    const parsedAttrs = parseWithAttrs(
      element,
      this.withAttrs,
      this.allowUnprefixed,
      ctx.synthesizerElement  // NEW: Pass through synthesizer element
    );
    
    Object.assign(this, parsedAttrs);
    Object.assign(this, initVals);
  }
}
```

## Parser Resolution Flow

```
parseWithAttrs(element, attrPatterns, allowUnprefixed, synthesizerElement)
  ↓
  resolveParser(parserSpec, synthesizerElement)
  ↓
  if parserSpec is function → return directly
  ↓
  if parserSpec is string:
    ↓
    if synthesizerElement provided:
      ↓
      Check scoped registry → found? return parser
      ↓
      Not found → Check global registry → found? return parser
      ↓
      Not found → throw error
    ↓
    if synthesizerElement NOT provided:
      ↓
      Check global registry only → found? return parser
      ↓
      Not found → throw error
```

## Backward Compatibility

### Preserved Behaviors

1. **Inline parser functions**: Continue to work unchanged
2. **Global registry**: Built-in parsers (json, timestamp, etc.) remain globally available
3. **parseWithAttrs without synthesizerElement**: Falls back to global registry only (backward compatible)

### Breaking Changes

1. **Tuple syntax removal**: `['element-name', 'methodName']` parser syntax is removed
   - Migration: Use scoped registry with `<script type="emc-parser">` or `registerParser()`

## Testing Requirements

### Unit Tests

1. **ScopedParserRegistry**:
   - Register and retrieve parsers
   - `waitFor()` resolves when all parsers registered
   - `waitFor()` rejects on timeout with correct error
   - Multiple `waitFor()` calls for same parser
   - Register parser resolves pending waiters

2. **resolveParser()**:
   - Inline function returns directly
   - String lookup in scoped registry
   - String lookup fallback to global registry
   - Error when parser not found
   - Backward compatibility (no synthesizerElement parameter)

3. **parseWithAttrs()**:
   - Scoped parser resolution with synthesizerElement
   - Backward compatibility without synthesizerElement
   - Error propagation from resolveParser

4. **Public API**:
   - `registerParser()` creates registry if needed
   - `getParserRegistry()` returns same instance
   - Multiple registrations to same synthesizer element

### Integration Tests

Test with mount-observer to verify end-to-end functionality:
- Declarative parser loading via `<script type="emc-parser">`
- Programmatic parser registration via `registerParser()`
- Parser scoping (different synthesizer elements have isolated registries)
- Global registry fallback for built-in parsers

## Implementation Checklist

- [ ] Create `ScopedParserRegistry.ts` with full implementation
- [ ] Add `getParserRegistry()` and `registerParser()` to `parserRegistry.ts`
- [ ] Add `synthesizerElement` parameter to `parseWithAttrs()`
- [ ] Add `synthesizerElement` parameter to `resolveParser()`
- [ ] Implement scoped → global fallback logic in `resolveParser()`
- [ ] Remove tuple syntax support from `resolveParser()`
- [ ] Add `synthesizerElement` property to `SpawnContext` interface
- [ ] Update enhancement constructor examples in documentation
- [ ] Write unit tests for all new functionality
- [ ] Update README with scoped registry documentation
- [ ] Create migration guide for tuple syntax removal

## Related Files

- **Main Design**: `.kiro/specs/scoped-parser-registry/design.md` (workspace root)
- **Requirements**: `.kiro/specs/scoped-parser-registry/requirements.md` (workspace root)
- **mount-observer Design**: `mount-observer/.kiro/specs/scoped-parser-registry-design.md`
