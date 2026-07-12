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
