# Refactor isAllowedImportPath

---

## Human Ask

The module isAllowedImportPath.js originally contained the reusable export function isAllowedImportPath only.  The module has since morphed into a general purpose module for all the assignPermissions functionality, which was a mistake.

Please create a folder, assignPermissions, and move the module in there, and separate out the isAllowdImportPath from the other functionality.

Also, as far as how the isAllowedImportPath behaves, please consider changing the logic to:

1.  Try new URL(value, document.baseURI)` and check if `url.origin === location.origin
2.  If not find all the script type=importmap nodes in the document, parse the JSON, and check if any of the lhs's of the importmap's are a substring of value.

---

## Codex response -- Implementation Notes / Proposed Decisions

### Module boundaries and public API

The current root `isAllowedImportPath.ts` is a public package subpath export
(`assign-gingerly/isAllowedImportPath.js`) and contains both the path predicate
and the restricted-property permission helpers (`buildRestrictedPropSet`,
`checkRestrictedProp`, and `redirectRestrictedProp`).  The refactor should make
the boundaries explicit:

- `assignPermissions/isAllowedImportPath.ts` contains only the exported path
  predicate.
- `assignPermissions/restrictedProps.ts` contains the restricted-property
  helpers and its private warning state.
- Existing callers import the appropriate module directly.
- Keep `isAllowedImportPath.ts` at the package root as a deprecated forwarding
  module, and retain its existing export-map entry, so current downstream
  imports do not become a breaking change.  It can re-export the predicate and
  the legacy helper/type exports while directing new code to the new modules.
- Add explicit package export-map entries for the new public paths only if they
  are intended to be supported for consumers.  My recommendation is to expose
  `./assignPermissions/isAllowedImportPath.js` and keep `restrictedProps` an
  internal module unless there is a use case for consumers to call those
  helpers.

`AssignPermissions` already has its canonical definition in
`types/assign-gingerly/types.d.ts`; it should continue to be imported from
there rather than being defined in either new implementation module.

### Exact path predicate semantics

I recommend the following interpretation of the requested algorithm:

1. Resolve `value` with `new URL(value, document.baseURI)`.  Return `true` if
   the resulting URL's `origin` equals `location.origin`.
2. Otherwise, inspect every `script[type="importmap"]` in document order.
   Parse each script's text as JSON.  For the import map's `imports` object,
   return `true` if a mapping key is a prefix of `value` (that is, the key is
   contained at the beginning of the specifier).  This is the useful and safe
   reading of “lhs is a substring”: `@vendor/` allows `@vendor/widget`, while
   `vendor` must not allow `not-vendor/module` merely because it occurs in the
   middle of the value.
3. Return `false` if neither condition succeeds.

This intentionally makes an unmapped bare specifier disallowed.  Under the
current implementation, every bare specifier is allowed; under the proposed
algorithm it is allowed only when an import-map key covers it.  Package-like
keys without a trailing slash should follow import-map matching rules: an exact
match is allowed, while a trailing-slash key is a prefix match.

For `imports` keys, the implementation should use only own enumerable keys and
should ignore `scopes` unless scope-aware policy is explicitly requested later.
The requested rule says “all ... importmap nodes,” so mappings from all valid
maps are considered rather than only the first map.

### Failure and runtime behavior

- A malformed import-map JSON block, a non-object `imports` member, or an
  invalid mapping value should be ignored and must not throw.  A malformed
  unrelated map must not prevent a later valid map from authorizing a path.
- The function should fail closed (`false`) if `document`, `document.baseURI`,
  or `location` is unavailable, rather than throwing in SSR/non-browser
  contexts.  This is a behavior change worth covering in tests.
- `new URL` accepts schemes other than `http(s)` (for example `data:`); the
  origin comparison naturally rejects their opaque origins.  Protocol-relative
  URLs resolve using the page protocol and are allowed only when they resolve
  to the same origin.
- `value` should be a string parameter as it is today.  Callers that receive
  untrusted values should validate/coerce before calling it; this helper should
  return `false` for an empty or malformed string.

### Tests to add during implementation

Cover same-origin relative, absolute, and full URLs; cross-origin and opaque
URLs; exact and trailing-slash import-map keys; no match; multiple maps;
malformed maps; and absent browser globals.  Also update existing tests that
expect arbitrary bare specifiers to be allowed, since that expectation changes
under this proposal.

---

## Human Response I

Please don't bother to worry about:

> Keep `isAllowedImportPath.ts` at the package root as a deprecated forwarding
  module, and retain its existing export-map entry, so current downstream
  imports do not become a breaking change.

As I will make the needed adjustments if any to the dependencies.

I'd like to correct the algorithm a bit (my bad):

1. If value starts with './' or '/' or '../', resolve `value` with `new URL  (value, document.baseURI)`.  Return `true` if
   the resulting URL's `origin` equals `location.origin`.  Or is the second check redundant?
2. Otherwise, inspect every `script[type="importmap"]` in document order.
   Parse each script's text as JSON.  For the import map's `imports` object,
   return `true` if a mapping key is a prefix of `value` (that is, the key is
   contained at the beginning of the specifier).  This is the useful and safe
   reading of “lhs is a substring”: `@vendor/` allows `@vendor/widget`, while
   `vendor` must not allow `not-vendor/module` merely because it occurs in the
   middle of the value.
3. Return `false` if neither condition succeeds.

If that makes sense, please begin implementing.


