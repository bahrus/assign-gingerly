# Create Util To Extract Class from Module Path

There are at least two places in the code, where we start with a string, and we do a dynamic import from it, and in one case add some additional checks for a static method:

enhanceAll.ts:

```TS

// Not registered — dynamically import the spawn module
if (!spawnPath) return null;

const spawnModule = await import(spawnPath);
const SpawnClass = spawnModule.default ?? Object.values(spawnModule).find(
    (v: any) => typeof v === 'function' && v.prototype
);

if (!SpawnClass) return null;
```

Also function findHandlerInModule in processHandlerCommands.ts:

This function starts a little later in the process, after already importing the module.

I would like to consolidate an exportable function module in the assignPermissions folder.  

```JS
export function findProtoTypeInPath(path: string, criteria?: proto => boolean);
```

This function would first confirm the path in assignPermissions/isAllowedImportPath.ts and if not allowed, just throw 403; (strange, I know, but trying to keep the footprint small).

If it passes the first test, it does the import, and then checks if there's a default export.  If it passes the criteria, passes back the default.  Otherwise it iterates through all the exports in search of a prototype (with the optional criteria check) until it finds a match, and returns it.

If no match found it returns a 404.

Then refactor the two use cases above to use this common reusable function.

Finally update the steering instructions in AGENTS.md to always use this approach.

---

## Kimi Feedback / Questions / Concerns

1. **Function signature is not valid TypeScript.** The draft shows `criteria?: proto => boolean`. Should this be `criteria?: (proto: any) => boolean`? Also, what is the intended return type — `Promise<any>` / `Promise<typeof Function>`?

2. **Function name.** `findProtoTypeInPath` reads as "ProtoType" (two words), but the intent seems to be "find a prototype / class in a path." Would `findPrototypeInPath` or `findClassInModulePath` be clearer?

3. **Error handling semantics are unclear.** "just throw 403" and "returns a 404" are HTTP-oriented terms. Since this is a general utility module, should it instead throw named errors (e.g., `ImportNotAllowedError`, `NoMatchingExportError`) and let callers decide how to map to HTTP status codes?

4. **Placement feels off.** `assignPermissions` is about import-path permissions, not module introspection. Would a `utils/` or `moduleUtils/` folder be a more natural home for a shared extractor?

5. **Default vs. named exports.** The draft says: "checks if there's a default export. If it passes the criteria, passes back the default. Otherwise it iterates through all the exports." Is the default export always preferred over named exports, even if a named export is a better match? Should the order be configurable, or should named exports be checked first when no default satisfies the criteria?

6. **Criteria fallback.** If no `criteria` is provided, should the function default to `v => typeof v === 'function' && v.prototype`? That matches the current `enhanceAll.ts` logic.

7. **`processHandlerCommands.ts` already imports the module.** Since `findHandlerInModule` starts after the import, refactoring it to call this new function may require restructuring the async flow or adding a second variant that accepts an already-loaded module object (e.g., `findPrototypeInModule(module, criteria?)`).

8. **Async boundary.** The new function must be `async` because it does a dynamic import. Will all callers be okay becoming async? Need to verify call sites.

9. **Edge cases to define:**
   - What if the path resolves to a module with no exports at all?
   - What if multiple exports match the criteria? Return the first match, or fail?
   - What if the matching export is a class with no prototype (arrow-constructor / unusual transpilation)?
   - Should primitive / non-constructor functions be skipped even if `criteria` passes?

10. **AGENTS.md steering instruction.** Before updating AGENTS.md, it would help to settle the exact API shape and add at least one passing test so the rule reflects working code rather than a draft.

---

## Human Response

> **Function signature is not valid TypeScript.**

Good point.

```JS
export async function findClassPrototypeInPath<T = any>(path: string, criteria?: proto => boolean): Promise<{new(): T}>;
```

> Function name

Suggest name above.  Maybe it's too long.  Use your best judgement.  Make the module name match.

> Placement feels off.

Let's put it in utils, good idea.

> **`processHandlerCommands.ts` already imports the module.**

