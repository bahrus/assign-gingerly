/**
 * assignFeatures - Dependency injection for custom element features
 * 
 * Allows custom element authors to declare supported feature slots via
 * `static supportedFeatures`, then have implementations injected via
 * `customElementRegistry.assignFeatures(Ctor, features)`.
 * 
 * Features are lazily instantiated on first property access via getter-only
 * properties installed on the class prototype.
 */

export interface SupportedFeatureConfig {
    /**
     * Optional fallback class to spawn if no implementation is injected
     */
    fallbackSpawn?: { new(hostElement: any): any };

    /**
     * Optional runtime shape validation for the spawned instance.
     * Return true if the instance is valid, false to throw.
     */
    validateShape?: (spawnedInstance: any) => boolean;
}

export interface FeatureInjection {
    /**
     * The class to instantiate for this feature.
     * Constructor receives the host element as its first argument.
     */
    spawn?: { new(hostElement: any): any };
}

export type SupportedFeaturesMap = Record<string, SupportedFeatureConfig>;
export type FeatureInjectionsMap = Record<string, FeatureInjection>;

/**
 * WeakMap storing per-instance feature caches.
 * Outer key: the instance (element or other object).
 * Inner map: feature key -> spawned instance.
 */
const featureStorage = new WeakMap<object, Map<string, any>>();

/**
 * The features registry: maps a constructor to its accumulated feature injections.
 */
export class FeaturesRegistry {
    #registry = new Map<Function, Map<string, FeatureInjection>>();

    has(ctr: Function): boolean {
        return this.#registry.has(ctr);
    }

    get(ctr: Function): Map<string, FeatureInjection> | undefined {
        return this.#registry.get(ctr);
    }

    set(ctr: Function, key: string, injection: FeatureInjection): void {
        let features = this.#registry.get(ctr);
        if (!features) {
            features = new Map();
            this.#registry.set(ctr, features);
        }
        features.set(key, injection);
    }

    hasKey(ctr: Function, key: string): boolean {
        const features = this.#registry.get(ctr);
        return features ? features.has(key) : false;
    }
}

/**
 * Installs a lazy getter on the constructor's prototype for the given feature key.
 * The getter spawns the feature instance on first access and caches it.
 */
function installFeatureGetter(
    ctr: Function,
    key: string,
    featuresRegistry: FeaturesRegistry
): void {
    Object.defineProperty(ctr.prototype, key, {
        get: function (this: any) {
            // Get or create the per-instance storage
            let storage = featureStorage.get(this);
            if (!storage) {
                storage = new Map();
                featureStorage.set(this, storage);
            }

            if (!storage.has(key)) {
                // Resolve the registry — use scoped registry if available, fall back to global
                const registry = (this.customElementRegistry || customElements) as any;
                const fr: FeaturesRegistry = registry.featuresRegistry;

                if (!fr || !fr.has(ctr)) {
                    throw new Error(`assignFeatures: featuresRegistry missing entry for constructor`);
                }

                const features = fr.get(ctr)!;
                const injection = features.get(key);

                if (!injection) {
                    throw new Error(`assignFeatures: no injection found for feature "${key}"`);
                }

                // Resolve spawn: injection.spawn takes priority, then fallbackSpawn
                const supportedFeatures = (ctr as any).supportedFeatures;
                const optIn: SupportedFeatureConfig | undefined = supportedFeatures?.[key];

                if (!optIn) {
                    throw new Error(`assignFeatures: "${key}" not in static supportedFeatures`);
                }

                const SpawnClass = injection.spawn || optIn.fallbackSpawn;

                if (!SpawnClass) {
                    throw new Error(
                        `assignFeatures: no spawn implementation found for feature "${key}". ` +
                        `Provide spawn in assignFeatures() or fallbackSpawn in supportedFeatures.`
                    );
                }

                // Phase 1: pass only the host element
                const instance = new SpawnClass(this);

                // Validate shape if configured
                if (optIn.validateShape) {
                    if (!optIn.validateShape(instance)) {
                        throw new Error(
                            `assignFeatures: spawned instance for "${key}" failed shape validation`
                        );
                    }
                }

                storage.set(key, instance);
            }

            return storage.get(key);
        },
        enumerable: true,
        configurable: false
    });
}

/**
 * Core assignFeatures implementation.
 * Validates inputs, registers injections, and installs lazy getters.
 * 
 * @param ctr - The constructor (class) to assign features to
 * @param features - Map of feature keys to their injection configs
 * @param featuresRegistry - The registry to store injections in
 */
export function assignFeatures(
    ctr: Function,
    features: FeatureInjectionsMap,
    featuresRegistry: FeaturesRegistry
): void {
    // Validate that the constructor has static supportedFeatures
    const supportedFeatures: SupportedFeaturesMap | undefined = (ctr as any).supportedFeatures;

    if (!supportedFeatures) {
        throw new Error(
            `assignFeatures: ${ctr.name || 'constructor'} does not define static supportedFeatures`
        );
    }

    for (const key of Object.keys(features)) {
        // 1. Confirm the key is opted-in via supportedFeatures
        if (!(key in supportedFeatures)) {
            throw new Error(
                `assignFeatures: "${key}" is not declared in ${ctr.name || 'constructor'}.supportedFeatures`
            );
        }

        // 2. Check that the prototype doesn't already have this property defined
        const existingDescriptor = Object.getOwnPropertyDescriptor(ctr.prototype, key);
        if (existingDescriptor) {
            throw new Error(
                `assignFeatures: "${key}" already exists on ${ctr.name || 'constructor'}.prototype`
            );
        }

        // 3. Check that this key hasn't already been registered for this constructor
        if (featuresRegistry.hasKey(ctr, key)) {
            throw new Error(
                `assignFeatures: "${key}" has already been assigned for ${ctr.name || 'constructor'}`
            );
        }

        // 4. Register the injection
        featuresRegistry.set(ctr, key, features[key]);

        // 5. Install the lazy getter on the prototype
        installFeatureGetter(ctr, key, featuresRegistry);
    }
}
