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
 * WeakMap storing per-instance feature caches.
 * Outer key: the instance (element or other object).
 * Inner map: feature key -> spawned instance.
 */
const featureStorage = new WeakMap();
/**
 * The features registry: maps a constructor to its accumulated feature injections.
 */
export class FeaturesRegistry {
    #registry = new Map();
    has(ctr) {
        return this.#registry.has(ctr);
    }
    get(ctr) {
        return this.#registry.get(ctr);
    }
    set(ctr, key, injection) {
        let features = this.#registry.get(ctr);
        if (!features) {
            features = new Map();
            this.#registry.set(ctr, features);
        }
        features.set(key, injection);
    }
    hasKey(ctr, key) {
        const features = this.#registry.get(ctr);
        return features ? features.has(key) : false;
    }
}
/**
 * Sentinel symbol to mark stored values as raw initVals (not yet spawned).
 */
const RAW_INIT_VALS = Symbol('rawInitVals');
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
function installFeatureGetter(ctr, key, featuresRegistry) {
    Object.defineProperty(ctr.prototype, key, {
        get: function () {
            // Get or create the per-instance storage
            let storage = featureStorage.get(this);
            if (!storage) {
                storage = new Map();
                featureStorage.set(this, storage);
            }
            const stored = storage.get(key);
            // If already spawned (not a raw sentinel), return it
            if (stored !== undefined && !(stored && typeof stored === 'object' && RAW_INIT_VALS in stored)) {
                return stored;
            }
            // Determine initVals: from setter-stored raw value, or from own-property shadow
            let initVals = undefined;
            if (stored && typeof stored === 'object' && RAW_INIT_VALS in stored) {
                initVals = stored[RAW_INIT_VALS];
                storage.delete(key);
            }
            else if (Object.hasOwn(this, key)) {
                initVals = this[key];
                delete this[key]; // Unshadow the prototype accessor
            }
            // Resolve the registry — use scoped registry if available, fall back to global
            const registry = (this.customElementRegistry || customElements);
            const fr = registry.featuresRegistry;
            if (!fr || !fr.has(ctr)) {
                throw new Error(`assignFeatures: featuresRegistry missing entry for constructor`);
            }
            const features = fr.get(ctr);
            const injection = features.get(key);
            if (!injection) {
                throw new Error(`assignFeatures: no injection found for feature "${key}"`);
            }
            // Resolve spawn: injection.spawn takes priority, then fallbackSpawn
            const supportedFeatures = ctr.supportedFeatures;
            const optIn = supportedFeatures?.[key];
            if (!optIn) {
                throw new Error(`assignFeatures: "${key}" not in static supportedFeatures`);
            }
            const SpawnClass = injection.spawn || optIn.fallbackSpawn;
            if (!SpawnClass) {
                throw new Error(`assignFeatures: no spawn implementation found for feature "${key}". ` +
                    `Provide spawn in assignFeatures() or fallbackSpawn in supportedFeatures.`);
            }
            // Build the spawn context
            const ctx = {
                key,
                optIn,
                injection,
                featuresRegistry: fr
            };
            // Spawn with host element, context, and any captured initVals
            const instance = new SpawnClass(this, ctx, initVals);
            // Validate shape if configured
            if (optIn.validateShape) {
                if (!optIn.validateShape(instance)) {
                    throw new Error(`assignFeatures: spawned instance for "${key}" failed shape validation`);
                }
            }
            storage.set(key, instance);
            return instance;
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
export function assignFeatures(ctr, features, featuresRegistry) {
    // Validate that the constructor has static supportedFeatures
    const supportedFeatures = ctr.supportedFeatures;
    if (!supportedFeatures) {
        throw new Error(`assignFeatures: ${ctr.name || 'constructor'} does not define static supportedFeatures`);
    }
    for (const key of Object.keys(features)) {
        // 1. Confirm the key is opted-in via supportedFeatures
        if (!(key in supportedFeatures)) {
            throw new Error(`assignFeatures: "${key}" is not declared in ${ctr.name || 'constructor'}.supportedFeatures`);
        }
        // 2. Check that the prototype doesn't already have this property defined
        const existingDescriptor = Object.getOwnPropertyDescriptor(ctr.prototype, key);
        if (existingDescriptor) {
            throw new Error(`assignFeatures: "${key}" already exists on ${ctr.name || 'constructor'}.prototype`);
        }
        // 3. Check that this key hasn't already been registered for this constructor
        if (featuresRegistry.hasKey(ctr, key)) {
            throw new Error(`assignFeatures: "${key}" has already been assigned for ${ctr.name || 'constructor'}`);
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
export function captureFeatureInitVals(instance) {
    const ctr = instance.constructor;
    const supportedFeatures = ctr.supportedFeatures;
    if (!supportedFeatures)
        return;
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
        value: function (ctr, features) {
            assignFeatures(ctr, features, this.featuresRegistry);
        },
        writable: true,
        enumerable: false,
        configurable: true,
    });
}
