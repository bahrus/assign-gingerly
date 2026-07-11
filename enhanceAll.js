/**
 * enhanceAll.js — Bulk enhancement application via EMC (Element Mount Configuration) JSON.
 *
 * Finds matching elements within a target and spawns enhancements on them
 * using the configuration from EMC JSON files that enhancement packages publish.
 *
 * @example
 * import { enhanceAll } from 'assign-gingerly/enhanceAll.js';
 *
 * await enhanceAll(shadowRoot, [
 *     { emc: 'be-bound/emc.json', matching: '[name]' },
 *     { emc: 'be-observant/emc.json', matching: '[itemprop]' },
 * ]);
 */

/**
 * Apply enhancements in bulk to matching elements within a target.
 */
export async function enhanceAll(target, configs) {
    for (const config of configs) {
        // 1. Import the EMC JSON
        const emcModule = await import(config.emc, { with: { type: 'json' } });
        const emc = emcModule.default ?? emcModule;
        const { enhConfig } = emc;

        if (!enhConfig) {
            throw new Error(`enhanceAll: EMC at "${config.emc}" does not contain an enhConfig field`);
        }

        // 2. Determine the selector
        const selector = config.matching ?? enhConfig.matching ?? '*';

        // 3. Find matching elements
        const elements = target.querySelectorAll(selector);
        if (elements.length === 0) continue;

        // 4. Resolve and register the enhancement
        const registryItem = await resolveAndRegister(enhConfig, target);
        if (!registryItem) continue;

        // 5. Spawn enhancement on each matched element
        for (const el of elements) {
            try {
                el.enh.get(registryItem);
            } catch {
                // If enh gateway isn't available, skip silently
            }
        }
    }
}

/**
 * Resolve the enhancement's registry item from EMC enhConfig.
 */
async function resolveAndRegister(enhConfig, target) {
    const { enhKey, spawn: spawnPath } = enhConfig;

    const registry = target.customElementRegistry?.enhancementRegistry
        ?? (typeof customElements !== 'undefined' ? customElements.enhancementRegistry : undefined);

    if (!registry) return null;

    // Check if already registered
    if (enhKey) {
        const existing = registry.findByEnhKey(enhKey);
        if (existing) return existing;
    }

    // Not registered — dynamically import the spawn module
    if (!spawnPath) return null;

    const spawnModule = await import(spawnPath);
    const SpawnClass = spawnModule.default ?? Object.values(spawnModule).find(
        v => typeof v === 'function' && v.prototype
    );

    if (!SpawnClass) return null;

    const registryItem = {
        spawn: SpawnClass,
        enhKey,
    };

    if (enhConfig.withAttrs) {
        registryItem.withAttrs = enhConfig.withAttrs;
    }

    registry.push(registryItem);
    return registryItem;
}
