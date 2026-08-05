/**
 * defineWithFeatures - Declaratively define a custom element with features from JSON config.
 * 
 * A thin wrapper around assignFeatures: waits for the base class, creates a subclass,
 * optionally calls onSubclassCreated, awaits assignFeatures(NewClass, config.assignFeatures),
 * then defines the custom element in the registry.
 * 
 * Designed to support cede scripts and other declarative custom element definition patterns.
 * 
 * @example
 * await defineWithFeatures('time-ticker', 'el-maker', {
 *     assignFeatures: {
 *         timeTicker: {},
 *         roundabout: {
 *             customData: {...},
 *             withAttrs: {...},
 *             callbackForwarding: ['connectedCallback']
 *         }
 *     }
 * });
 */

import { assignFeatures, FeatureConfigsMap } from './assignFeatures.js';

/**
 * Configuration passed to defineWithFeatures (JSON-serializable).
 */
export interface DefineWithFeaturesConfig {
    assignFeatures: FeatureConfigsMap;
}

/**
 * Options for defineWithFeatures.
 */
export interface DefineWithFeaturesOptions {
    /** Called after the subclass is created but before registry.define(). */
    onSubclassCreated?: (NewCtr: Function) => void;
}

/**
 * Declaratively define a custom element with features.
 * 
 * 1. Waits for the base class to be defined (if not already).
 * 2. Creates a subclass extending the base class.
 * 3. Calls the optional onSubclassCreated callback.
 * 4. Calls assignFeatures with the JSON config and the registry's featuresRegistry.
 * 5. Defines the new custom element in the registry.
 * 
 * @param tagName - The custom element tag name to define (e.g., 'time-ticker')
 * @param baseTagName - The tag name of the base class to extend (e.g., 'el-maker')
 * @param config - JSON-serializable configuration specifying which features to activate
 * @param registry - Optional custom element registry (defaults to global `customElements`)
 * @returns The newly created and defined custom element class
 */
export async function defineWithFeatures(
    tagName: string,
    baseTagName: string,
    config: DefineWithFeaturesConfig,
    registry?: CustomElementRegistry,
    options?: DefineWithFeaturesOptions
): Promise<Function> {
    const reg = registry || customElements;

    // 1. Resolve base class — wait for it if not yet defined
    let BaseClass = (reg as any).get(baseTagName);
    if (!BaseClass) {
        await (reg as any).whenDefined(baseTagName);
        BaseClass = (reg as any).get(baseTagName);
    }
    if (!BaseClass) {
        throw new Error(`defineWithFeatures: base class "${baseTagName}" could not be resolved`);
    }

    // 2. Create subclass
    const NewClass = class extends (BaseClass as any) { };

    // 3. Optional subclass callback
    if (options?.onSubclassCreated) {
        options.onSubclassCreated(NewClass);
    }

    // 4. Assign features (assignFeatures resolves all spawns and installs getters)
    const { assignFeatures: af } = config;
    if (af) {
        await assignFeatures(NewClass, af, (reg as any).featuresRegistry);
    }

    // 5. Define the custom element
    (reg as any).define(tagName, NewClass);

    return NewClass;
}
