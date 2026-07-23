/**
 * pinCorrector.ts — Dev-time diagnostic for stale pin coordinates.
 * 
 * Dynamically imported only on mismatch — zero cost in production or when coordinates are correct.
 * Computes and logs the correct child index path for a given selector.
 */

/**
 * Compute the child index path from a root element to a target element.
 * Returns the array of children indices, or null if not found.
 */
function computeChildPath(root: Element, target: Element): number[] | null {
    const path: number[] = [];
    let current: Element | null = target;

    while (current && current !== root) {
        const parent = current.parentElement;
        if (!parent) return null;
        const idx = Array.prototype.indexOf.call(parent.children, current);
        if (idx === -1) return null;
        path.unshift(idx);
        current = parent;
    }

    return current === root ? path : null;
}

/**
 * Log a correction suggestion for a mismatched pin config.
 */
export function logConfigCorrection(
    target: any,
    varName: string,
    config: { path: number[]; expect?: string; fallback?: boolean }
): void {
    if (!config.expect) return;

    const correctEl = target.querySelector?.(config.expect);
    if (!correctEl) {
        console.warn(
            `pin["${varName}"]: path [${config.path}] did not match "${config.expect}" ` +
            `and querySelector also found no match. Check that the selector is correct.`
        );
        return;
    }

    const correctPath = computeChildPath(target, correctEl);
    if (correctPath) {
        console.warn(
            `pin["${varName}"]: path [${config.path}] did not match "${config.expect}". ` +
            `Suggested correction: [${correctPath.join(', ')}]`
        );
    } else {
        console.warn(
            `pin["${varName}"]: path [${config.path}] did not match "${config.expect}". ` +
            `Could not compute a child index path (element may not be a descendant of target).`
        );
    }
}
