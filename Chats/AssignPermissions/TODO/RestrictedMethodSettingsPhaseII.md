# Restricted Method Settings Phase I

---

## Human Ask

```JS
{
    restrictedMethodSettings: [
        //Phase II
        'setHTMLUnsafe', //not allowed at all
        {
            //Phase II
            method: 'replaceWithHTML',
            addArgs: [
                '?.sanitizerOptions'
            ]
        }
    ]
    
}
```

---

## Human Ask

```JS
const permissionProcessor = new PermissionProcessor({
  restrictedPropSettings: ['innerHTML', 'src'],
  customSettings{
        sanitizerOptions: {...},
  },
  restrictedMethodSettings: [
      //Phase I
      'setHTMLUnsafe', //not allowed at all
      {
            //Phase II
            method: 'replaceWithHTML',
            addArgs: [
                '?.customSettings?.sanitizerOptions'
            ]
      }
      ...
  ]
});

```

---

## Thoughts / Implementation Notes

### Current state (Phase I)

`PermissionProcessor` already accepts `restrictedMethodSettings: Array<string | RestrictedMethodConfig>`, but the implementation in `PermissionProcessor.ts` only handles the string form:

```ts
function buildMethodSet(permissions: AssignPermissions | undefined): Set<string> {
    // ...
    for (const setting of methodSettings) {
        if (typeof setting === 'string') {
            methods.add(setting);
        }
        // Phase II: object-form RestrictedMethodConfig entries are ignored for now.
    }
}
```

String entries fully block the method by making `isAllowedMethod(...)` return `false`, which causes the method name to be treated as a plain property and prevents a call.

### What Phase II needs to do

Object-form entries like:

```js
{
    method: 'replaceWithHTML',
    addArgs: ['?.sanitizerOptions']
}
```

should **not** block the method entirely. Instead, when `replaceWithHTML` is invoked via a `withMethods` path, the permission processor should inject extra arguments resolved from a source object.

### Proposed design

1. **Keep `restrictedMethodSettings` as the source of truth**, but split the set into:
   - `blockedMethods: Set<string>` — string entries.
   - `configuredMethods: Map<string, RestrictedMethodConfig>` — object entries keyed by `method`.

2. **Change `checkRestrictedMethod` semantics** so it only blocks methods that are string-listed. For configured methods, return `false` from `checkRestrictedMethod` so `isAllowedMethod` still allows the call.

3. **Add a new helper to PermissionProcessor**, e.g.:
   ```ts
   getMethodAddArgs(methodName: string): string[] | undefined
   ```
   Returns the `addArgs` paths for configured methods, or `undefined`.

4. **Resolve the extra args at call time**. The method-call sites in `assignGingerly.ts` already have access to `options` (and therefore `options.sanitizerOptions`, `options.customSettings`, etc.). Two possible approaches:

   - **Option A — resolve inside `assignGingerly.ts`**: Pass `options` into `evaluatePathWithMethods` / the method-call branch. When `result.isMethod` is true and `permissionProcessor.getMethodAddArgs(result.lastKey)` returns paths, resolve each path against `options` (using the existing `?.` path parser) and append the resolved values to the argument list.
   - **Option B — resolve inside `PermissionProcessor`**: Have the processor own the resolution. This keeps policy in one place, but it needs a context object (`options`) at call time, which currently is not passed to `checkRestrictedMethod`.

   **Recommendation: Option A**, because `assignGingerly.ts` already has the full execution context (`options`) and the path-parsing machinery. `PermissionProcessor` should stay focused on policy, not path evaluation.

### Resolving `addArgs` paths

The path strings (`?.sanitizerOptions`, `?.customSettings?.sanitizerOptions`) use the same `?.` notation as `assignGingerly` paths. We can reuse the existing path utilities:

```ts
const { parsePath, ensureNestedPath } = await import('./assignGingerly.js');
// or expose them from a shared module
```

For each `addArg` path:
- Parse the path.
- If the path starts with `?.`, evaluate it relative to `options`.
- The final value is appended to the method call arguments.

Example with the config:

