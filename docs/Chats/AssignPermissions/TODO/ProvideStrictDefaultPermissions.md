# Provide Strict Default Permissions

## Bruce's Ask

Element Enhancements such as [do-assign](https://github.com/bahrus/do-assign) enable quite a bit of power to HTML attributes, including specifying withMethods, akaMethods.  Unfettered, this could introduce serious xss risks.

To tighten the security significantly, I would like such libraries to be able to reach for a shareable, well thought out AssignPermissions configuration object (that has no need to be JSON serializable) that is sufficiently restrictive.

I'm thinking the appropriate location within this package to place the module containing these default settings would be in the DX folder.

Can you provide such an export config setting?  Do you have concerns / suggestions / clarifications you would like to discuss first?  If so, please outline them below.  If not, please implement, and provide the implementation notes below, and update [assign-permissions](/docs/assign-permissions.md) with this export information.

## Claude's Response

No blocking concerns — the existing `AssignPermissions`/`PermissionProcessor` layer already had everything needed (Phases I–III for properties/attributes, plus method-name blocking via `restrictedMethodSettings`), so I implemented directly rather than pausing to discuss. One thing worth flagging explicitly: **`docs/assign-permissions.md` mischaracterized `restrictedMethodSettings` as "Phase IV — not yet implemented."** It is actually implemented and wired into every `withMethods`/`akaMethods` code path (`isAllowedMethod` in `assignGingerly.ts`/`evaluatePathWithAsyncMethods.ts`) and covered by tests in `tests/restricted-prop-settings.html`. That's exactly the mechanism this new default needed for blocking dangerous method calls, so I corrected the stale doc text as part of this change rather than leaving it contradicting the new section.

### What was implemented

- **`DX/strictDefaultPermissions.ts`** — new module exporting `strictDefaultPermissions: AssignPermissions`, plus its four building blocks as separate named exports (`xssSensitiveMarkupProps`, `xssSensitiveUrlProps`, `xssSensitiveAttrs`, `xssSensitiveMethods`) so a consumer can take the whole profile or cherry-pick categories. Follows the `DX/emojis.ts` convention (JSDoc header + `@example`, named consts, aggregate + `export default`).
- **`package.json`** — added the matching `./DX/strictDefaultPermissions.js` entry to the `exports` map (default + types), next to the other `DX/*` entries.
- **`docs/assign-permissions.md`** — added a "Strict default profile" section documenting the new export, a table of what it blocks and why, and its caveats. Also corrected the stale "Phase IV not implemented" text (see above) into an accurate "Method settings" section, since the new default relies on that mechanism.

### What the default actually restricts, and why

| Category | Names | Mechanism |
|---|---|---|
| Markup/CSS injection | `innerHTML`, `outerHTML`, `srcdoc`, `cssText` | Blocked outright (Phase I) — no generic safe redirect exists for raw markup. |
| URL-bearing props/attrs | `src`, `href`, `action`, `formAction` | Same-origin allowed, cross-origin/`javascript:`/malformed blocked (Phase III `allowFromSameDomain`, `attr: true`). |
| Inline event-handler attributes | ~50 `on*` names (`onclick`, `onerror`, `onload`, …) | Blocked outright, both as a property and via `setAttribute`, since the browser compiles the attribute form into a live handler regardless of the property. |
| Method calls | `insertAdjacentHTML`, `setHTMLUnsafe`, `execCommand` | Blocked via `restrictedMethodSettings` (string form) — reachable only through `withMethods`/`akaMethods`. |

Design calls worth surfacing:

- **Method blocking is by name, not by target type.** `restrictedMethodSettings` has no concept of "only when called on an `HTMLElement`" — a blocked name is blocked everywhere. I deliberately kept the method list to three DOM-specific names unlikely to collide with an unrelated method on a plain object, rather than also blocking generic-sounding names like `open`/`write`/`remove` that legitimate non-DOM targets might define.
- **The `on*` attribute list is a curated, non-exhaustive set** (no wildcard/regex support in `restrictedPropSettings` today). It's exported separately (`xssSensitiveAttrs`) precisely so it can be extended.
- **Blocking `on*` as properties, not just attributes, is intentionally stricter than the minimum XSS fix.** It means this profile isn't appropriate for trusted call sites that assign handler functions directly (`assignGingerly(el, { onclick: fn })`); it's meant for the untrusted-input pipeline specifically (e.g. what `do-assign` feeds through from HTML attributes), not as a blanket app-wide default.
- **Left `sanitizerOptions` unpopulated.** It has no runtime effect on its own (reserved field), so populating it in the default would just be silent, misleading configuration.
- Verified at runtime (ad hoc, against the already-compiled `assignPermissions/PermissionProcessor.js`) that construction doesn't throw on duplicate entries and that `innerHTML`, `onclick` (both property and `setAttribute` forms), and `setHTMLUnsafe` are all blocked while unrelated props/methods pass through untouched. Also type-checked `DX/strictDefaultPermissions.ts` in isolation against `AssignPermissions` — no errors.

### Follow-up needed from the maintainer

- Per `CLAUDE.md`, I did not hand-write `DX/strictDefaultPermissions.js` — it needs to go through your normal build step (`tsc`/build script) to produce the compiled output the new `package.json` exports entry points at.
