# Restricted Method Settings Phase I

---

## Human Ask

```JS
const permissionProcessor = new PermissionProcessor({
  restrictedPropSettings: ['innerHTML', 'src'],
  restrictedMethodSettings: [
      //Phase I
      'setHTMLUnsafe', //not allowed at all
      ...
  ]
});

```

This overrides:  withMethods: ['setHTMLUnsafe']

The withMethods might be configurable in an HTML attribute, whereas restrictedMethodSettings only gets set from trusted JS code.

---

## AI Response

This is a sensible and important extension of the permission model. Phase I for restricted methods is conceptually simpler than the property work already done, but it has a few design details worth nailing down before implementation.

### Why this is the right shape

`withMethods` is an allowlist: it says "these method names are safe to call as part of an assignment expression." If that allowlist can be injected from an HTML attribute or other untrusted source, it is no longer trustworthy. `restrictedMethodSettings` is a trusted-script denylist that overrides the allowlist. That is exactly the right relationship.

### Where the check should live

The denylist check should happen at the point where `withMethods` is consulted, not at the call site. The cleanest place is inside `PermissionProcessor` as a new method:

```ts
checkRestrictedMethod(methodName: string): boolean
```

Then wherever the code currently asks "is this segment in `withMethods`?", the next question becomes "and is it *not* restricted by the permission processor?" If the method is restricted, the segment is treated as if it were *not* in `withMethods`, which means it falls back to ordinary property access (or is silently skipped, depending on the existing withMethods behavior).

This keeps the security decision in one module and keeps the rest of the code path unchanged.

### Recommended Phase I behavior

For a string entry in `restrictedMethodSettings`:

- That exact method name cannot be invoked through `withMethods`.
- It does not matter whether `withMethods` is an array or a `Set`.
- It does not matter whether the method name was reached via `aka` aliasing — the restriction applies to the resolved method name, not the alias.
- Chained method calls that include a restricted method anywhere in the chain are blocked at that point.
- Direct property access that does not use `withMethods` is unaffected. (If you want to block the property too, add it to `restrictedPropSettings`.)

Example:

```js
const processor = new PermissionProcessor({
  restrictedMethodSettings: ['setHTMLUnsafe']
});

assignGingerly(element, {
  '?.setHTMLUnsafe': '<p>evil</p>'
}, { withMethods: ['setHTMLUnsafe'] }, processor);
// Blocked: setHTMLUnsafe is treated as not in withMethods.
```

### Phase II preview (so Phase I does not paint us into a corner)

The `RestrictedMethodConfig` type already declares `method` and `addArgs`. That implies Phase II will allow something like:

```js
{
  method: 'replaceWithHTML',
  addArgs: ['?.sanitizerOptions']
}
```

For Phase I I would implement only the string denylist. The `RestrictedMethodConfig` shape can remain in the types but stay unimplemented, exactly like `sanitizerOptions` and `restrictedMethodSettings` were before this work. When Phase II begins, the same `PermissionProcessor` method can grow to return an "allowed but transformed" descriptor instead of a simple boolean.

### Suggested `PermissionProcessor` API

```ts
checkRestrictedMethod(methodName: string): boolean
```

Keep the signature a single boolean for Phase I. Internally it just checks a `Set<string>` built from the string entries of `restrictedMethodSettings`. Object-form entries are ignored until Phase II.

### Open questions / concerns

1. **Interaction with `akaMethods`.** If `akaMethods` maps an alias to a restricted method, the restriction should still apply after alias resolution. I do not think there is any value in allowing aliases to bypass the denylist.

2. **Method chains with mixed restrictions.** A path like `?.safeMethod?.restrictedMethod?.safeMethod` should be blocked at `restrictedMethod`. The chain naturally stops when the middle segment is no longer treated as callable.

3. **Zero-arg marker `|`.** The `|` suffix is part of the path syntax, not the method name. The restriction should check the method name itself, not the raw segment text. `?.setHTMLUnsafe|` should be blocked just like `?.setHTMLUnsafe`.

4. **Console warnings.** For consistency with `restrictedPropSettings`, I would emit a one-time warning per restricted method when it is blocked. This helps developers discover that their `withMethods` allowlist is being overridden.

5. **Scope.** Should `restrictedMethodSettings` also block methods invoked by handlers or event-vector assignments? My opinion is yes: the `PermissionProcessor` is passed through every call path, so any method invocation that goes through `withMethods` should respect the denylist. This is consistent with how `restrictedPropSettings` already propagates to nested assignments and event vectors.

### Bottom line

Phase I is a small, well-scoped addition: add a `Set<string>` denylist to `PermissionProcessor`, expose `checkRestrictedMethod`, and consult it whenever `withMethods` is about to call a method. It directly addresses the threat model you described and does not require touching the property-permission logic again.

---

## Human Response I

I agree with all your recommendations.  Please implement.

---

## AI Response II — Implementation Complete

Implemented Phase I of restricted method settings.

### Changes

- `assignPermissions/PermissionProcessor.ts` / `.js`
  - Added private `methods: Set<string>` built from string entries in `restrictedMethodSettings`.
  - Added `checkRestrictedMethod(methodName: string): boolean` with one-time console warning.
  - Object-form `RestrictedMethodConfig` entries are ignored (reserved for Phase II).

- `types/assign-gingerly/types.d.ts` and `inferencer/types/assign-gingerly/types.d.ts`
  - Added `checkRestrictedMethod` to the `PermissionProcessor` declaration.
  - Added `permissionProcessor?: PermissionProcessor` to `GetValuesOptions` and `ResolveValuesOptions`.

- `assignGingerly.ts` / `.js`
  - Added exported `isAllowedMethod` helper.
  - Updated `evaluatePathWithMethods` and `applyToEach` to skip restricted method names when consulting `withMethods`.
  - Kept the raw `withMethods`/`withAsyncMethods` allowlist for deciding whether a method *consumes* the next segment as an argument versus leaving it for the next method call.

- `evaluatePathWithAsyncMethods.ts` / `.js`
  - Added `permissionProcessor` parameter and guarded both sync and async method checks.

- `eachTime.ts` / `.js`
  - Forwarded `permissionProcessor` to `evaluatePathWithMethods` for both the path-to-event-source and the path-after-`@eachTime`.

- `resolve/getValues.ts` / `.js`
  - Added local `isAllowedMethod` helper and threaded `permissionProcessor` through `navigatePath`, `getArray`, `getValues`, and `getValue`.

- `assignFrom.ts` / `.js` and `assignFromAsync.ts` / `.js`
  - Passed `permissionProcessor` into `getValues` / `resolveValues` options.

- `tests/restricted-prop-settings.html`
  - Added 7 Phase I method tests covering: blocked method in `withMethods`, `|` zero-arg marker, `akaMethods` alias, restricted method in middle of chain, direct property access unaffected, ignored object-form entries, and `assignFrom` RHS resolution.

### Validation

- `npx playwright test tests/restricted-prop-settings.spec.ts --project=chromium --reporter=list` passes.
- Full `npm test` suite: **87 passed**.

### Note on the `nextIsMethod` logic

One subtlety: when deciding whether a method call should consume the next path segment as an argument, we still consult the raw `withMethods`/`withAsyncMethods` allowlist, not the permission-filtered set. A restricted method name that appears *after* an allowed method should still be treated as a method boundary (so the allowed method is called with no arguments and we move on), even though the restricted method itself will not be invoked. This prevents a restricted method from being silently swallowed as an argument to an earlier method.
