/**
 * enhanceAll.ts — Bulk enhancement application via EMC (Element Mount Configuration) JSON.
 * 
 * Finds matching elements within a target and spawns enhancements on them
 * using the configuration from EMC JSON files that enhancement packages publish.
 * 
 * Dynamically imported by assignFrom when `enhance` option is present,
 * or used standalone.
 * 
 * @example
 * import { enhanceAll } from 'assign-gingerly/enhanceAll.js';
 * 
 * await enhanceAll(shadowRoot, [
 *     { emc: 'be-bound/emc.json', matching: '[name]' },
 *     { emc: 'be-observant/emc.json', matching: '[itemprop]' },
 * ]);
 */

import { isAllowedImportPath } from './assignPermissions/isAllowedImportPath.js';
import { findClassPrototypeInPath } from './utils/findClassPrototypeInPath.js';
import type { AssignPermissions } from './types/assign-gingerly/types.js';

/**
 * Configuration for a single enhancement to apply in bulk.
 */
export interface EnhanceConfig {
    /** Path to the EMC JSON file (dynamically imported) */
    emc: string;
    /** Override the CSS selector from the EMC (optional) */
    matching?: string;
    /** Whether to parse attributes via withAttrs (default: false). Phase II feature. */
    parse?: boolean;
}

/**
 * Apply enhancements in bulk to matching elements within a target.
 * 
 * For each entry:
 * 1. Dynamically imports the EMC JSON
 * 2. Extracts enhConfig (spawn path, enhKey, withAttrs)
 * 3. Finds matching elements via querySelectorAll
 * 4. Registers the enhancement if not already registered
 * 5. Spawns the enhancement on each matched element via enh.get()
 * 
 * Note: No scope perimeter is applied. For reactive observation of new elements,
 * use mount-observer instead.
 * 
 * @param target - The DOM element to search within
 * @param configs - Array of enhancement configurations
 */
export async function enhanceAll(
    target: Element,
    configs: EnhanceConfig[],
    permissions?: AssignPermissions
): Promise<void> {
    for (const config of configs) {
        // Validate EMC path unless cross-domain imports are explicitly permitted
        if (!permissions?.crossDomainImports && !isAllowedImportPath(config.emc)) {
            throw new Error(
                `enhanceAll: EMC path "${config.emc}" is a cross-domain URL. ` +
                `Only same-origin paths or import-map-covered specifiers are allowed by default. ` +
                `Pass { crossDomainImports: true } in permissions to override.`
            );
        }

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
                (el as any).enh.get(registryItem);
            } catch {
                // If enh gateway isn't available, skip silently
            }
        }
    }
}

/**
 * Resolve the enhancement's registry item from EMC enhConfig.
 * If not already registered, dynamically imports the spawn module and registers it.
 */
async function resolveAndRegister(enhConfig: any, target: Element): Promise<any> {
    const { enhKey, spawn: spawnPath } = enhConfig;

    // Get the enhancement registry for this element's scope
    const registry = (target as any).customElementRegistry?.enhancementRegistry
        ?? (typeof customElements !== 'undefined' ? (customElements as any).enhancementRegistry : undefined);

    if (!registry) return null;

    // Check if already registered
    if (enhKey) {
        const existing = registry.findByEnhKey(enhKey);
        if (existing) return existing;
    }

    // Not registered — dynamically import the spawn module and extract the spawn class
    if (!spawnPath) return null;

    let SpawnClass;
    try {
        SpawnClass = await findClassPrototypeInPath(spawnPath);
    } catch {
        return null;
    }

    // Build and register the registry item
    const registryItem: any = {
        spawn: SpawnClass,
        enhKey,
    };

    // Include withAttrs if present in enhConfig
    if (enhConfig.withAttrs) {
        registryItem.withAttrs = enhConfig.withAttrs;
    }

    registry.push(registryItem);
    return registryItem;
}
