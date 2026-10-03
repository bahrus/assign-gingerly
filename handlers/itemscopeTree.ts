/**
 * builtIns.itemscopeTree handler for assignFrom.
 *
 * Phase I — initial instantiation. For each top-level key of `options.from` whose
 * value is a non-array object, looks up an itemscope manager named
 * `<PascalCasedKey>ISM` (e.g. `image` → `ImageISM`) and, if the manager class has a
 * static `instantiate(value, ctx)`, appends the element it returns to the target.
 * The new element gets `itemscope=<managerName>` (plus `itemprop=<key>` when the
 * target itself has `itemscope`), and its `ish` manager is instantiated with the value.
 *
 * Fully synchronous inside `assign()` — `instantiate` is not awaited.
 *
 * Skipped silently: unregistered managers (no waiting), managers without a static
 * `instantiate`, non-object / array / null values, `instantiate` results that aren't
 * an HTMLElement, and keys whose manager already has a direct child of the target.
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
 */

import { assignGingerly } from '../assignGingerly.js';
import { defineIshCore } from '../handleIshProperty.js';
import type {
    AssignFromHandler,
    AssignFromOptions,
    ItemscopeRegistry,
} from '../types/assign-gingerly/types.js';

/**
 * Default convention for mapping a VM key to an itemscope manager name.
 * Single point where an explicit key → manager mapping can plug in later.
 */
export function toManagerName(key: string): string {
    return key[0].toUpperCase() + key.slice(1) + 'ISM';
}

/**
 * ItemscopeTreeHandler — instantiates itemscope-managed elements from a VM.
 */
export class ItemscopeTreeHandler implements AssignFromHandler {
    config: any;

    constructor(config: any) {
        this.config = config;
    }

    assign(lhsTarget: any, _resolvedParams: Record<string, any>, options: AssignFromOptions): void {
        const { from } = options;
        if (!(lhsTarget instanceof Element) || from === null || typeof from !== 'object') return;

        const registry: ItemscopeRegistry | undefined = (lhsTarget as any).customElementRegistry?.itemscopeRegistry
            ?? (typeof customElements !== 'undefined' ? customElements.itemscopeRegistry : undefined);
        if (!registry) return;

        const addItemprop = lhsTarget.hasAttribute('itemscope');

        // Itemscope values already present among direct children
        const existing = new Set<string>();
        for (const child of lhsTarget.children) {
            const itemscope = child.getAttribute('itemscope');
            if (itemscope) existing.add(itemscope);
        }

        for (const key of Object.keys(from)) {
            const value = from[key];
            if (value === null || typeof value !== 'object' || Array.isArray(value)) continue;
            const managerName = toManagerName(key);
            if (existing.has(managerName)) continue;
            const config = registry.get(managerName);
            if (!config) continue;
            const { manager } = config;
            if (typeof manager.instantiate !== 'function') continue;

            const result = manager.instantiate(value, { target: lhsTarget, key, from, options, registry });
            if (!(result instanceof HTMLElement)) continue;

            // Array-shaped so multiple nodes (tied together via itemref) can be supported later.
            // Only the first node carries itemscope / itemprop.
            const nodes = [result];
            const [first] = nodes;
            first.setAttribute('itemscope', managerName);
            if (addItemprop) first.setAttribute('itemprop', key);
            for (const node of nodes) lhsTarget.appendChild(node);
            existing.add(managerName);

            if (!('ish' in first)) {
                defineIshCore(first, config, options, assignGingerly);
            }
            (first as any).ish = value;
        }
    }
}
