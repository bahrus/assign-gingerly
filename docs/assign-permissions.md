# Assign Permissions

The `assign-gingerly` functions (`assignGingerly`, `assignTentatively`, `assignFrom`, and their async/handler counterparts) are designed to merge values into objects from declarative, JSON-serializable input. When that input comes from sources that cannot be fully trusted — such as HTML attributes, user-provided JSON, or remote configuration — the package provides an **opt-in permission layer** that lets you block or redirect dangerous property assignments before they reach the target.

This document describes the current state of that permission layer.

> **Important:** The permissions object is a **trusted-script-only API**. It must be constructed by your own code and passed explicitly. Never parse permission settings from an untrusted attribute or JSON payload.

---

## Design overview

The permission layer is intentionally instance-based and externally passed:

```JavaScript
import { PermissionProcessor } from 'assign-gingerly/assignPermissions/PermissionProcessor.js';
import assignGingerly from 'assign-gingerly/assignGingerly.js';

const permissionProcessor = new PermissionProcessor({
  restrictedPropSettings: ['innerHTML', 'src']
});

assignGingerly(target, source, options, permissionProcessor);
```

Passing the processor as the last argument keeps the core modules lean when permissions are not needed. The modules that implement `assignGingerly`, `assignTentatively`, and `assignFrom` do not statically import the permission code, so bundlers can drop it entirely when it is unused.

If the fourth argument is omitted, every permission check is skipped and assignments behave as they did before the permission layer existed.

---

## Supported functions

The following entry points accept an optional `permissionProcessor` as their final argument:

| Function | Module | Signature |
|----------|--------|-----------|
| `assignGingerly` | `assignGingerly.js` | `assignGingerly(target, source, options?, permissionProcessor?)` |
| `assignTentatively` | `assignTentatively.js` | `assignTentatively(target, source, options?, permissionProcessor?)` |
| `assignFrom` | `assignFrom.js` | `assignFrom(target, pattern, options?, permissionProcessor?)` |
| `assignFromAsync` | `assignFromAsync.js` | `assignFromAsync(target, pattern, options?, permissionProcessor?)` |
| `attachEventListener` | `handlers/addEventListener.js` | `attachEventListener(..., permissionProcessor?)` |
| Handler plugins | `handlers/*.js` | `assign(lhsTarget, resolvedParams, options?, permissionProcessor?)` |

Internal recursive calls and handler plugins forward the same processor instance so that nested assignments, `@each` iterations, and event-vector assignments inherit the policy.

---

## `AssignPermissions` config shape

The plain configuration object passed to `new PermissionProcessor(...)` is typed as `AssignPermissions`:

```TypeScript
interface AssignPermissions {
  /** Allow imports from cross-domain URLs (default: false) */
  crossDomainImports?: boolean;

  /** Restricted property policies */
  restrictedPropSettings?: Array<string | RestrictedPropSetting>;

  /** Sanitizer options (Phase III+, reserved for future use) */
  sanitizerOptions?: Record<string, any>;

  /** Restricted method policies — blocks or augments withMethods/akaMethods calls */
  restrictedMethodSettings?: Array<string | RestrictedMethodConfig>;
}
```

`sanitizerOptions` is reserved for future use and has no runtime effect on its own today, but its value is resolvable from `restrictedMethodSettings` via the `?.sanitizerOptions` appendArgs path (see below). Everything else is implemented.

---

## `RestrictedPropSetting` object shape

```TypeScript
interface RestrictedPropSetting {
  props: string | string[];
  useMethod?: string;              // Phase II
  attr?: boolean | string | string[]; // Phase III
  allowFromSameDomain?: boolean;   // Phase III
  allowCrossDomain?: boolean;      // Phase III
}
```

- `props` — the property name(s) the policy applies to.
- `useMethod` — an optional method name on the target. When present, ordinary assignments to the property are redirected to `target[useMethod](value)` instead of being blocked.
- `attr` — when `true`, the same policy also applies to `setAttribute(name, ...)` for the matching attribute name(s). May also be a string or array of attribute names.
- `allowFromSameDomain` — when `true`, allows the assignment if the value is a same-origin URL string.
- `allowCrossDomain` — when `true`, allows any URL value (including cross-origin).

