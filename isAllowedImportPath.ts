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

// Re-export AssignPermissions from canonical location for backwards compatibility
export type { AssignPermissions } from './types/assign-gingerly/types.js';
import type { AssignPermissions } from './types/assign-gingerly/types.js';

/**
 * Module-level warn dedup — one warning per property key per process lifetime.
 */
const warnedOnce = new Set<string>();

/**
 * Warn once per key that a restricted property assignment was skipped.
 */
function warnRestricted(key: string): void {
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
export function buildRestrictedPropSet(permissions: AssignPermissions | undefined): Set<string> | undefined {
    const settings = permissions?.restrictedPropSettings;
    if (!settings || settings.length === 0) return undefined;
    const strings = settings.filter((x): x is string => typeof x === 'string');
    return strings.length > 0 ? new Set(strings) : undefined;
}

/**
 * Check if a property key is restricted. If so, warn (once) and return true.
 * Call sites should `continue` or skip the assignment when this returns true.
 */
export function checkRestrictedProp(restrictedPropSet: Set<string> | undefined, key: string): boolean {
    if (!restrictedPropSet || !restrictedPropSet.has(key)) return false;
    warnRestricted(key);
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
export function isAllowedImportPath(path: string): boolean {
    if (path.startsWith('./') || path.startsWith('../') || path.startsWith('/')) {
        return true;
    }
    if (path.includes('://') || path.startsWith('//')) {
        return false;
    }
    // Bare specifier (no protocol, no //) — allowed
    return true;
}
