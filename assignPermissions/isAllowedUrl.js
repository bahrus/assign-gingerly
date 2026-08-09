/**
 * Check whether a URL string resolves to the current origin.
 *
 * Returns false for non-strings, empty strings, malformed URLs, or
 * any URL whose origin differs from `location.origin`.
 */
export function isAllowedUrl(value, base = document.baseURI) {
    if (typeof document === 'undefined' || typeof location === 'undefined')
        return false;
    if (typeof value !== 'string' || value === '')
        return false;
    try {
        return new URL(value, base).origin === location.origin;
    }
    catch {
        return false;
    }
}
