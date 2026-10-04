/**
 * builtIns.itemscopeTree handler for assignFrom.
 *
 * Instantiates itemscope-managed elements from a VM and appends them to the target.
 * Each entry pairs a VM key with an itemscope manager whose class has a static
 * `instantiate(value, ctx)`; the element it returns gets `itemscope=<managerName>`,
 * is appended, and has its `ish` manager instantiated with the value. Values of any
 * type (including undefined) are passed through as-is.
 *
 * Two modes:
 *
 * - **Without `map`:** iterates the top-level keys of `options.from` and looks up a
 *   manager named `<PascalCasedKey>ISM` (e.g. `image` → `ImageISM`). `itemprop=<key>`
 *   is added only when the target itself has `itemscope`. A key is skipped when a
 *   direct child already has that `itemscope`.
 * - **With `map`:** only the map's keys are processed, in map order (whether or not
 *   the VM has them). A class entry is auto-defined in the registry under
 *   `Class.itemscope ?? Class.name`; a string entry names an already-registered
 *   manager. `itemprop=<key>` is always added, and a key is skipped when a direct
 *   child already has that `itemprop` (so one class can serve several keys).
 *
 * Fully synchronous inside `assign()` — `instantiate` is not awaited.
 *
 * Skipped silently: unregistered managers (no waiting), managers without a static
 * `instantiate`, and `instantiate` results that aren't an HTMLElement.
 * Throws: a map class with no usable name, or whose name is registered to a
 * different class; a map entry that is neither a class nor a string.
 *
 * This handler is auto-loaded by processHandlerCommands when
 * `do: 'builtIns.itemscopeTree'` is encountered.
 *
 * @example
 * customElements.itemscopeRegistry.define('ImageISM', { manager: ImageHandler });
 *
 * await assignFromAsync(detailsElement, {
 *     '?. =>': { do: 'builtIns.itemscopeTree' }
 * }, { from: { image: { url: '...', description: 'Lunar Surface' } } });
 *
 * @example
 * await assignFromAsync(detailsElement, {
 *     '?. =>': {
 *         do: 'builtIns.itemscopeTree',
 *         map: { image: ImageHandler, mission: 'MissionManager' }
 *     }
 * }, { from: vm });
 */
import { assignGingerly } from '../assignGingerly.js';
import { defineIshCore } from '../handleIshProperty.js';
/**
 * Default convention for mapping a VM key to an itemscope manager name
 * (used when no `map` is provided).
 */
export function toManagerName(key) {
    return key[0].toUpperCase() + key.slice(1) + 'ISM';
}
/**
 * Resolve a `map` entry to its itemscope name and registered config.
 * Class entries are auto-defined; returns undefined config for an unregistered string.
 */
function resolveMapEntry(key, entry, registry) {
    if (typeof entry === 'string') {
        return [entry, registry.get(entry)];
    }
    if (typeof entry !== 'function') {
        throw new Error(`builtIns.itemscopeTree: map entry "${key}" must be a class or a registered itemscope name`);
    }
    const name = entry.itemscope ?? entry.name;
    if (!name) {
        throw new Error(`builtIns.itemscopeTree: map entry "${key}" has no class name; declare a static itemscope = '...'`);
    }
    const existing = registry.get(name);
    if (existing) {
        if (existing.manager !== entry) {
            throw new Error(`builtIns.itemscopeTree: itemscope name "${name}" (map entry "${key}") is already registered to a different class`);
        }
        return [name, existing];
    }
    const config = { manager: entry };
    registry.define(name, config);
    return [name, config];
}
/**
 * ItemscopeTreeHandler — instantiates itemscope-managed elements from a VM.
 */
export class ItemscopeTreeHandler {
    config;
    constructor(config) {
        this.config = config;
    }
    assign(lhsTarget, _resolvedParams, options) {
        if (!(lhsTarget instanceof Element))
            return;
        const { from } = options;
        const { map } = this.config;
        // Without a map, keys come from the VM, so it must be an object
        if (!map && (from === null || typeof from !== 'object'))
            return;
        const registry = lhsTarget.customElementRegistry?.itemscopeRegistry
            ?? (typeof customElements !== 'undefined' ? customElements.itemscopeRegistry : undefined);
        if (!registry)
            return;
        // With a map, elements are identified by itemprop (one class may serve several keys);
        // without, by itemscope (key ↔ <Key>ISM is 1:1).
        const identifyBy = map ? 'itemprop' : 'itemscope';
        const addItemprop = !!map || lhsTarget.hasAttribute('itemscope');
        // Identifiers already present among direct children
        const existing = new Set();
        for (const child of lhsTarget.children) {
            const id = child.getAttribute(identifyBy);
            if (id)
                existing.add(id);
        }
        for (const key of Object.keys(map ?? from)) {
            let managerName;
            let config;
            if (map) {
                if (existing.has(key))
                    continue;
                [managerName, config] = resolveMapEntry(key, map[key], registry);
            }
            else {
                managerName = toManagerName(key);
                if (existing.has(managerName))
                    continue;
                config = registry.get(managerName);
            }
            if (!config)
                continue;
            const { manager } = config;
            if (typeof manager.instantiate !== 'function')
                continue;
            const value = from?.[key];
            const result = manager.instantiate(value, { target: lhsTarget, key, from, options, registry });
            if (!(result instanceof HTMLElement))
                continue;
            // Array-shaped so multiple nodes (tied together via itemref) can be supported later.
            // Only the first node carries itemscope / itemprop.
            const nodes = [result];
            const [first] = nodes;
            first.setAttribute('itemscope', managerName);
            if (addItemprop)
                first.setAttribute('itemprop', key);
            for (const node of nodes)
                lhsTarget.appendChild(node);
            existing.add(map ? key : managerName);
            if (!('ish' in first)) {
                defineIshCore(first, config, options, assignGingerly);
            }
            first.ish = value;
        }
    }
}