---

## Phases of functionality

### Phase I — block property assignments

Pass a string to forbid direct assignment to a property. The assignment is silently skipped and a one-time warning is emitted to the console.

```JavaScript
const permissionProcessor = new PermissionProcessor({
  restrictedPropSettings: ['innerHTML', 'outerHTML']
});

const div = document.createElement('div');
div.innerHTML = '<p>safe</p>';

assignGingerly(div, { innerHTML: '<p>blocked</p>', title: 'allowed' }, undefined, permissionProcessor);

console.log(div.innerHTML); // '<p>safe</p>'
console.log(div.title);     // 'allowed'
```

Phase I blocks ordinary assignments and nested-path assignments (`?.innerHTML`). It also blocks command operators (`+=`, `=!`, `Y=`, `-=`) for the listed property.

### Phase II — redirect to a safe method

Pass an object with `useMethod` to redirect ordinary assignments to a target method. This is useful when the caller wants to sanitize or control how the value is applied.

```JavaScript
const permissionProcessor = new PermissionProcessor({
  restrictedPropSettings: [{ props: 'outerHTML', useMethod: 'replaceWithHTML' }]
});

const target = {
  outerHTML: '<p>safe</p>',
  replaceWithHTML(value) {
    // custom sanitization / replacement logic
    this.outerHTML = value;
  }
};

assignGingerly(target, { outerHTML: '<p>new</p>' }, undefined, permissionProcessor);
```

Rules for `useMethod`:

- Only ordinary assignments are redirected. `+=`, `=!`, and `Y=` remain blocked for the property.
- If `useMethod` is not a function on the target, the assignment falls back to being blocked.
- The method is called as `target[useMethod](value)`.
- Works for nested paths (`?.nested?.outerHTML`) as long as the intermediate object has the method.

### Phase III — URL origin gating for properties and attributes

For properties that hold URLs, you can allow same-origin values or any URL without blocking them.

```JavaScript
const permissionProcessor = new PermissionProcessor({
  restrictedPropSettings: [
    { props: 'src', allowFromSameDomain: true }
  ]
});

const img = document.createElement('img');
assignGingerly(img, { src: '/local/photo.png' }, undefined, permissionProcessor);
console.log(img.src); // '/local/photo.png' — allowed

assignGingerly(img, { src: 'https://example.com/photo.png' }, undefined, permissionProcessor);
console.log(img.src); // still '/local/photo.png' — blocked
```

URL resolution uses `document.baseURI` and compares against `location.origin`. Malformed or empty URLs are treated as disallowed.

The same policy can be applied to `setAttribute` by adding `attr: true`:

```JavaScript
const permissionProcessor = new PermissionProcessor({
  restrictedPropSettings: [
    { props: 'src', attr: true, allowFromSameDomain: true }
  ]
});
```

With `attr: true`, `setAttribute('src', ...)` and direct `src` assignments are checked with the same origin rules.

### Method settings — blocking or augmenting `withMethods`/`akaMethods` calls

