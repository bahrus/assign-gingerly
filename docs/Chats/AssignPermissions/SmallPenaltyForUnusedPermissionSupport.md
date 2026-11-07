# Small Penalty for Unused Permission Support

The module [restrictedProps](/assignPermissions/restrictedProps.js) is getting quite large, and is only anticipated to be used for a minority of use cases -- cases where the assignment rules cannot be properly vetted, such as from HTML attributes.

Because the three main assign* functions are synchronous, they cannot conditionally import the module on demand.

I think a better approach to this dilemma is to allow for externally passing that module.  Or perhaps it would be cleaner to turn the module into a self contained class (with static methods?):

```JS
{
    PermissionProcessor: ctr
}
```

I don't think it matters too much what form it takes, so unless you think there's a meaningful and important "fork in the road" decision to make, what approach would you recommend taking?

---

## AI Response

There is a meaningful fork here: **static methods vs. instance methods**.

### The key distinction

If the main `assign*` modules keep a static import of the permission helper, the browser still parses and loads that module even when no permissions are used. To avoid that penalty, the helper must be imported by the *caller* and passed in, not imported by `assignGingerly` / `assignTentatively` / `assignFrom` themselves.

That rules out a design where the module only exposes static methods and the core functions call those static methods directly.

### Recommendation: instance-based `PermissionProcessor`

Create a class such as `assignPermissions/PermissionProcessor.ts`:

```ts
export class PermissionProcessor {
  private readonly props: Map<string, RestrictedPropSetting | undefined>;
  private readonly attrs: Map<string, RestrictedPropSetting | undefined>;
  private readonly warned = new Set<string>();

  constructor(permissions: AssignPermissions | undefined) {
    const { props, attrs } = buildMaps(permissions);
    this.props = props;
    this.attrs = attrs;
  }

  checkRestrictedProp(key: string): boolean { /* ... */ }
  redirectRestrictedProp(target: any, key: string, value: any): boolean { /* ... */ }
  checkRestrictedAttributeCall(methodName: string, args: any[]): { blocked: boolean; attrName?: string } { /* ... */ }
}
```

Then change the core functions to accept an optional instance:

```ts
export function assignGingerly(
  target: any,
  source: Record<string | symbol, any>,
  options?: IAssignGingerlyOptions,
  permissionProcessor?: PermissionProcessor
): any { /* ... */ }
```

Usage:

```js
import { PermissionProcessor } from './assignPermissions/PermissionProcessor.js';

assignGingerly(target, source, options, new PermissionProcessor(permissions));
```

When `permissionProcessor` is omitted, the core functions skip every permission check and never touch the `PermissionProcessor` module.

### Why this is better than the other options

- **Static methods on a class**: still forces a static import in the core modules, so the "unused penalty" remains.
- **Dynamic import**: the `assign*` functions are synchronous, so we cannot `await` an on-demand import without making them async.
- **Passing raw `permissions` and building internally**: that also forces the core modules to import the builder.
- **Instance passed by caller**: keeps the core modules lean, makes the permission support opt-in at both the data level and the module-load level, and is easy to tree-shake.

### Migration impact

This is a breaking change across the public API and internal helpers:

- `assignGingerly`, `assignTentatively`, `assignFrom`, `attachEventListener`, and any handler that forwards permissions all need their signatures changed from `permissions?: AssignPermissions` to `permissionProcessor?: PermissionProcessor`.
- Internal recursive calls (e.g., `applyToEach`, captured async closures) need to forward the instance instead of the raw permissions object.
- Existing tests and examples that pass a raw `permissions` object need to wrap it in `new PermissionProcessor(...)`.

The refactor is mechanical, but it touches many files.

### Suggested shape for the class

The class can essentially be a thin wrapper around the current `restrictedProps.ts` logic. Most of the existing code moves into private methods. I'd keep `AssignPermissions` as the plain config type (already defined in `types/assign-gingerly/types.d.ts`) and let `PermissionProcessor` own the normalization and runtime checks.

If you want to preserve the old module name for discoverability, `restrictedProps.ts` can re-export the class under a deprecation note, or it can become a private implementation detail of `PermissionProcessor`.

### Bottom line

Yes, there's a fork in the road, and I'd take the **instance-based, externally-passed `PermissionProcessor`** path. It is the only one of the three options that actually removes the unused-module load penalty.

---

## Human Response I

Sounds good.  Please implement the instance-based, externally-passed `PermissionProcessor`. 

---

## AI Response II — Implementation Complete

Implemented the instance-based `PermissionProcessor` refactor. Summary of changes:

### New module
- `assignPermissions/PermissionProcessor.ts` (and compiled `.js`) wraps the old `restrictedProps.ts` logic in a class.
- `AssignPermissions` remains the plain config type in `types/assign-gingerly/types.d.ts`.
- `PermissionProcessor` is exported from `types/assign-gingerly/types.d.ts` so consumers can type-check the instance.
- Added a `crossDomainImports` getter so `enhanceAll` can still gate that flag without loading the old module.

### Removed
- `assignPermissions/restrictedProps.ts` and `.js` are deleted.

### Signature updates
The optional parameter changed from `permissions?: AssignPermissions` to `permissionProcessor?: PermissionProcessor` in:
- `assignGingerly`
- `assignTentatively`
- `assignFrom` and `assignFromAsync`
- `processHandlerCommands`
- `eachTime`
- `enhanceAll`
- `handlers/addEventListener`
- `handlers/lazyLoad`
- `handlers/lazyLoadSwitch`
- `handlers/manageTemplateList`
- `handlers/rangeSelector`

Internal recursive call sites and async closures now forward the `permissionProcessor` instance instead of a raw permissions object.

### Type updates
- `types/assign-gingerly/types.d.ts` and `inferencer/types/assign-gingerly/types.d.ts` updated with the new parameter and `PermissionProcessor` declaration.

### Test updates
- `tests/restricted-prop-settings.html` now imports `PermissionProcessor` and instantiates it before passing it into `assignGingerly`, `assignFrom`, `assignTentatively`, and `attachEventListener`.

### Validation
- `npx tsc --noEmit` passes.
- `npx playwright test tests/restricted-prop-settings.spec.ts --project=chromium --reporter=list` passes.
- Full `npm test` suite: **87 passed (17.7s)**.

No leftover `restrictedProps` imports remain outside of chat/documentation files.

