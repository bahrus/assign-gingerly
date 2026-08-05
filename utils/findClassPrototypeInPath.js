import { isAllowedImportPath } from '../assignPermissions/isAllowedImportPath.js';
/**
 * Thrown when a dynamic import path is not covered by the allowed-import policy.
 */
export class ImportNotAllowedError extends Error {
    path;
    constructor(path) {
        super(`Import path "${path}" is not allowed.`);
        this.path = path;
        this.name = 'ImportNotAllowedError';
        console.error(`ImportNotAllowedError: ${path}`);
    }
}
/**
 * Thrown when a module does not export a class that satisfies the required criteria.
 */
export class NoMatchingExportError extends Error {
    path;
    constructor(path) {
        super(`Module "${path}" does not export a matching class with a prototype.`);
        this.path = path;
        this.name = 'NoMatchingExportError';
        console.error(`NoMatchingExportError: ${path}`);
    }
}
/**
 * Base check: value must be a function with a prototype (i.e., a class constructor).
 */
function isClassWithPrototype(value) {
    return typeof value === 'function' && value.prototype !== undefined;
}
/**
 * Dynamically import a module at the given path, validate the path against the
 * allowed-import policy, and return the first exported class whose prototype passes
 * the optional criteria check.
 *
 * The default export is checked first. If it does not satisfy the checks, all named
 * exports are scanned. If no matching class is found, a `NoMatchingExportError` is thrown.
 */
export async function findClassPrototypeInPath(path, criteria) {
    if (!isAllowedImportPath(path)) {
        throw new ImportNotAllowedError(path);
    }
    const module = await import(path);
    const candidates = [
        module.default,
        ...Object.values(module).filter((exported) => exported !== module.default),
    ];
    for (const exported of candidates) {
        if (!isClassWithPrototype(exported))
            continue;
        if (criteria && !criteria(exported))
            continue;
        return exported;
    }
    throw new NoMatchingExportError(path);
}
