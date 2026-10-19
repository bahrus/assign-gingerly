/**
 * inferredAssignments.ts — Handles inferred property assignment based on DOM structure.
 *
 * Dynamically imported by assignFrom when `inferredAssignments` option is present.
 * Uses the inferencer submodule to determine the correct property for each element.
 */
import { Infer } from './inferencer/inferencer.js';
import { withScopePerimeter } from './inferencer/withScopePerimeter.js';
/**
 * For `byItemprop: true`: the itemprop names in the target's own scope (not inside a nested
 * itemscope), in document order, that `from` provides. Element-driven rather than
 * `Object.keys(from)`, so getters on a class instance (an itemscope manager) count. Inherited
 * methods don't, and a plain object's inherited members (`toString`, …) don't either.
 */
function itempropsInScope(target, from) {
    const plain = Object.getPrototypeOf(from) === Object.prototype || Object.getPrototypeOf(from) === null;
    const names = new Set();
    for (const el of target.querySelectorAll('[itemprop]')) {
        if (!withScopePerimeter(target, el, '[itemscope]'))
            continue;
        if (el.getAttribute('itemscope') === '')
            continue; // a bare nested scope (see below)
        const name = el.getAttribute('itemprop');
        if (names.has(name))
            continue;
        const provided = Object.hasOwn(from, name) || (!plain && name in from && typeof from[name] !== 'function');
        if (provided)
            names.add(name);
    }
    return [...names];
}
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
            ? itempropsInScope(target, from)
            : effectiveByItemprop;
        const infer = new Infer(target);
        for (const key of keys) {
            if (!(key in from))
                continue;
            const value = from[key];
            // Use inferencer's ['|'] method — scoped by itemscope boundary
            const matches = infer['|'](key);
            for (const match of matches) {
                // A bare itemscope is a nested scope with no manager: setting its text would wipe its
                // markup. It's bound by stepping into it (builtIns.scope), not from here.
                if (match.enhancedElement.getAttribute('itemscope') === '')
                    continue;
                // Infer sets the right property (textContent, value, checked, dateTime, ish).
                // A fresh Infer without a property name: the matches carry the itemprop as
                // their propName, which Infer's value setter would take as the element property.
                new Infer(match.enhancedElement).value = value;
            }
        }
    }
    if (effectiveByName) {
        // Normalize config
        let keys;
        let scopeBoundary;
        if (effectiveByName === true) {
            keys = Object.keys(from);
        }
        else if (Array.isArray(effectiveByName)) {
            keys = effectiveByName;
        }
        else {
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
                new Infer(match.enhancedElement).value = value;
            }
        }
    }
}
