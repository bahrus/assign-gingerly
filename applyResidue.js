/**
 * applyResidue: finish server-rendered markup (e.g. from o2h) on the client.
 *
 * A server renders what HTML can carry, and marks each element that still needs something
 * (properties without an attribute, event bindings, an itemscope manager's value) with
 * `data-residue="<name>"`. The residue maps each name to the pattern for that element:
 *
 *     <button data-residue="e2">Save</button>
 *     residue = { e2: { ' +=': { on: 'click', call: 'save' } } }
 *
 * applyResidue applies each element's pattern with assignFrom, waits until that element is
 * really ready (its manager attached, its event listeners attached, its handlers settled), and
 * only then removes `data-residue`. So CSS can hide pending parts until they're complete:
 *
 *     @media (scripting: enabled) { [data-residue] { visibility: hidden; } }
 *
 * The host of event bindings (`call`) follows builtIns.tree: inside an element with a manager
 * (itemscope="<name>"), it's that manager; elsewhere it's `options.from`.
 */
import { assignFrom, whenSettled } from './assignFrom.js';
import { whenEventsBound } from './assignGingerly.js';
import { resolveRegistry } from './utils/resolveRegistry.js';
/** The attribute marking an element that still needs its residue (shared with o2h). */
export const RESIDUE_ATTRIBUTE = 'data-residue';
/**
 * Apply a residue to the marked elements in `container` (and the container itself, if marked).
 * Each element's mark is removed as soon as that element is ready; the promise resolves when
 * all are. Marked elements without an entry are unmarked right away.
 */
export async function applyResidue(container, residue, options = {}, permissionProcessor) {
    const marked = [...container.querySelectorAll(`[${RESIDUE_ATTRIBUTE}]`)];
    if (container instanceof Element && container.hasAttribute(RESIDUE_ATTRIBUTE))
        marked.unshift(container);
    if (marked.length === 0)
        return;
    const entryOf = (element) => residue?.[element.getAttribute(RESIDUE_ATTRIBUTE)];
    const unmark = (element) => element.removeAttribute(RESIDUE_ATTRIBUTE);
    // 1. Managers first: an element's own pattern, and its descendants', use the manager as host
    const managersReady = new Map();
    for (const element of marked) {
        const entry = entryOf(element);
        if (entry && 'ish' in entry) {
            managersReady.set(element, attachManager(element, entry.ish, options, permissionProcessor));
        }
    }
    // 2. Each element's pattern (minus ish), against its host; unmark it once it's ready
    await Promise.all(marked.map(async (element) => {
        const entry = entryOf(element);
        if (!entry) {
            unmark(element);
            return;
        }
        const { ish: _ish, ...rest } = entry;
        const managed = closestManaged(element, managersReady);
        if (managed)
            await managersReady.get(managed);
        if (Object.keys(rest).length > 0) {
            const from = managed ? managed.ish : options.from;
            assignFrom(element, rest, { ...options, from }, permissionProcessor);
            // Ready: handlers settled and event listeners attached
            await Promise.all([whenSettled(element), whenEventsBound(element)]);
        }
        unmark(element);
    }));
}
/** Assign the manager's value (`el.ish`), and resolve once the manager is attached and set up. */
async function attachManager(element, value, options, permissionProcessor) {
    assignFrom(element, { ish: value }, { ...options, from: options.from ?? {} }, permissionProcessor);
    const name = element.getAttribute('itemscope');
    if (!name)
        return;
    const registry = resolveRegistry('itemscopeRegistry', options, element);
    // Waits for the name to be defined and for the ish setup just started
    if (registry)
        await registry.whenDefined(name);
}
/** The closest element (itself included) whose manager this residue attaches. */
function closestManaged(element, managersReady) {
    for (let current = element; current; current = current.parentElement) {
        if (managersReady.has(current))
            return current;
    }
    return undefined;
}
