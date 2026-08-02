/**
 * isAllowedImportPath.ts — Security utility for validating import paths.
 *
 * Checks that a path is local (relative, absolute, or bare specifier) and
 * not a cross-domain URL. Used to prevent untrusted HTML attributes from
 * triggering imports to arbitrary external domains.
 *
 * @example
 * import { isAllowedImportPath } from 'assign-gingerly/isAllowedImportPath.js';
 *
 * isAllowedImportPath('./local.js');           // true
 * isAllowedImportPath('../parent/file.js');    // true
 * isAllowedImportPath('/absolute/path.js');    // true
 * isAllowedImportPath('bare-specifier/mod.js'); // true
 * isAllowedImportPath('https://evil.com/x.js'); // false
 * isAllowedImportPath('//cdn.example.com/x.js'); // false
 */
/**
 * Module-level warn dedup — one warning per property key per process lifetime.
 */
const warnedOnce = new Set();
/**
 * Warn once per key that a restricted property assignment was skipped.
 */
function warnRestricted(key) {
    if (!warnedOnce.has(key)) {
        warnedOnce.add(key);
        console.warn(`assignGingerly: property '${key}' is in restrictedPropSettings — assignment skipped.`);
    }
}
/**
 * Normalize the restrictedPropSettings from permissions into a fast-lookup Set.
 * Phase I: extracts string entries only (object entries are Phase II+).
 * Returns undefined when nothing is restricted (fast-bail in callers).
 */
export function buildRestrictedPropSet(permissions) {
    const settings = permissions?.restrictedPropSettings;
    if (!settings || settings.length === 0)
        return undefined;
    const restrictedPropSet = new Map();
    for (const setting of settings) {
        const prop = typeof setting === 'string' ? setting : setting.prop;
        if (restrictedPropSet.has(prop)) {
            throw new Error(`assignGingerly: duplicate restrictedPropSettings entry for '${prop}'.`);
        }
        restrictedPropSet.set(prop, typeof setting === 'string' ? undefined : setting);
    }
    return restrictedPropSet;
}
/**
 * Check if a property key is restricted. If so, warn (once) and return true.
 * Call sites should `continue` or skip the assignment when this returns true.
 */
export function checkRestrictedProp(restrictedPropSet, key) {
    if (!restrictedPropSet || !restrictedPropSet.has(key))
        return false;
    warnRestricted(key);
    return true;
}
/**
 * Redirect an ordinary assignment through its configured safe method.
 * Returns true when the property is restricted, whether redirected or skipped.
 */
export function redirectRestrictedProp(restrictedPropSet, target, key, value) {
    if (!restrictedPropSet || !restrictedPropSet.has(key))
        return false;
    const setting = restrictedPropSet.get(key);
    if (!setting?.useMethod) {
        warnRestricted(key);
        return true;
    }
    const method = target?.[setting.useMethod];
    if (typeof method !== 'function') {
        warnRestricted(key);
        return true;
    }
    method.call(target, value);
    return true;
}
/**
 * Check if an import path is allowed (non-cross-domain).
 *
 * Allowed:
 * - Relative paths: ./foo.js, ../bar.js
 * - Absolute paths: /path/to/file.js
 * - Bare specifiers: package-name/file.js, @scope/package/file.js
 *
 * Blocked:
 * - Protocol URLs: https://..., http://..., data:..., etc.
 * - Protocol-relative: //cdn.example.com/...
 *
 * @param path - The import path to validate
 * @returns true if the path is local/safe, false if cross-domain
 */
export function isAllowedImportPath(path) {
    if (path.startsWith('./') || path.startsWith('../') || path.startsWith('/')) {
        return true;
    }
    if (path.includes('://') || path.startsWith('//')) {
        return false;
    }
    // Bare specifier (no protocol, no //) — allowed
    return true;
}
