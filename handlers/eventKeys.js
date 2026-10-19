/**
 * Default dedup keys for ` +=` event bindings, shared by handlers that re-apply the same
 * pattern on every run (builtIns.tree, builtIns.scope).
 */
import { isEventBinding } from '../resolve/getValues.js';
/** Keyed patterns per prefix and pattern (identity when a pattern has no event bindings). */
const keyedPatterns = new Map();
/**
 * Give each ` +=` event binding without a `get.key` a default one (`<prefix>:<key>`), so
 * re-applying the pattern on a rerun replaces the element's listener instead of adding
 * another (and the listener's host is always the current `from`).
 */
export function withEventKeys(pattern, prefix) {
    let cache = keyedPatterns.get(prefix);
    if (!cache)
        keyedPatterns.set(prefix, cache = new WeakMap());
    let keyed = cache.get(pattern);
    if (keyed)
        return keyed;
    keyed = pattern;
    for (const key of Object.keys(pattern)) {
        const value = pattern[key];
        if (isEventBinding(key, value) && value.get?.key === undefined) {
            if (keyed === pattern)
                keyed = { ...pattern };
            keyed[key] = { ...value, get: { ...value.get, key: `${prefix}:${key}` } };
        }
    }
    cache.set(pattern, keyed);
    return keyed;
}
