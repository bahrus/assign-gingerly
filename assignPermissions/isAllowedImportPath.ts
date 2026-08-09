import { isAllowedUrl } from './isAllowedUrl.js';

/**
 * Check whether an import specifier resolves to the current origin or is
 * covered by an import-map entry.
 */
export function isAllowedImportPath(value: string): boolean {
    if (typeof document === 'undefined' || typeof location === 'undefined') return false;
    if (!value || !(value.startsWith('./') || value.startsWith('../') || value.startsWith('/'))) {
        return isImportMapSpecifier(value);
    }

    return isAllowedUrl(value);
}

function isImportMapSpecifier(value: string): boolean {
    const importMaps = document.querySelectorAll('script[type="importmap"]');
    for (const importMap of importMaps) {
        try {
            const parsed = JSON.parse(importMap.textContent ?? '');
            if (!isImportMap(parsed)) continue;
            for (const key of Object.keys(parsed.imports)) {
                if (key.endsWith('/') ? value.startsWith(key) : value === key) return true;
            }
        } catch {
            // Ignore malformed import maps and continue searching.
        }
    }
    return false;
}

function isImportMap(value: unknown): value is { imports: Record<string, unknown> } {
    if (!value || typeof value !== 'object' || !('imports' in value)) return false;
    const { imports } = value;
    return !!imports && typeof imports === 'object' && !Array.isArray(imports);
}
