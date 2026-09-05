/**
 * strictDefaultPermissions.ts — A restrictive, ready-to-use `AssignPermissions`
 * profile for libraries built on top of assign-gingerly that expose
 * `withMethods` / `akaMethods` power to declarative sources such as HTML
 * attributes (e.g. https://github.com/bahrus/do-assign). Unfettered, that
 * power lets untrusted markup drive arbitrary property assignment and method
 * calls — this profile closes the well-known DOM XSS sinks by default.
 *
 * This is a trusted-script-only config object (see docs/assign-permissions.md).
 * It is exported as plain data for convenience, not because it needs to be
 * JSON-serializable — never construct it from an untrusted attribute or payload.
 *
 * @example
 * import { strictDefaultPermissions } from 'assign-gingerly/DX/strictDefaultPermissions.js';
 * import { PermissionProcessor } from 'assign-gingerly/assignPermissions/PermissionProcessor.js';
 * import assignGingerly from 'assign-gingerly/assignGingerly.js';
 *
 * const permissionProcessor = new PermissionProcessor(strictDefaultPermissions);
 * assignGingerly(target, untrustedSource, options, permissionProcessor);
 *
 * @example Extend rather than replace
 * import { strictDefaultPermissions, xssSensitiveAttrs } from 'assign-gingerly/DX/strictDefaultPermissions.js';
 *
 * const permissionProcessor = new PermissionProcessor({
 *   ...strictDefaultPermissions,
 *   restrictedPropSettings: [
 *     ...strictDefaultPermissions.restrictedPropSettings!,
 *     'value', // also lock down this app's own sensitive prop
 *   ],
 * });
 */
import type { AssignPermissions } from '../types/assign-gingerly/types.js';

/**
 * HTML event-handler content attributes. The browser compiles these into
 * live event handlers as soon as they're set via `setAttribute` (and they
 * shadow the identically-named element properties), so both forms are
 * blocked outright — there's no safe "same-domain" version of inline script.
 *
 * Not exhaustive (there is no wildcard/regex support in `restrictedPropSettings`
 * today — see docs/assign-permissions.md). Spread this array and add more
 * names for handlers not listed here.
 */
export const xssSensitiveAttrs = [
    'onabort', 'onanimationend', 'onanimationiteration', 'onanimationstart',
    'onauxclick', 'onbeforeinput', 'onbeforetoggle', 'onblur',
    'onchange', 'onclick', 'oncontextmenu', 'oncopy', 'oncut',
    'ondblclick', 'ondrag', 'ondragend', 'ondragenter', 'ondragleave',
    'ondragover', 'ondragstart', 'ondrop', 'onerror', 'onfocus',
    'oninput', 'onkeydown', 'onkeypress', 'onkeyup', 'onload',
    'onmousedown', 'onmouseenter', 'onmouseleave', 'onmousemove',
    'onmouseout', 'onmouseover', 'onmouseup', 'onpaste',
    'onpointerdown', 'onpointerenter', 'onpointerleave', 'onpointermove',
    'onpointerout', 'onpointerover', 'onpointerup', 'onreset',
    'onscroll', 'onselect', 'onsubmit', 'ontoggle',
    'ontouchcancel', 'ontouchend', 'ontouchmove', 'ontouchstart',
    'ontransitionend', 'onwheel',
];

/**
 * Properties that assign raw markup/CSS into the DOM. There is no generic
 * safe redirect for these, so they're blocked outright (Phase I) rather than
 * gated by origin. Consumers who need HTML/CSS injection should route
 * through a sanitizer via `useMethod` in their own extended config — see
 * docs/assign-permissions.md, Phase II.
 */
export const xssSensitiveMarkupProps = ['innerHTML', 'outerHTML', 'srcdoc', 'cssText'];

/**
 * Properties that carry a URL. Cross-origin values are blocked; same-origin
 * values (including relative paths) are allowed through for both the
 * property and the matching attribute. This stops `javascript:`, `data:`,
 * and cross-origin navigation/exfiltration while leaving normal same-app
 * links, images, scripts, and form actions working.
 */
export const xssSensitiveUrlProps = ['src', 'href', 'action', 'formAction'];

/**
 * Methods most associated with runtime HTML/rich-text injection. Method
 * blocking in `restrictedMethodSettings` is by name only, not by target type
 * (see docs/assign-permissions.md, Phase IV), so this list is deliberately
 * narrow to DOM-specific names unlikely to collide with unrelated methods on
 * plain objects.
 */
export const xssSensitiveMethods = ['insertAdjacentHTML', 'setHTMLUnsafe', 'execCommand'];

/**
 * A restrictive `AssignPermissions` default suitable as a starting point for
 * any consumer that lets less-trusted input drive `assignGingerly`. Merge
 * or spread it to tighten further — see the module doc above for examples.
 */
export const strictDefaultPermissions: AssignPermissions = {
    crossDomainImports: false,
    restrictedPropSettings: [
        ...xssSensitiveMarkupProps,
        { props: xssSensitiveUrlProps, attr: true, allowFromSameDomain: true },
        { props: xssSensitiveAttrs, attr: true },
    ],
    restrictedMethodSettings: [...xssSensitiveMethods],
};

export default strictDefaultPermissions;
