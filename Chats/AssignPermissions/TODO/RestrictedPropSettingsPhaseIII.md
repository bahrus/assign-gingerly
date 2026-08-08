# Restricted Prop Settings Phase III


---

## Human Ask

Now that [RestrictedPropSettingsPhaseI](/Chats/AssignPermissions//RestrictedPropSettingsPhaseI.md) and [RestrictedPropSettingsPhaseII](/Chats/AssignPermissions/RestrictedPropSettingsPhaseII.md) have been done, let's move on to phase III:

```JS
{   
    ...
        //Phase III
        {
            prop: 'src',
            //if not specified, don't check for calls to setAttribute
            attr: 'src', //watches for setAttribute method call
            allowFromSameHost: true, //use isAllowedImportPath?  change name to more generic?
            allowCrossDomain: false, //if true, no holds barred
        }
    ...
}
```

If both allowFromSameHost and allowCrossDomain are false, the property src and setAttribute(src) are not permitted via assign*.

If allowFromSameHost use the module assignPermissions/isAllowedImportPath.js to validate the src.

---

## AI Thoughts / Concerns

Before implementing Phase III, a few things that need to be pinned down:

### 1. `isAllowedImportPath` is probably the wrong tool for `src` validation

`assignPermissions/isAllowedImportPath.ts` is built for **import specifiers**: it treats bare specifiers as import-map lookups and relative paths as same-origin. For an element's `src` attribute this is semantically incorrect:

- Bare specifiers like `"my-app/img.png"` are not valid `src` values and should not be approved because they happen to be import-map keys.
- Import-map coverage is irrelevant to `<img src>`, `<script src>`, `<iframe src>`, etc.
- The name `isAllowedImportPath` strongly signals "imports"; reusing it for attribute URLs will confuse future maintainers.

**Suggestion:** create a small, dedicated helper—`assignPermissions/isAllowedUrl.ts` or similar—that only checks origin. Keep `isAllowedImportPath` for import paths. If we want a single shared primitive, both can delegate to an internal `isSameOrigin(url)` helper, but the public names and call sites should stay separate.

### 2. What does "same host" mean exactly?

The current `isAllowedImportPath` compares `new URL(value, document.baseURI).origin === location.origin`. That is actually "same origin" (scheme + host + port), not just host. We should decide whether Phase III means:

- `location.origin` (scheme, host, port) — safest and most conventional for URL restrictions.
- `location.host` (host + port, ignoring scheme) — would allow `http:` from an `https:` page, which is usually wrong.
- hostname only — would allow cross-port and cross-scheme, almost certainly too permissive.

**Recommendation:** define `allowFromSameHost` as same-origin against `location.origin`, using the `URL` constructor with `document.baseURI` as the base so relative URLs are resolved consistently with the document. The field name can stay as-is for user-friendliness, but the docs should clarify it means same origin.

### 3. Property assignment vs. `setAttribute` can resolve URLs differently

For reflected attributes like `src`:

```js
img.src = '/x.png';           // resolved absolutely against document base URL
img.setAttribute('src', '/x.png'); // stored literally, but reading the IDL attr resolves it
```

If we validate the raw string `/x.png`, it is the same in both cases. But if the user passes an absolute cross-origin string, the property setter may resolve it the same way `new URL(value, document.baseURI)` does. We need to make sure the validator uses the **same base URL and resolution rules** for both the property path and the `setAttribute` path. Otherwise a value could pass one gate and fail the other, or worse, bypass the gate.

**Open question:** do we validate the raw assigned string, or the post-resolution URL? Validating the raw string is simpler and consistent, but a value like `//evil.com/img.png` (protocol-relative) is dangerous if later resolved against the page's scheme. `new URL()` handles this correctly; we should rely on it rather than string-prefix checks.

### 4. Intercepting `setAttribute` is non-trivial

`assignGingerly` today assigns properties. Phase III says "watches for setAttribute method call." The watcher could mean one of two things:

1. **During the `assignGingerly` call only:** if the assignment is redirected to `useMethod` or if the source value is a call expression? But the source is data, not code.
2. **Wrap the target's `setAttribute` so any later call is guarded:** this is much broader and would affect code outside `assignGingerly`.

Given the existing `redirectRestrictedProp` architecture, the likely interpretation is: when a restricted prop is being assigned, if the setting also declares `attr`, we may choose to call `setAttribute(attr, value)` instead of assigning the property, **and** we validate the value first. But the wording "watches for setAttribute method call" suggests the reverse—detecting calls to `target.setAttribute(...)` inside or outside the library.

**Need clarification:** Is the goal to (a) redirect property assignment to `setAttribute` after validation, or (b) monkey-patch `Element.prototype.setAttribute` / the instance so that calls to `setAttribute('src', ...)` are also gated by the same permission?

If it is (b), that is a much larger security surface and should probably be Phase IIIb, not part of the basic property-assignment guard.

### 5. Decision matrix for the two booleans

| `allowCrossDomain` | `allowFromSameHost` | intended behavior |
|---|---|---|
| `true` | * | allow any URL |
| `false` | `true` | allow only same-origin URLs |
| `false` | `false` | block all assignments to `prop`/`attr` |

This is what the human ask states, but the implementation should make `allowCrossDomain` an explicit early-exit so the two flags do not accidentally combine into a partially permissive state. Also need to decide whether missing `allowFromSameHost` defaults to `false` (secure-by-default) or whether omitting it leaves Phase I/II behavior intact.

### 6. Other URL-bearing attributes will come up immediately

`src` is the example, but the same risk exists for:

- `href` on `<a>`, `<link>`, `<area>`, `<base>`
- `action` / `formaction` on `<form>` / submit buttons
- `cite` on `<blockquote>` / `<del>` / `<ins>` / `<q>`
- `data` on `<object>`
- `poster` on `<video>`
- `srcset` on `<img>` / `<source>` (multi-URL, comma-separated)
- `background`, `codebase`, `longdesc`, `profile` (legacy but still used)

If the design is hard-coded to `src`, we will need a redesign for the next attribute. It may be better to make Phase III generic from the start: `prop` names the property, `attr` names the attribute to guard, and a shared validator handles any reflected URL attribute. `srcset` can be a future phase because of its parsing complexity.

### 7. What is the validation contract when a URL is rejected?

Today `redirectRestrictedProp` returns `true` when it has "handled" the assignment (either by skipping or by delegating to `useMethod`). For Phase III:

- If validation passes, the normal assignment should proceed (return `true` to caller so it skips its own assignment).
- If validation fails, the assignment should be **silently skipped** and return `true`? Or should it throw?

Phase I/II currently warn once and skip. For consistency, Phase III should probably warn once per setting and skip. But a security feature might be safer if it throws, because silent failures hide injection attempts. Need to decide on error policy.

### 8. Handling non-string values and non-Element targets

- `src` can receive `null`, `undefined`, numbers, or objects. The validator should coerce to string or skip validation for non-string values.
- Some `assign*` targets are plain objects, not elements. `setAttribute` does not exist there. If `attr` is specified, the setting should probably be ignored (or treated as property-only) for non-Element targets rather than throwing.

### 9. Where should the validation live?

`restrictedProps.ts` already has three helpers:

- `buildRestrictedPropSet`
- `checkRestrictedProp` (blocks)
- `redirectRestrictedProp` (delegates to `useMethod`)

Phase III needs a new helper, e.g. `validateRestrictedUrl(setting, value) => boolean`, plus a new branch in `redirectRestrictedProp` that runs before the `useMethod` branch. The type updates in `types/assign-gingerly/types.d.ts` are already in place, which is good.

### 10. Testing considerations

Tests should cover at least:

- Relative URL on same origin → allowed.
- Absolute same-origin URL → allowed.
- Cross-origin URL → blocked.
- Protocol-relative URL (`//other.host/...`) → blocked when resolved against current scheme.
- `javascript:`, `data:`, `blob:` URLs → blocked unless `allowCrossDomain` is true.
- Non-string value → handled safely.
- Both flags false → assignment skipped regardless of value.
- `allowCrossDomain: true` → any value allowed.
- `setAttribute` path vs. property path produce the same verdict.

### Bottom line

I recommend:

1. Do **not** reuse `isAllowedImportPath` for attribute URLs; create a dedicated same-origin validator.
2. Treat `allowFromSameHost` as same-origin against `location.origin` with `document.baseURI` as the base.
3. Decide whether Phase III really needs to monkey-patch `setAttribute`, or whether redirecting property assignment through a validated `setAttribute` call is sufficient.
4. Make the design generic enough to support `href`, `action`, etc., with `srcset` deferred.
5. Keep the skip-and-warn behavior consistent with Phase I/II unless there is a strong reason to throw.

---

## Human Response I

The module isAllowedImportPath has a line:


```JS
return new URL(value, document.baseURI).origin === location.origin;
```

It's a quite short line.  Maybe it's silly, but that line could be turned into a tiny exportable function from that module, and maybe reuse that function?  I guess I'm okay with just embedding that check for valid src values.

> What does "same host" mean exactly

Okay, would allowFromSameDomain be a clearer name?

> **During the `assignGingerly` call only:** if the assignment is redirected to `useMethod`

Only via assignGingerly's "withMethods" way of calling methods should be of concern, nothing else.

> `src` is the example, but the same risk exists for

Some of those (like cite) may be relatively harmless.  cite seems to only be used by search engines.

I'm trying to keep the footprint of this small.  I'm starting to wonder if this optional parameter should be first be optionally loaded into a class instance of some sort (PermissionValidator or some such), where all the initial jockeying can be done, and then the check can be one or two liner call from the various places?  Let's keep that as a separate phase if you think that's worth exploring.  Let me know if you think that should be resolved first before proceeding with even this phase.

But from a management point of view, I guess we need a more succinct way of listing them all:

```JS
{   
    ...
        //Phase III
        {
            props: ['src', 'href', 'action', ...],
            //if not specified, don't check for calls to setAttribute
            attr: true, //watches for setAttribute method call with the same name
            allowFromSameHost: true, //use isAllowedImportPath?  change name to more generic?
            allowCrossDomain: false, //if true, no holds barred
        }
    ...
}
```

What do you think?

---

## AI Response I

### Reusing the URL check

That one-liner is exactly the right primitive, so yes—extract it. But I would still give the extracted helper a name that doesn't say "import" when it's used for `src`/`href` validation. The cleanest way:

- Keep `isAllowedImportPath` for import paths (it may still need import-map logic).
- Add a tiny shared function—e.g. `isSameOriginUrl(value, base?)`—that does `new URL(value, base).origin === location.origin`.
- `isAllowedImportPath` can call `isSameOriginUrl` for the relative/absolute case, and the Phase III validator calls it directly.

That keeps the semantics honest while avoiding code duplication.

### `allowFromSameHost` → `allowFromSameDomain`

Yes, `allowFromSameDomain` is clearer. It's a breaking change for any existing config that already has `allowFromSameHost`, but since Phase III isn't released yet, the blast radius is probably zero. I'd rename it now in `types/assign-gingerly/types.d.ts` rather than carry the misleading name forward.

If you want to be defensive, the runtime could accept either key for one release and warn about the old name. But for a feature this new, a clean rename is probably fine.

### `setAttribute` interception scope

Understood—**only guard `setAttribute` calls that go through `assignGingerly`'s `withMethods` path**, not a global monkey-patch. That limits the surface dramatically.

In that path, the value can be an array (for `method.apply`) or a single value (for `method.call`). For `setAttribute`, the interesting shapes are:

```js
// via withMethods, value as array
el.setAttribute('src', 'https://evil.com/x.png');

// via withMethods, value as single arg (still valid for setAttribute with one arg,
// though it would set the attribute to the literal undefined/stringified value)
```

The guard needs to:

1. Recognize the method name is `setAttribute`.
2. Extract the first argument and see if it matches a restricted attr name.
3. Validate the second argument as a URL according to the matching setting.
4. If validation fails, skip the call and warn once.

### `props: [...]` and `attr: true`

This is a big improvement. I think the type should support:

```ts
export interface RestrictedPropSetting {
    prop?: string | string[];   // keep for backward compat / single prop
    props?: string | string[];  // plural alias, normalized to an array
    useMethod?: string;         // Phase II
    attr?: boolean | string | string[]; // Phase III
    allowFromSameDomain?: boolean;
    allowCrossDomain?: boolean;
}
```

Semantics:

- `prop: 'src'` or `props: ['src']` guards property assignment to `src`.
- `attr: true` additionally guards `setAttribute('src', value)` for every name in `props`.
- `attr: 'src'` or `attr: ['src', 'href']` guards `setAttribute` for those specific attribute names only.
- If `attr` is omitted, no `setAttribute` interception happens.

This makes `cite` opt-in, which addresses your concern about over-blocking harmless attributes.

### PermissionValidator class

Agree—keep it as a separate phase. The current `buildRestrictedPropSet` already produces a normalized `Map`, so the refactor to a class is straightforward later without changing the public API. For Phase III we can add a second map (`Map<string, RestrictedPropSetting>` keyed by attr name) and a helper function, and it will still be only a few lines at the call sites.

### Precedence between URL validation and `useMethod`

Need to decide what happens when a setting has both `allowFromSameDomain` and `useMethod`:

```js
{ prop: 'src', allowFromSameDomain: true, useMethod: 'setSafeSrc' }
```

I recommend:

1. Validate the URL first.
2. If invalid, skip (security gate wins).
3. If valid, then honor `useMethod` if present, otherwise do the normal assignment.

That keeps `useMethod` as a "where to put the allowed value" redirect, not a bypass.

### Where this needs to be wired in

`assignGingerly` has multiple places that call `redirectRestrictedProp`:

- Nested path with `withMethods`
- Nested path without `withMethods`
- Non-nested path with `withMethods` (method and non-method)
- `@each` iteration
- Captured async closure

The `setAttribute` guard needs to sit in the `withMethods` method-call branches before `method.apply`/`method.call`. The URL-validation branch in `redirectRestrictedProp` needs to be hit from all the non-method assignment branches.

`assignFrom` already forwards `permissions` and calls `redirectRestrictedProp`, so it should inherit the behavior once `redirectRestrictedProp` is updated.

`assignTentatively` only imports `checkRestrictedProp` (block-only). If we want it to support same-origin URL allows, we need to wire in the new allow-or-block helper too. That may be out of scope for this phase; worth calling out.

### Suggested implementation order

1. Rename `allowFromSameHost` → `allowFromSameDomain` in `types/assign-gingerly/types.d.ts`.
2. Add `assignPermissions/isAllowedUrl.ts` with the shared same-origin check.
3. Update `assignPermissions/restrictedProps.ts` to:
   - accept `prop`/`props` and `attr` boolean/string/string[]
   - build a prop map and an attr map
   - add URL validation branch to `redirectRestrictedProp`
   - add a helper for `setAttribute` arg validation
4. Update `assignGingerly.ts`:
   - call the new helper before `method.apply`/`method.call` in the `withMethods` branches
   - make sure `redirectRestrictedProp` is reached from every assignment branch
5. Add WPT/playwright tests covering same-origin allow, cross-origin block, `setAttribute` via `withMethods`, `allowCrossDomain`, and both-flags-false.

If that order looks good, I can start with steps 1–3.

---

## Human Response II

> It's a breaking change [`allowFromSameHost` → `allowFromSameDomain`]

There's absolutely no use of the permissions support so far.  Please don't add any technical debt to be backwards compatible.

In the same vein, let's not support both prop and props.  Let's only support one, string | string[], and please use your judgment which one is clearer.

Please start with steps 1-3 and add the implementation notes below.

