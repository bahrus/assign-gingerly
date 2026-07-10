---
inclusion: fileMatch
fileMatchPattern: "inferencer/**"
---

# Inferencer Submodule Isolation

The `inferencer/` folder is a git submodule that must remain self-contained and independently publishable.

## Rules

- **No imports from outside the folder.** Code in `inferencer/` must NOT import from any file in the parent project (no `../assignGingerly.js`, no `../paths.js`, etc.).
- **No references to assign-gingerly internals.** The inferencer module must work as a standalone package with zero dependencies on assign-gingerly runtime code.
- **Types only exception:** Type-only imports from `../types/` are acceptable IF they are also published as part of the inferencer package's own type declarations. Prefer duplicating small type definitions over creating a dependency.
- **Test exceptions:** Test files within inferencer MAY reference the parent project for integration testing, but runtime source files must not.
