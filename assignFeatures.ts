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

/**
 * Context passed to feature spawn constructors
 */
export interface FeatureSpawnContext {
    /** The feature key (e.g., 'photoTaker') */
    key: string;
    /** The SupportedFeatureConfig from static supportedFeatures */
    optIn: SupportedFeatureConfig;
    /** The FeatureInjection config from assignFeatures */
    injection: FeatureInjection;
    /** The features registry reference */
    featuresRegistry: FeaturesRegistry;
}

export interface SupportedFeatureConfig {
    /**
     * Optional fallback class (or async spawner) to use if no implementation is injected.
     */
    fallbackSpawn?: 
        | { new(hostElement: any, ctx: FeatureSpawnContext, initVals?: any): any }
        | (() => Promise<{ new(hostElement: any, ctx: FeatureSpawnContext, initVals?: any): any }>);

    /**
     * Optional runtime shape validation for the spawned instance.
     * Return true if the instance is valid, false to throw.
     */
    validateShape?: (spawnedInstance: any) => boolean;
}

export interface FeatureInjection {
    /**
     * The class to instantiate for this feature, or an async function that
     * resolves to such a class (for lazy-loading).
     * 
     * Synchronous: Constructor receives the host element as its first argument,
     * a FeatureSpawnContext as second, and optional initVals as third.
     * 
     * Asynchronous: A function (arrow or async) that returns a Promise resolving
     * to a constructor. The getter returns a placeholder object immediately and
     * instantiates the real class once the Promise resolves.
     */
    spawn?: 
        | { new(hostElement: any, ctx: FeatureSpawnContext, initVals?: any): any }
        | (() => Promise<{ new(hostElement: any, ctx: FeatureSpawnContext, initVals?: any): any }>);
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
 * Sentinel symbol to mark stored values as raw initVals (not yet spawned).
 */
const RAW_INIT_VALS = Symbol('rawInitVals');

/**
 * Sentinel symbol to mark stored values as error state from failed async spawn.
 */
const FEATURE_ERROR = Symbol('featureError');

/**
 * Determines if a function is an async spawner (returns a Promise<Constructor>)
 * rather than a synchronous constructor.
 * 
 * Heuristic:
 * - AsyncFunction (async () => ...) → async spawner
 * - Arrow function (no .prototype) → async spawner (assumed to return Promise<Constructor>)
 * - Class or function declaration (has .prototype) → synchronous constructor
 */
function isAsyncSpawn(fn: any): boolean {
    if (typeof fn !== 'function') return false;
    // Explicit async function
    if (fn.constructor.name === 'AsyncFunction') return true;
    // Arrow function or non-constructor function (no .prototype)
    if (fn.prototype === undefined) return true;
    return false;
}

/**
 * Installs a getter/setter pair on the constructor's prototype for the given feature key.
 * 
 * - The setter stores raw values (pre-upgrade or early assignment) into the WeakMap
 *   tagged with a sentinel so the getter knows they are initVals, not spawned instances.
 * - The getter spawns the feature instance on first access, using any stored raw value
 *   as initVals, then caches the spawned instance.
 * 
 * If an own-property with the same key exists on the instance (e.g., set before
 * the element upgraded), it is captured as initVals and deleted so the prototype
 * getter/setter is no longer shadowed.
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

            const stored = storage.get(key);

            // Check for error state from failed async spawn
            if (stored && typeof stored === 'object' && FEATURE_ERROR in stored) {
                throw stored[FEATURE_ERROR];
            }

            // If already spawned (not a raw sentinel, not undefined), return it
            if (stored !== undefined && !(stored && typeof stored === 'object' && RAW_INIT_VALS in stored)) {
                return stored;
            }

            // Determine initVals: from setter-stored raw value, or from own-property shadow
            let initVals: any = undefined;
            if (stored && typeof stored === 'object' && RAW_INIT_VALS in stored) {
                initVals = stored[RAW_INIT_VALS];
                storage.delete(key);
            } else if (Object.hasOwn(this, key)) {
                initVals = this[key];
                delete this[key]; // Unshadow the prototype accessor
            }

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

            // Build the spawn context
            const ctx: FeatureSpawnContext = {
                key,
                optIn,
                injection,
                featuresRegistry: fr
            };

            if (isAsyncSpawn(SpawnClass)) {
                // Async path: SpawnClass is a function that returns Promise<Constructor>
                const placeholder = initVals && typeof initVals === 'object' ? initVals : {};
                storage.set(key, placeholder);

                // Capture host element reference for the async callback
                const hostElement = this;

                // Kick off async resolution
                (SpawnClass as () => Promise<any>)().then((ResolvedClass: any) => {
                    // Mutate injection so future getter calls see the resolved constructor
                    (injection as any).spawn = ResolvedClass;

                    // Get the current placeholder (may have accumulated properties via assignGingerly)
                    const currentStorage = featureStorage.get(hostElement);
                    const currentPlaceholder = currentStorage?.get(key);

                    // Don't upgrade if an error was stored or if already upgraded
                    if (!currentPlaceholder || (typeof currentPlaceholder === 'object' && FEATURE_ERROR in currentPlaceholder)) {
                        return;
                    }

                    // Instantiate the real class with the placeholder as initVals
                    const realCtx: FeatureSpawnContext = {
                        key,
                        optIn,
                        injection,
                        featuresRegistry: fr
                    };
                    const instance = new ResolvedClass(hostElement, realCtx, currentPlaceholder);

                    // Validate shape if configured
                    if (optIn.validateShape) {
                        if (!optIn.validateShape(instance)) {
                            const error: any = new Error(
                                `assignFeatures: spawned instance for "${key}" failed shape validation`
                            );
                            error.placeholder = currentPlaceholder;
                            currentStorage!.set(key, { [FEATURE_ERROR]: error });
                            return;
                        }
                    }

                    // Replace placeholder with real instance
                    currentStorage!.set(key, instance);
                }).catch((err: any) => {
                    // Store error state — getter will throw on next access
                    const currentStorage = featureStorage.get(hostElement);
                    const currentPlaceholder = currentStorage?.get(key);
                    const error: any = new Error(
                        `assignFeatures: async spawn for "${key}" failed: ${err.message}`
                    );
                    error.placeholder = currentPlaceholder;
                    error.cause = err;
                    currentStorage?.set(key, { [FEATURE_ERROR]: error });
                });

                return placeholder;
            } else {
                // Synchronous path: SpawnClass is a constructor
                const instance = new (SpawnClass as any)(this, ctx, initVals);

                // Validate shape if configured
                if (optIn.validateShape) {
                    if (!optIn.validateShape(instance)) {
                        throw new Error(
                            `assignFeatures: spawned instance for "${key}" failed shape validation`
                        );
                    }
                }

                storage.set(key, instance);
                return instance;
            }
        },
        enumerable: true,
        configurable: false
    });
}

/**
 * Core assignFeatures implementation.
 * Validates inputs, registers injections, and installs lazy getters.
 * 
 * Important: Call assignFeatures BEFORE customElements.define(), or at minimum
 * before any instances of the element are created. The lazy getters must be on
 * the prototype before instances exist to properly capture pre-set properties.
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

/**
 * Captures own-properties that shadow feature getters and stores them as initVals.
 * Call this in the custom element constructor to handle pre-upgrade property values.
 * 
 * When an element exists in the DOM before `define()` is called, properties may have
 * been set on it directly. After upgrade, these own-properties shadow the prototype
 * getters installed by `assignFeatures`. This helper captures those values and deletes
 * the own-properties so the getters can function properly.
 * 
 * @param instance - The custom element instance (typically `this` in the constructor)
 * 
 * @example
 * class ClubMember extends HTMLElement {
 *     static supportedFeatures = { photoTaker: { fallbackSpawn: PhotoTakerImpl } }
 *     constructor() {
 *         super();
 *         captureFeatureInitVals(this);
 *     }
 * }
 */
export function captureFeatureInitVals(instance: any): void {
    const ctr = instance.constructor;
    const supportedFeatures = ctr.supportedFeatures;
    if (!supportedFeatures) return;

    for (const key of Object.keys(supportedFeatures)) {
        if (Object.hasOwn(instance, key)) {
            const value = instance[key];
            delete instance[key];

            // Store in the WeakMap so the getter can pick it up
            let storage = featureStorage.get(instance);
            if (!storage) {
                storage = new Map();
                featureStorage.set(instance, storage);
            }
            storage.set(key, { [RAW_INIT_VALS]: value });
        }
    }
}

// =============================================================================
// Self-installing: adds featuresRegistry and assignFeatures to CustomElementRegistry
// This code runs as a side effect when this module is imported.
// =============================================================================

declare global {
    interface CustomElementRegistry {
        featuresRegistry: FeaturesRegistry;
        assignFeatures(ctr: Function, features: FeatureInjectionsMap): void;
    }
}

if (typeof CustomElementRegistry !== 'undefined') {
    Object.defineProperty(CustomElementRegistry.prototype, 'featuresRegistry', {
        get: function () {
            const registry = new FeaturesRegistry();
            Object.defineProperty(this, 'featuresRegistry', {
                value: registry,
                writable: true,
                enumerable: false,
                configurable: true,
            });
            return registry;
        },
        enumerable: false,
        configurable: true,
    });

    Object.defineProperty(CustomElementRegistry.prototype, 'assignFeatures', {
        value: function (ctr: Function, features: FeatureInjectionsMap): void {
            assignFeatures(ctr, features, this.featuresRegistry);
        },
        writable: true,
        enumerable: false,
        configurable: true,
    });
}
