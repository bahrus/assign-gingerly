/**
 * inferredAssignments.ts — Handles inferred property assignment based on DOM structure.
 *
 * Dynamically imported by assignFrom when `inferredAssignments` option is present.
 * Uses the inferencer submodule to determine the correct property for each element.
 */
import { Infer } from './inferencer/inferencer.js';
/**
 * Process inferred assignments for a target element.
 *
 * @param target - The DOM element to search within
 * @param from - The source object containing values to distribute
 * @param config - The inferredAssignments configuration
 */
export function processInferredAssignments(target, from, config) {
    if (!(target instanceof Element))
        return;
    if (!from || typeof from !== 'object')
        return;
    const { byItemprop, byName } = config;
    // Resolve aliases: '|' → byItemprop, '@' → byName
    const effectiveByItemprop = byItemprop ?? config['|'];
    const effectiveByName = byName ?? config['@'];
    if (effectiveByItemprop) {
        const keys = effectiveByItemprop === true
            ? Object.keys(from)
            : effectiveByItemprop;
        const infer = new Infer(target);
        for (const key of keys) {
            if (!(key in from))
                continue;
            const value = from[key];
            // Use inferencer's ['|'] method — scoped by itemscope boundary
            const matches = infer['|'](key);
            for (const match of matches) {
                // Infer sets the right property (textContent, value, checked, dateTime, ish)
                match.value = value;
            }
        }
    }
    if (effectiveByName) {
        // Normalize config
        let keys;
        let scopeBoundary;
        if (effectiveByName === true) {
            keys = Object.keys(from);
        } else if (Array.isArray(effectiveByName)) {
            keys = effectiveByName;
        } else {
            // Object form: { props, outside }
            keys = effectiveByName.props === true ? Object.keys(from) : effectiveByName.props;
            scopeBoundary = effectiveByName.outside;
        }
        const infer = new Infer(target);
        for (const key of keys) {
            if (!(key in from))
                continue;
            const value = from[key];
            // Use inferencer's ['@'] method — by name attribute, optional scope boundary
            const matches = infer['@'](key, scopeBoundary);
            for (const match of matches) {
                match.value = value;
            }
        }
    }
}
