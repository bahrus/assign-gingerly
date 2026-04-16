# Scoped Parser Registry Specification

This folder contains the specification documents for the scoped parser registry feature.

## Document Structure

### Repository-Specific Documents

- **`scoped-parser-registry-design.md`** - Focused design document highlighting changes specific to assign-gingerly
  - New `ScopedParserRegistry` class
  - Modified `parseWithAttrs()` and `resolveParser()` functions
  - Public API functions (`registerParser()`, `getParserRegistry()`)
  - `SpawnContext` interface extension
  - Removal of tuple syntax

### Complete Cross-Repository Documents

- **`scoped-parser-registry-design-full.md`** - Complete design document covering both assign-gingerly and mount-observer
- **`scoped-parser-registry-requirements.md`** - Complete requirements document with all 15 requirements

## Quick Reference

**For assign-gingerly implementation**, start with:
1. `scoped-parser-registry-design.md` (focused on this repo)
2. Reference `scoped-parser-registry-design-full.md` for complete context

**For understanding mount-observer integration**, see:
- `mount-observer/.kiro/specs/scoped-parser-registry-design.md`

## Key Concepts

### Context Threading
The synthesizer element reference is passed through the enhancement configuration and spawn context (not via DOM traversal):

```
EMCScript handler (mount-observer)
  ↓ finds synthesizer element from script
  ↓ stores in enhancement config
  ↓
Enhancement spawns with SpawnContext
  ↓ ctx.synthesizerElement
  ↓
parseWithAttrs (assign-gingerly)
  ↓ receives synthesizerElement parameter
  ↓
resolveParser
  ↓ accesses scoped registry
```

### Parser Resolution Order
1. Inline function → use directly
2. String reference:
   - Check scoped registry (if synthesizerElement provided)
   - Fallback to global registry
   - Throw error if not found

## Implementation Phases

1. **Phase 1**: Core registry infrastructure (assign-gingerly)
2. **Phase 2**: EMC parser loading (mount-observer)
3. **Phase 3**: EMC parser waiting (mount-observer)
4. **Phase 4**: Enhancement integration (both)
5. **Phase 5**: Documentation and examples (both)
