/**
 * resolveAndAssignFeatures - Thin wrapper around assignFeatures for backward compatibility.
 *
 * Resolves all configured spawns (including async fallback spawns and string import paths)
 * and installs feature getters on the class prototype, then delegates to the registry's
 * assignFeatures implementation.
 *
 * This is kept as a convenience entry point for callers that already await this function.
 * The actual resolution logic lives in assignFeatures.
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
import { assignFeatures } from './assignFeatures.js';
/**
 * Resolves all configured spawns and calls assignFeatures on the registry.
 *
 * @param ElementClass - The custom element class (must have static supportedFeatures)
 * @param featuresConfig - Feature configurations (spawn will be resolved from fallbackSpawn if missing)
 * @param registry - Optional CustomElementRegistry (defaults to global customElements)
 */
export async function resolveAndAssignFeatures(ElementClass, featuresConfig, registry) {
    const reg = registry || customElements;
    await assignFeatures(ElementClass, featuresConfig, reg.featuresRegistry);
}
