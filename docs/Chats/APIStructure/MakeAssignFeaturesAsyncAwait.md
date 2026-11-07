# Make AssignFeatures Async but predictable


---

## Human Ask

I'm finding that the onAssigned features aren't called in sequence.  Tracing through the code, it seems to go all the way back to assignFeatures. Since it returns a promise, can't we make the change of calls to all be async / await.

If you see any issues that need ironing out, please discuss, otherwise please make the changes and document your changes below.

---

## Implementation Status Update

**Date:** 2026-08-10

### What was done

1. **`assignFeatures.ts` / `assignFeatures.js`** — converted to `async/await` throughout:
   - `resolveAndCacheSpawns` is now `async`.
   - `installOneFeature` is now `async` and `await`s `static onAssigned`.
   - `installAllFeatures` is now `async` and `await`s each feature in sequence.
   - `assignFeatures` is now `export async function` and always returns `Promise<void>`.

2. **`assignGingerly.ts` / `assignGingerly.js`** — callers now properly await `assignFeatures` and track pending setup:
   - `EnhancementRegistry.push` no longer fire-and-forgets feature registration; it captures the `#assignFeatures` promise and tracks it via `_trackSetup`.
   - `ItemscopeRegistry.define` similarly tracks the `#assignFeatures` promise with `_trackSetup`.
   - Added `EnhancementRegistry.whenDefined(enhKey)` to await pending setups for an enhancement key.
   - `ItemscopeRegistry.whenDefined(name)` already awaits pending setups, so it now covers feature assignment too.

3. **Type declarations** — updated both `types/assign-gingerly/types.d.ts` and `inferencer/types/assign-gingerly/types.d.ts`:
   - `assignFeatures` now declares `Promise<void>` instead of `Promise<void> | undefined`.
   - `EnhancementRegistry` now declares `whenDefined(enhKey)` and `_trackSetup(name, promise)`.

4. **Unit tests** — updated `tests/assign-features.html` to await `customElements.assignFeatures(...)` and rewrote error tests for async rejection handling. Wrapped all tests in `async function runTests()` so results display after all async tests settle.

### Test results

- `npx playwright test tests/assign-features.spec.ts tests/assign-features-advanced.spec.ts` — **6 passed** (23 basic + 13 advanced tests, across chromium, firefox, webkit).
- `npx playwright test` — **87 passed** across all browsers.

### Remaining / follow-up

- No known issues. The change is complete and all tests pass.
