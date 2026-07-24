/**
 * resolveIdRef.ts — Cached element resolution via #[x] syntax.
 *
 * Dynamically imported by assignFrom when `pin` is provided or `#[x]` patterns are detected.
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
 * Format: -ag:0, -ag:1, -ag:2, ...
 * Starts with '-' and contains ':' to avoid collision with JS identifiers/globalThis properties.
 */
function generateUniqueId(rootNode) {
    let counter = idCounterMap.get(rootNode) ?? 0;
    let id;
    // Ensure uniqueness (skip if ID already exists in the document)
    do {
        id = `-ag:${counter}`;
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
 * @param pin - The pin configuration map
 * @returns The resolved element, or undefined if not found
 */
export function resolveIdVariable(varName, target, pin) {
    const config = pin[varName];
    if (config === undefined)
        return undefined;
    // For 'at' option path-based configs (array or { path }), resolve directly from target — no ID, no caching
    // These are target-relative and fast (~2-4ns), for when structure is guaranteed stable
    if (Array.isArray(config)) {
        let current = target;
        for (const idx of config) {
            if (!current || !current.children)
                break;
            current = current.children[idx];
        }
        return current instanceof Element ? current : undefined;
    }
    if (typeof config === 'object' && 'path' in config && !('qry' in config)) {
        // Determine if this is from 'at' (no ID assignment) or 'pin' with path (assigns ID + caches)
        // When called from 'at', we skip ID/caching. When from 'pin', we assign ID and cache.
        // Distinguish by presence in the options — caller passes the merged map.
        // For now: { path } without 'noId' → assign ID + cache (pin behavior)
        const rootNode = target.getRootNode?.() ?? target;
        let current = target;
        for (const idx of config.path) {
            if (!current || !current.children)
                break;
            current = current.children[idx];
        }
        let el = current instanceof Element ? current : null;
        // Validation: check if resolved element matches expected selector
        if (config.expect) {
            const didNotMatch = !el || !el.matches(config.expect);
            if (didNotMatch) {
                if (config.fallback) {
                    el = target.querySelector?.(config.expect) ?? el;
                }
                // Fire-and-forget: log correction suggestion
                const capturedConfig = config;
                const capturedVarName = varName;
                import('./pinCorrector.js').then(module => {
                    module.logConfigCorrection(target, capturedVarName, capturedConfig);
                }).catch(() => { });
            }
        }
        if (!el)
            return undefined;
        // Assign ID for stability against future DOM mutations
        let id = el.id;
        if (!id) {
            id = generateUniqueId(rootNode);
            el.id = id;
        }
        return el;
    }
    const rootNode = target.getRootNode?.() ?? target;
    // Get or create cache for this rootNode
    let cache = idCacheMap.get(rootNode);
    if (!cache) {
        cache = new Map();
        idCacheMap.set(rootNode, cache);
    }
    // First time or cache miss — resolve the element
    let el = null;
    if (typeof config === 'string') {
        // String form: existing ID — use getElementById directly
        // Check cache first (getElementById lookups are cacheable — global to rootNode)
        const cached = cache.get(varName);
        if (cached) {
            const cachedEl = cached.ref.deref();
            if (cachedEl)
                return cachedEl;
            // WeakRef was collected — try getElementById fallback
            const el2 = rootNode.getElementById?.(cached.id);
            if (el2) {
                cache.set(varName, { id: cached.id, ref: new WeakRef(el2) });
                return el2;
            }
        }
        el = rootNode.getElementById?.(config) ?? null;
    }
    else {
        // Object form: { qry } — run querySelector against target (target-relative, no cache)
        el = target.querySelector?.(config.qry) ?? null;
    }
    if (!el)
        return undefined;
    // Ensure the element has an ID
    let id = el.id;
    if (!id) {
        id = generateUniqueId(rootNode);
        el.id = id;
    }
    // Cache only for string-form (getElementById) — not for qry form (target-relative)
    if (typeof config === 'string') {
        cache.set(varName, { id, ref: new WeakRef(el) });
    }
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
 * Returns [varName, remainingPath] or null if not a valid #[x] reference.
 *
 * Examples:
 *   '#[x]' → ['x', '']
 *   '#[x] =>' → ['x', '']  (handler suffix handled separately)
 *   '#[x]?.querySelector?..child' → ['x', '?.querySelector?..child']
 *   '#[x]?.textContent =>' → ['x', '?.textContent']  (handler suffix handled separately)
 */
export function parseIdRef(key) {
    const closeIdx = key.indexOf(']');
    if (closeIdx === -1)
        return null;
    const varName = key.substring(2, closeIdx); // skip '#['
    if (!varName)
        return null;
    let remainingPath = key.substring(closeIdx + 1);
    // Remove handler suffix if present (caller handles it separately)
    if (remainingPath.endsWith(' =>')) {
        remainingPath = remainingPath.substring(0, remainingPath.length - 3);
    }
    return { varName, remainingPath };
}
/**
 * Register an element in the WeakRef cache for fast subsequent access.
 * Auto-assigns an ID if the element doesn't have one.
 *
 * Used by beVigilant to cache newly discovered elements so that future
 * assignFrom calls can resolve them via getElementById/WeakRef.
 *
 * @param target - The target element (used to determine rootNode)
 * @param varName - The cache key (typically the itemprop name)
 * @param element - The element to cache
 */
export function registerInCache(target, varName, element) {
    const rootNode = target.getRootNode?.() ?? target;
    let cache = idCacheMap.get(rootNode);
    if (!cache) {
        cache = new Map();
        idCacheMap.set(rootNode, cache);
    }
    // Ensure the element has an ID
    let id = element.id;
    if (!id) {
        id = generateUniqueId(rootNode);
        element.id = id;
    }
    cache.set(varName, { id, ref: new WeakRef(element) });
}
