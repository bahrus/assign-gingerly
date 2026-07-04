/**
 * resolveIdRef.js — Cached element resolution via #[x] syntax.
 *
 * Dynamically imported by assignFrom when `withIds` is provided or `#[x]` patterns are detected.
 * Provides lazy, WeakRef-cached element lookups keyed by variable name.
 *
 * First access: runs the query against the target, auto-assigns an ID if needed, caches via WeakRef.
 * Subsequent access: WeakRef.deref() (~10ns) or getElementById fallback (~20-100ns).
 */

/**
 * Module-level cache: rootNode → Map<varName, { id, WeakRef }>
 * WeakMap ensures cleanup when rootNode is GC'd.
 */
const idCacheMap = new WeakMap();

/**
 * Counter per rootNode for generating unique IDs.
 */
const idCounterMap = new WeakMap();

/**
 * Generate a unique ID within a rootNode.
 * Format: _ag0, _ag1, _ag2, ...
 */
function generateUniqueId(rootNode) {
    let counter = idCounterMap.get(rootNode) ?? 0;
    let id;
    // Ensure uniqueness (skip if ID already exists in the document)
    do {
        id = `_ag${counter}`;
        counter++;
    } while (rootNode.getElementById?.(id));
    idCounterMap.set(rootNode, counter);
    return id;
}

/**
 * Resolve a single #[varName] reference lazily.
 *
 * @param varName - The variable name (e.g., 'x' from '#[x]')
 * @param target - The target element to query against
 * @param withIds - The withIds configuration map
 * @returns The resolved element, or undefined if not found
 */
export function resolveIdVariable(varName, target, withIds) {
    const config = withIds[varName];
    if (config === undefined) return undefined;

    const rootNode = target.getRootNode?.() ?? target;

    // Get or create cache for this rootNode
    let cache = idCacheMap.get(rootNode);
    if (!cache) {
        cache = new Map();
        idCacheMap.set(rootNode, cache);
    }

    // Check cache first
    const cached = cache.get(varName);
    if (cached) {
        const el = cached.ref.deref();
        if (el) return el;

        // WeakRef was collected — try getElementById fallback
        const el2 = rootNode.getElementById?.(cached.id);
        if (el2) {
            cache.set(varName, { id: cached.id, ref: new WeakRef(el2) });
            return el2;
        }
        // Element no longer exists — fall through to re-query
    }

    // First time or cache miss — resolve the element
    let el = null;

    if (typeof config === 'string') {
        // String form: existing ID — use getElementById directly
        el = rootNode.getElementById?.(config) ?? null;
    } else {
        // Object form: { qry } — run querySelector against target
        el = target.querySelector?.(config.qry) ?? null;
    }

    if (!el) return undefined;

    // Ensure the element has an ID
    let id = el.id;
    if (!id) {
        id = generateUniqueId(rootNode);
        el.id = id;
    }

    // Cache it
    cache.set(varName, { id, ref: new WeakRef(el) });
    return el;
}

/**
 * Check if a key starts with #[...] syntax.
 */
export function hasIdRef(key) {
    return key.startsWith('#[');
}

/**
 * Extract the variable name and remaining path from a #[x]... key.
 * Returns { varName, remainingPath } or null if not valid.
 */
export function parseIdRef(key) {
    const closeIdx = key.indexOf(']');
    if (closeIdx === -1) return null;

    const varName = key.substring(2, closeIdx); // skip '#['
    if (!varName) return null;

    let remainingPath = key.substring(closeIdx + 1);

    // Remove handler suffix if present (caller handles it separately)
    if (remainingPath.endsWith(' =>')) {
        remainingPath = remainingPath.substring(0, remainingPath.length - 3);
    }

    return { varName, remainingPath };
}