```js
{
    restrictedMethodSettings: [
        { method: 'replaceWithHTML', addArgs: ['?.customSettings?.sanitizerOptions'] }
    ],
    customSettings: { sanitizerOptions: { allowElements: ['b', 'i'] } }
}
```

A path like `?.replaceWithHTML('hello')` would call:

```js
el.replaceWithHTML('hello', { allowElements: ['b', 'i'] })
```

### Where should the sanitizer options live?

The two examples differ:

1. `addArgs: ['?.sanitizerOptions']` — looks for `options.sanitizerOptions`.
2. `addArgs: ['?.customSettings?.sanitizerOptions']` — looks for `options.customSettings.sanitizerOptions`.

`AssignPermissions` already has a top-level `sanitizerOptions?: Record<string, any>` field in `types/assign-gingerly/types.d.ts`. That suggests the intended canonical location is `permissions.sanitizerOptions`. But `options.customSettings` is also shown.

**Suggestion**: support both, or settle on `permissions.sanitizerOptions` and document it. If `addArgs` paths are flexible, users can point anywhere (`?.sanitizerOptions` or `?.customSettings?.sanitizerOptions`). That flexibility is probably the goal.

### Open questions

1. **Ordering of injected args**: Should `addArgs` be appended after the user-supplied args, or prepended? Appending feels natural for options/sanitizer objects.
2. **Method call shapes**: For zero-arg methods (`method|`) or methods consumed as part of a chain, does it still make sense to inject args? Probably yes — if a method is configured with `addArgs`, always inject them.
3. **Interaction with async methods**: `withAsyncMethods` calls happen inside an async IIFE. The same injection logic should apply there.
4. **Deep path support in `addArgs`**: Should array/object literals be supported, or only path lookups? Starting with path lookups keeps it simple.
5. **Duplicate addArgs / multiple configured methods**: `buildMethodSet` should probably throw if the same method is configured twice, similar to how `buildMaps` throws for duplicate props.

### Suggested first step

1. Update `PermissionProcessor` to store `configuredMethods: Map<string, RestrictedMethodConfig>` and expose `getMethodAddArgs(methodName)`.
2. Update the method-call branches in `assignGingerly.ts` to:
   - Check `permissionProcessor?.getMethodAddArgs(methodName)`.
   - If present, resolve each path against `options`.
   - Append resolved values to the argument list.
3. Add unit tests covering:
   - String entries still block methods.
   - Configured methods are allowed and get extra args.
   - Missing optional args resolve to `undefined` gracefully.
   - Duplicate method config throws.

This should give Phase II without touching Phase I behavior.

---

## Human Response I

> Where should the sanitizer options live?

I added customSettings to the type.  Let's leave the sanitizerOptions also in the type.  Typically, I think there would only be one sanitizerOptions for all scenarios, but conceivably there could be a scenario where one method uses one santizerOptions, and another needs different settings, so the second could come from customSettings.  The main thing is we should be able to point to either using the chained accessor. I think if the things inside addArgs don't start with '?.', they should be passed in as is.  Basically, we should "resolve" addArgs just like we resolve other sections, with the source.

> **Ordering of injected args**: Should `addArgs` be appended after the user-supplied args, or prepended? Appending feels natural for options/sanitizer objects.

Yes, I think "addArgs" suggests appending.  Maybe we should call it appendArgs instead?

If in the future, we need to start with some other args, we could use "prependArgs".  What do you think?

> **Method call shapes**: For zero-arg methods (`method|`) or methods consumed as part of a chain, does it still make sense to inject args?

Yes, I agree.

> *Interaction with async methods**: `withAsyncMethods` calls happen inside an async IIFE. The same injection logic should apply there.

Sounds good.

**Deep path support in `addArgs`**: Should array/object literals be supported, or only path lookups? Starting with path lookups keeps it simple.

Let's reuse the recursive resolve function for this.

>  **Duplicate addArgs / multiple configured methods**: `buildMethodSet` should probably throw if the same method is configured twice, similar to how `buildMaps` throws for duplicate props.

Sounds good.

If everything seems clear, please begin implementing, otherwise, please add additional points that need clarification below.

