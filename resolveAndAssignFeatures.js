/**
 * resolveAndAssignFeatures - Resolves async fallback spawns then calls assignFeatures.
 *
 * For each feature in the config that doesn't have an explicit `spawn`, resolves
 * the async `fallbackSpawn` from the class's `static supportedFeatures` and sets
 * it as the spawn. Then calls `assignFeatures` with the fully resolved config.
 *
 * This eliminates the boilerplate of manually resolving async spawns before
 * calling assignFeatures.
 *
 * @example
 * import { resolveAndAssignFeatures } from 'assign-gingerly/resolveAndAssignFeatures.js';
 *
 * await resolveAndAssignFeatures(MyElement, {
 *     roundabout: {
 *         customData: {...},
 *         withAttrs: {...},
 *         callbackForwarding: ['connectedCallback']
 *     },
 *     faceUp: {
 *         callbackForwarding: ['connectedCallback', 'disconnectedCallback']
 *     }
 * });
 */
import { isAsyncSpawn } from './utils/isAsyncSpawn.js';
/**
 * Resolves async fallback spawns for features that don't have an explicit spawn,
 * then calls assignFeatures on the registry.
 *
 * @param ElementClass - The custom element class (must have static supportedFeatures)
 * @param featuresConfig - Feature configurations (spawn will be resolved from fallbackSpawn if missing)
 * @param registry - Optional CustomElementRegistry (defaults to global customElements)
 */
export async function resolveAndAssignFeatures(ElementClass, featuresConfig, registry) {
    const supportedFeatures = ElementClass.supportedFeatures;
    if (!supportedFeatures) {
        throw new Error(`resolveAndAssignFeatures: ${ElementClass.name || 'constructor'} does not define static supportedFeatures`);
    }
    // Resolve async fallback spawns in parallel for features without explicit spawn
    await Promise.all(Object.entries(featuresConfig).map(async ([key, featureConfig]) => {
        // Skip if spawn is already provided
        if (featureConfig.spawn)
            return;
        const optIn = supportedFeatures[key];
        if (!optIn?.fallbackSpawn)
            return;
        let spawn = optIn.fallbackSpawn;
        if (isAsyncSpawn(spawn)) {
            spawn = await spawn();
        }
        featureConfig.spawn = spawn;
    }));
    // Call assignFeatures on the registry
    const reg = registry || customElements;
    await reg.assignFeatures(ElementClass, featuresConfig);
}
