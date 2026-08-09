# Create an explainer of assign permissions

---

## Human Ask

I could be missing it, but I'm not seeing a document, linked to from README.md, that documents where things stand with the assign permissions functionality.

Can you please create that?

---

## AI Response

Created `docs/assign-permissions.md` and linked it from `README.md` just before the "The three utility functions are:" transition.

The new explainer covers:

- Why the permission layer exists and its instance-based, externally-passed design.
- How to construct and pass a `PermissionProcessor` to `assignGingerly`, `assignTentatively`, `assignFrom`, `assignFromAsync`, handler plugins, and event listeners.
- The `AssignPermissions` and `RestrictedPropSetting` type shapes.
- The four phases of functionality:
  - Phase I: blocking property assignments by string name.
  - Phase II: redirecting ordinary assignments to a target method via `useMethod`.
  - Phase III: URL origin gating for properties and attributes (`allowFromSameDomain`, `allowCrossDomain`, `attr`).
  - Phase IV: `restrictedMethodSettings` is reserved in the types but not yet implemented.
- The `crossDomainImports` flag for module-loading gates.
- Validation rules and security caveats.
- Practical examples for blocking HTML properties, redirecting to a sanitizer method, and allowing same-origin image URLs.

The document also cross-references the implementation files (`assignPermissions/PermissionProcessor.ts`, `isAllowedUrl.ts`, `isAllowedImportPath.ts`) and the type definitions in `types/assign-gingerly/types.d.ts`.
