---
inclusion: auto
---

# Types Location Rule

All exported TypeScript interfaces and types must be defined in `types/assign-gingerly/types.d.ts`.

## Rules

- **Exported interfaces and types** go in `types/assign-gingerly/types.d.ts` — not inline in the module files.
- Module files (`.ts`) should **import types** from `types/assign-gingerly/types.d.ts` (or `types.js` for the path) rather than defining them locally.
- **Type-only exports** (`export type { ... }`) from module files are acceptable as re-exports for consumer convenience, but the definition lives in `types.d.ts`.
- **Internal/private types** (not exported from the package) may remain in their module file if they're only used locally.
