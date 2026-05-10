# Kiro Session Status

## Current State: All tests passing

- `npx playwright test` → 62 passed (includes the new advanced tests)
- `npx tsc` → clean compile, no errors

## What's been implemented (Custom Element Features)

1. **Phase I** — `assignFeatures`, `FeaturesRegistry`, lazy getters on prototype, `supportedFeatures` opt-in, `fallbackSpawn`, `validateShape` ✅
2. **Phase II** — `ctx` (FeatureSpawnContext) + `initVals` capture via `captureFeatureInitVals` helper ✅
3. **Loosely coupled** — moved featuresRegistry/assignFeatures out of object-extension.ts into self-installing assignFeatures.ts ✅
4. **Async spawn** — `isAsyncSpawn` detection, placeholder object, `.then()` instantiation, error state with `FEATURE_ERROR` sentinel ✅
5. **`whenFeatureReady`** — lifecycle method via `featuresConfig.lifecycleKeys`, `pendingFeatures` WeakMap for Promise resolution ✅
6. **`withAsyncMethods`** — fire-and-forget async path evaluation in assignGingerly, dynamically imports `evaluatePathWithAsyncMethods.js` ✅
7. **`withAttrs` for features** — attribute parsing via `parseWithAttrs`, always unprefixed, merge priority (attrs base, programmatic overrides) ✅
8. **Rename** — `FeatureInjection` → `FeatureConfig`, `FeatureInjectionsMap` → `FeatureConfigsMap` ✅
9. **`customData`** — pass-through field on `FeatureConfig` ✅
10. **`getSharedContext`** — on `SupportedFeatureConfig`, provides `ctx.shared` to feature constructors ✅
11. **`PropertyBag`** — base class for nested feature containers, carries `customElementRegistry` ✅
12. **`installForwarding`** — property forwarding via `static propLinks`, getter uses `resolveValue`, setter uses `assignGingerly` ✅
13. **`resolveValue`** — singular path resolver (no object wrapper), with path caching ✅
14. **Path caching** — added to both `resolveValues.ts` and `assignGingerly.ts` ✅
15. **`static assignTo` protocol** — classes opt into custom assignment behavior, checked via `Object.hasOwn` ✅
16. **`lifecycleKeys` refactor** — moved from per-feature `SupportedFeatureConfig` to class-level `static featuresConfig` ✅

## Test files

- `tests/assign-features.html` + `tests/assign-features.spec.ts` — 23 basic tests
- `tests/assign-features-advanced.html` + `tests/assign-features-advanced.spec.ts` — 21 advanced tests (async, withAttrs, lifecycle, sharedContext)

## What's NOT yet implemented

- **Property forwarding** (`forwardProps`) — thought experiment complete, deferred
- **Nested features** (`?.path?.notation` keys) — deferred
- **`@each` + async interaction** — deferred
- **Unique base validation** for `withAttrs` across features — deferred

## Commands

```bash
# Run just assign-features tests
npx playwright test tests/assign-features.spec.ts --project=chromium

# Run advanced tests
npx playwright test tests/assign-features-advanced.spec.ts --project=chromium

# Run full suite
npx playwright test

# TypeScript check
npx tsc --noEmit

# Compile (generates .js from .ts)
npx tsc
```