`restrictedMethodSettings` governs method calls reached through `withMethods`, `akaMethods`, and the `|` zero-arg marker — the surface that libraries such as [do-assign](https://github.com/bahrus/do-assign) expose to declarative attributes. It is matched **by method name**, independent of which object the method lives on.

```JavaScript
const permissionProcessor = new PermissionProcessor({
  restrictedMethodSettings: ['setHTMLUnsafe']
});

const target = { value: 'safe', setHTMLUnsafe(v) { this.value = v; } };

assignGingerly(target, { '?.setHTMLUnsafe': 'blocked' }, { withMethods: ['setHTMLUnsafe'] }, permissionProcessor);

console.log(target.value); // 'safe' — the call never happened
```

A string entry blocks the named method outright: `isAllowedMethod` (used by every `withMethods`/`akaMethods` code path, sync and async) treats it as if it were never listed in `withMethods`, so the assignment falls back to ordinary property access instead of invoking the method. This applies equally to `akaMethods` aliases and to methods encountered in the middle of a chained path.

An object entry (`{ method, appendArgs }`) does **not** block the call — it appends extra arguments to every invocation of that method. String entries in `appendArgs` starting with `?.` are resolved against the permissions object itself (for example `?.sanitizerOptions` or `?.customSettings`), which is how a sanitizer's options can be threaded through to a `useMethod`-style call without hardcoding them at each call site:

```JavaScript
const permissionProcessor = new PermissionProcessor({
  sanitizerOptions: { allowElements: ['div'] },
  restrictedMethodSettings: [
    { method: 'setHTMLUnsafe', appendArgs: ['?.sanitizerOptions'] }
  ]
});
// target.setHTMLUnsafe(value) is called as target.setHTMLUnsafe(value, { allowElements: ['div'] })
```

Because matching is by name only, pick method names carefully: a name blocked here is blocked for every target, not just DOM elements. `addArgs` is accepted as a deprecated alias for `appendArgs`. A method may not appear more than once across `restrictedMethodSettings` entries — duplicates throw at construction time, the same as `restrictedPropSettings`.

---

## `crossDomainImports`

A separate boolean flag controls whether dynamic imports initiated by handlers (for example, lazy-loaded handlers) may resolve cross-origin URLs. The `PermissionProcessor` exposes this value as a getter so `enhanceAll` can read it without importing the full permission module.

```JavaScript
const permissionProcessor = new PermissionProcessor({
  crossDomainImports: true
});

console.log(permissionProcessor.crossDomainImports); // true
```

This flag is independent of `allowCrossDomain` on a per-property basis. It governs module loading, not property assignment.

---

## Strict default profile: `strictDefaultPermissions`

Libraries built on top of `assign-gingerly` that expose `withMethods`/`akaMethods`
power to declarative sources — most notably HTML attributes, as
[do-assign](https://github.com/bahrus/do-assign) does — hand a lot of leverage to
whatever produced that markup. Unfettered, that's an XSS risk: attacker-controlled
attributes could drive `innerHTML` assignment, cross-origin navigation, or calls to
`insertAdjacentHTML`.

`DX/strictDefaultPermissions.ts` exports a ready-made, restrictive `AssignPermissions`
object for exactly this situation — a shareable default so each consumer doesn't have
to design its own policy from scratch.

```JavaScript
import { strictDefaultPermissions } from 'assign-gingerly/DX/strictDefaultPermissions.js';
import { PermissionProcessor } from 'assign-gingerly/assignPermissions/PermissionProcessor.js';
import assignGingerly from 'assign-gingerly/assignGingerly.js';

const permissionProcessor = new PermissionProcessor(strictDefaultPermissions);
assignGingerly(target, untrustedSource, options, permissionProcessor);
```

It blocks, by default:

| Category | Names | Behavior |
|----------|-------|----------|
| Markup/CSS injection | `innerHTML`, `outerHTML`, `srcdoc`, `cssText` | Blocked outright (Phase I) — no generic safe redirect exists. |
| URL-bearing props/attrs | `src`, `href`, `action`, `formAction` | Same-origin values allowed (Phase III `allowFromSameDomain`); cross-origin, `javascript:`, and malformed URLs blocked. Applies to both the property and the matching attribute. |
| Inline event-handler attributes | `onclick`, `onerror`, `onload`, and ~50 more (see `xssSensitiveAttrs`) | Blocked outright for both the property and `setAttribute`, since the browser compiles the attribute form into a live handler. |
| HTML/rich-text injection methods | `insertAdjacentHTML`, `setHTMLUnsafe`, `execCommand` | Blocked outright via `restrictedMethodSettings` (method-name based — see caveat below). |

Each category is also exported individually (`xssSensitiveMarkupProps`,
`xssSensitiveUrlProps`, `xssSensitiveAttrs`, `xssSensitiveMethods`) so you can spread
them into your own config instead of taking the whole default:

```JavaScript
import { xssSensitiveMarkupProps, xssSensitiveAttrs } from 'assign-gingerly/DX/strictDefaultPermissions.js';

const permissionProcessor = new PermissionProcessor({
  restrictedPropSettings: [
    ...xssSensitiveMarkupProps,
    { props: xssSensitiveAttrs, attr: true },
    'value', // add your own app-specific restriction
  ],
});
```

**Caveats specific to this default:**

- `restrictedMethodSettings` blocks a method **by name**, not by target type (see
  "Method settings" above), so the method list is deliberately narrow — limited to
  names unlikely to collide with an unrelated method on a plain (non-DOM) object.
- The event-handler attribute list is not exhaustive; there's no wildcard/regex
  support in `restrictedPropSettings` today. Spread `xssSensitiveAttrs` and add
  names for handlers not already listed.
- Blocking the `on*` **properties** (not just the attributes) means this profile is
  too strict for trusted script that intentionally assigns handler functions via
  `assignGingerly(el, { onclick: fn })`. Use it for the untrusted-input pipeline
  specifically, not for every call site in an app.
- Like the rest of the permission layer, this is not a sandbox — it only governs
  assignments and method calls made through `assignGingerly`/`assignFrom`/etc.

---

## Validation rules

- A property cannot appear twice in `restrictedPropSettings`. Duplicate entries throw at construction time.
- Object entries must have a non-empty `props` value.
- Warnings are emitted once per blocked property per processor instance, not once per attempted assignment.

---

## Caveats and security notes

- The permission layer is **not a sandbox**. It only blocks or redirects property assignments and `setAttribute` calls that the package itself performs. Direct JavaScript code, event handlers written in script, or other libraries can still mutate the target.
- `restrictedPropSettings` governs **properties** reached through ordinary assignment and `setAttribute`. Method calls reached through `withMethods`/`akaMethods` (e.g. `setHTMLUnsafe`) are governed separately by `restrictedMethodSettings`, matched by method name across all targets — see above.
- Permissions are **not inherited** by default. You must pass the same `PermissionProcessor` instance to every `assign*` call, handler, and nested operation.
- Never construct `AssignPermissions` from an HTML attribute, URL parameter, or untrusted JSON. The permissions object itself is a trusted-script configuration.

---

## Examples

### Block HTML-related properties

```JavaScript
import { PermissionProcessor } from 'assign-gingerly/assignPermissions/PermissionProcessor.js';
import assignGingerly from 'assign-gingerly/assignGingerly.js';

const processor = new PermissionProcessor({
  restrictedPropSettings: ['innerHTML', 'outerHTML', 'src']
});

const target = document.createElement('div');
target.innerHTML = '<p>safe</p>';

assignGingerly(target, {
  innerHTML: '<p>blocked</p>',
  '?.style?.color': 'green'
}, undefined, processor);

console.log(target.innerHTML); // '<p>safe</p>'
console.log(target.style.color); // 'green'
```

### Redirect a property to a sanitizer method

```JavaScript
const processor = new PermissionProcessor({
  restrictedPropSettings: [{ props: 'innerHTML', useMethod: 'setHTMLSafe' }]
});

const target = {
  innerHTML: '',
  setHTMLSafe(value) {
    this.innerHTML = DOMPurify.sanitize(value);
  }
};

assignGingerly(target, { innerHTML: '<img src=x onerror=alert(1)>' }, undefined, processor);
```

### Allow same-origin images

```JavaScript
const processor = new PermissionProcessor({
  restrictedPropSettings: [{ props: 'src', attr: true, allowFromSameDomain: true }]
});

const img = document.createElement('img');
assignGingerly(img, { src: '/assets/logo.png' }, undefined, processor);
// img.src is set

assignGingerly(img, { src: 'https://evil.example.com/x.png' }, undefined, processor);
// img.src remains unchanged, console warning emitted once
```

---

## Related documents

- Type definitions: `types/assign-gingerly/types.d.ts` (`AssignPermissions`, `RestrictedPropSetting`, `RestrictedMethodConfig`, `PermissionProcessor`)
- Implementation: `assignPermissions/PermissionProcessor.ts`
- Origin checks: `assignPermissions/isAllowedUrl.ts`, `assignPermissions/isAllowedImportPath.ts`
- Strict default profile: `DX/strictDefaultPermissions.ts`
- Test page: `tests/restricted-prop-settings.html`