Yes, some refactoring will be needed, for sure.  I definitely want it to be refactored so that the common function is used in both cases.  Let me know if you see any show stoppers that prevent this refactoring from working.

>  **Async boundary.**

My mistake.  Function should be async

> 9. **Edge cases to define:**
>   - What if the path resolves to a module with no exports at all?
>   - What if multiple exports match the criteria? Return the first match, or fail?
>   - What if the matching export is a class with no prototype (arrow-constructor / unusual transpilation)?
>   - Should primitive / non-constructor functions be skipped even if `criteria` passes?

No exports at all -- it should throw an error.  I want to keep the specifics small, just log the path and either  `ImportNotAllowedError` or `NoMatchingExportError`

Return the first match.

Has to be a class with a prototype

---

## Resolution Status

### Resolved

- **Function name:** `findClassPrototypeInPath` (module name to match).
- **Location:** `utils/` folder.
- **Async boundary:** Function will be `async`.
- **Error handling:** Use `ImportNotAllowedError` and `NoMatchingExportError`; log the path.
- **Edge cases:**
  - No exports / no match: throw `NoMatchingExportError` and log the path.
  - Multiple matches: return the first match.
  - Must be a class with a prototype.
- **Refactor both call sites:** Confirmed — `processHandlerCommands.ts` will be refactored to use the shared function.

### Still Open / Needs Confirmation

All resolved below.

### Final Decisions

1. **Function signature:**
   ```ts
   export async function findClassPrototypeInPath<T = any>(
     path: string,
     criteria?: (proto: any) => boolean
   ): Promise<{ new(): T }>
   ```

2. **Default vs. named export priority:** Default export is checked first; if it passes, it is returned. Otherwise named exports are scanned.

3. **Criteria fallback:** Always apply the base check `(v) => typeof v === 'function' && v.prototype`. If `criteria` is also provided, only return values that pass both checks.

4. **AGENTS.md update:** To be done after implementation and tests are in place.

### Verdict

✅ All questions resolved. Implementation approved.

---

## Human Response II

1.

```JS
export async function findClassPrototypeInPath<T = any>(path: string, criteria?: (proto: any) => boolean): Promise<{new(): T}>;
```

2.  Default vs. named export priority

Yes, Default should be the first to check, and return that if it passes.  Otherwise named.

3.  **Criteria fallback.** If no `criteria` is provided, should the function default to checking for a function with a prototype (i.e., `(v) => typeof v === 'function' && v.prototype`)?


Yes, always check first for `(v) => typeof v === 'function' && v.prototype`) and only check criteria if provided and the first test passes.

If ready, please implement.

---

## Implementation Notes

Implementation is complete. Here's what changed:

- **`utils/findClassPrototypeInPath.ts`** + **`.js`** — new shared utility that:
  - Validates the path via `isAllowedImportPath`.
  - Throws `ImportNotAllowedError` for disallowed paths.
  - Dynamically imports the module, prefers the default export, falls back to named exports.
  - Applies the base class-with-prototype check, then optional `criteria`.
  - Throws `NoMatchingExportError` when nothing matches.

- **`enhanceAll.ts`** + **`.js`** — `resolveAndRegister` now uses `findClassPrototypeInPath(spawnPath)` and returns `null` on no-match (preserving existing behavior).

- **`processHandlerCommands.ts`** + **`.js`** — replaced the hand-rolled `findHandlerInModule` with the shared utility using `handlerCriteria(proto => 'assign' in proto.prototype)` for both built-in and custom handler resolution.

- **`package.json`** — added export for `./utils/findClassPrototypeInPath.js`.

- **Tests** — added `tests/find-class-prototype-in-path.html`, `tests/find-class-prototype-in-path.spec.ts`, and fixture modules under `tests/class-prototype-fixtures/`.

- **`AGENTS.md`** — added a steering rule requiring dynamic module-to-class extraction to go through `utils/findClassPrototypeInPath.js`.

Verification: `npx playwright test` passed **87/87 tests** across Chromium, Firefox, and WebKit. (A separate `tsc --noEmit` run surfaced pre-existing type errors in unrelated files only.)

6% 7 day
30% Five hours.










