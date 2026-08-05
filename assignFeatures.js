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
import { parseWithAttrs } from './parseWithAttrs.js';
import { isAsyncSpawn } from './utils/isAsyncSpawn.js';
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
 * Sentinel symbol to mark stored values as error state from failed async spawn.
 */
const FEATURE_ERROR = Symbol('featureError');
/**
 * WeakMap storing pending Promises for async feature resolution.
 * Outer key: the instance. Inner map: feature key -> { promise, resolve, reject }.
 */
const pendingFeatures = new WeakMap();
/**
 * Resolves the whenFeatureReady method name from lifecycleKeys config.
 * Returns undefined if lifecycleKeys is not set.
 */
function resolveWhenFeatureReadyName(lifecycleKeys) {
    if (lifecycleKeys === undefined)
        return undefined;
    if (lifecycleKeys === true)
        return 'whenFeatureReady';
    return lifecycleKeys.whenFeatureReady || 'whenFeatureReady';
}
/**
 * Installs the whenFeatureReady method on the constructor prototype if not already present.
 */
function installWhenFeatureReadyMethod(ctr, methodName) {
    // Only install once per class
    if (Object.getOwnPropertyDescriptor(ctr.prototype, methodName))
        return;
    Object.defineProperty(ctr.prototype, methodName, {
        value: function (featureKey) {
            // Trigger the getter (starts async resolution if needed, or returns sync instance)
            const current = this[featureKey];
            // Check if there's a pending async resolution for this instance + key
            const pending = pendingFeatures.get(this)?.get(featureKey);
            if (pending) {
                return pending.promise;
            }
            // No pending — feature is already resolved (sync or async already completed)
            return Promise.resolve(current);
        },
        writable: true,
        enumerable: false,
        configurable: true
    });
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
            // Check for error state from failed async spawn
            if (stored && typeof stored === 'object' && FEATURE_ERROR in stored) {
                throw stored[FEATURE_ERROR];
            }
            // If already spawned (not a raw sentinel, not undefined), return it
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
            const shared = optIn.getSharedContext?.(this);
            const ctx = {
                key,
                optIn,
                injection,
                featuresRegistry: fr,
                shared
            };
            // Parse attributes if withAttrs is configured
            let attrInitVals = undefined;
            if (injection.withAttrs && this instanceof Element) {
                try {
                    attrInitVals = parseWithAttrs(this, injection.withAttrs, true // always unprefixed for features
                    );
                }
                catch (e) {
                    console.error('Error parsing feature attributes:', e);
                    throw e;
                }
            }
            // Merge: attributes are base layer, programmatic initVals override
            if (attrInitVals) {
                initVals = initVals
                    ? { ...attrInitVals, ...initVals }
                    : attrInitVals;
            }
            if (isAsyncSpawn(SpawnClass)) {
                // Async path: SpawnClass is a function that returns Promise<Constructor>
                const placeholder = initVals && typeof initVals === 'object' ? initVals : {};
                storage.set(key, placeholder);
                // Capture host element reference for the async callback
                const hostElement = this;
                // Create a pending Promise for whenFeatureReady consumers
                let pendingMap = pendingFeatures.get(hostElement);
                if (!pendingMap) {
                    pendingMap = new Map();
                    pendingFeatures.set(hostElement, pendingMap);
                }
                let resolvePending;
                let rejectPending;
                const promise = new Promise((resolve, reject) => {
                    resolvePending = resolve;
                    rejectPending = reject;
                });
                pendingMap.set(key, { promise, resolve: resolvePending, reject: rejectPending });
                // Kick off async resolution
                SpawnClass().then((ResolvedClass) => {
                    // Mutate injection so future getter calls see the resolved constructor
                    injection.spawn = ResolvedClass;
                    // Get the current placeholder (may have accumulated properties via assignGingerly)
                    const currentStorage = featureStorage.get(hostElement);
                    const currentPlaceholder = currentStorage?.get(key);
                    // Don't upgrade if an error was stored or if already upgraded
                    if (!currentPlaceholder || (typeof currentPlaceholder === 'object' && FEATURE_ERROR in currentPlaceholder)) {
                        return;
                    }
                    // Parse attributes at resolution time (element should be in DOM by now)
                    let asyncAttrInitVals = undefined;
                    if (injection.withAttrs && hostElement instanceof Element) {
                        try {
                            asyncAttrInitVals = parseWithAttrs(hostElement, injection.withAttrs, true // always unprefixed for features
                            );
                        }
                        catch (e) {
                            // Non-fatal: log and continue with placeholder as initVals
                            console.error('Error parsing feature attributes during async resolution:', e);
                        }
                    }
                    // Merge: attributes are base, placeholder (programmatic) overrides
                    const asyncInitVals = asyncAttrInitVals
                        ? { ...asyncAttrInitVals, ...currentPlaceholder }
                        : currentPlaceholder;
                    // Instantiate the real class with merged initVals
                    const realCtx = {
                        key,
                        optIn,
                        injection,
                        featuresRegistry: fr,
                        shared: optIn.getSharedContext?.(hostElement)
                    };
                    const instance = new ResolvedClass(hostElement, realCtx, asyncInitVals);
                    // Validate shape if configured
                    if (optIn.validateShape) {
                        if (!optIn.validateShape(instance)) {
                            const error = new Error(`assignFeatures: spawned instance for "${key}" failed shape validation`);
                            error.placeholder = currentPlaceholder;
                            currentStorage.set(key, { [FEATURE_ERROR]: error });
                            rejectPending(error);
                            pendingMap.delete(key);
                            return;
                        }
                    }
                    // Replace placeholder with real instance
                    currentStorage.set(key, instance);
                    // Resolve the pending Promise and clean up
                    resolvePending(instance);
                    pendingMap.delete(key);
                }).catch((err) => {
                    // Store error state — getter will throw on next access
                    const currentStorage = featureStorage.get(hostElement);
                    const currentPlaceholder = currentStorage?.get(key);
                    const error = new Error(`assignFeatures: async spawn for "${key}" failed: ${err.message}`);
                    error.placeholder = currentPlaceholder;
                    error.cause = err;
                    currentStorage?.set(key, { [FEATURE_ERROR]: error });
                    // Reject the pending Promise and clean up
                    rejectPending(error);
                    pendingMap.delete(key);
                });
                return placeholder;
            }
            else {
                // Synchronous path: SpawnClass is a constructor
                const instance = new SpawnClass(this, ctx, initVals);
                // Validate shape if configured
                if (optIn.validateShape) {
                    if (!optIn.validateShape(instance)) {
                        throw new Error(`assignFeatures: spawned instance for "${key}" failed shape validation`);
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
 * Valid lifecycle callback names that can be forwarded to features.
 */
const VALID_CALLBACKS = new Set([
    'connectedCallback',
    'disconnectedCallback',
    'attributeChangedCallback',
    'adoptedCallback',
    'formDisabledCallback',
    'formResetCallback',
    'formStateRestoreCallback'
]);
/**
 * WeakMap tracking which callbacks have been patched on which constructors,
 * and which feature keys are registered for each callback.
 * Structure: Map<Function, Map<callbackName, Set<featureKey>>>
 */
const callbackRegistry = new Map();
/**
 * Installs or updates lifecycle callback forwarding on a constructor's prototype.
 * Patches the callback once per type, accumulating feature keys for each.
 */
function installCallbackForwarding(ctr, key, callbacks) {
    let ctrCallbacks = callbackRegistry.get(ctr);
    if (!ctrCallbacks) {
        ctrCallbacks = new Map();
        callbackRegistry.set(ctr, ctrCallbacks);
    }
    for (const callbackName of callbacks) {
        if (!VALID_CALLBACKS.has(callbackName)) {
            throw new Error(`assignFeatures: invalid callbackForwarding "${callbackName}" for feature "${key}". ` +
                `Valid values: ${[...VALID_CALLBACKS].join(', ')}`);
        }
        // Validate that the spawn class has the method (sync spawners only)
        // For async spawners, validation is deferred to runtime
        let featureKeys = ctrCallbacks.get(callbackName);
        if (!featureKeys) {
            featureKeys = new Set();
            ctrCallbacks.set(callbackName, featureKeys);
            // Patch the prototype callback (only once per callback type per class)
            const original = ctr.prototype[callbackName];
            Object.defineProperty(ctr.prototype, callbackName, {
                value: function (...args) {
                    // Call original first
                    if (original)
                        original.apply(this, args);
                    // Forward to all registered features
                    const keys = callbackRegistry.get(ctr)?.get(callbackName);
                    if (keys) {
                        for (const featureKey of keys) {
                            // Access the getter (triggers lazy spawn on first connectedCallback)
                            const feature = this[featureKey];
                            // Only forward if it's a real instance (not a placeholder or error)
                            if (feature && typeof feature === 'object' &&
                                typeof feature[callbackName] === 'function' &&
                                !(FEATURE_ERROR in feature)) {
                                feature[callbackName](...args);
                            }
                        }
                    }
                },
                writable: true,
                enumerable: false,
                configurable: true
            });
        }
        // Add this feature key to the set for this callback
        featureKeys.add(key);
    }
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
    let hasAsync = false;
    async function processFeatures() {
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
            // 6. Install callback forwarding if configured (merge author + consumer)
            const featureConfig = features[key];
            const optIn = supportedFeatures[key];
            const authorCallbacks = optIn.callbackForwarding || [];
            const consumerCallbacks = featureConfig.callbackForwarding || [];
            // Union of both (author defaults + consumer additions)
            const allCallbacks = [...new Set([...authorCallbacks, ...consumerCallbacks])];
            if (allCallbacks.length > 0) {
                installCallbackForwarding(ctr, key, allCallbacks);
            }
            // 7. Call static onAssigned if the spawn class defines it (sequentially awaited)
            const SpawnClass = featureConfig.spawn;
            if (SpawnClass && !isAsyncSpawn(SpawnClass) &&
                Object.hasOwn(SpawnClass, 'onAssigned') &&
                typeof SpawnClass.onAssigned === 'function') {
                const result = SpawnClass.onAssigned(ctr, featureConfig, key);
                if (result && typeof result.then === 'function') {
                    hasAsync = true;
                    await result;
                }
            }
        }
        // 8. Install whenFeatureReady method if featuresConfig.lifecycleKeys is configured
        const featuresConfig = ctr.featuresConfig;
        if (featuresConfig?.lifecycleKeys) {
            const methodName = resolveWhenFeatureReadyName(featuresConfig.lifecycleKeys);
            if (methodName) {
                installWhenFeatureReadyMethod(ctr, methodName);
            }
        }
    }
    // Check if any feature has an async onAssigned (pre-scan)
    for (const key of Object.keys(features)) {
        const featureConfig = features[key];
        const SpawnClass = featureConfig.spawn;
        if (SpawnClass && !isAsyncSpawn(SpawnClass) &&
            Object.hasOwn(SpawnClass, 'onAssigned') &&
            typeof SpawnClass.onAssigned === 'function') {
            // We can't know if it's async without calling it, so always use the async path
            // if any onAssigned exists
            return processFeatures();
        }
    }
    // No onAssigned hooks — run synchronously (inline the logic to avoid the async wrapper)
    for (const key of Object.keys(features)) {
        if (!(key in supportedFeatures)) {
            throw new Error(`assignFeatures: "${key}" is not declared in ${ctr.name || 'constructor'}.supportedFeatures`);
        }
        const existingDescriptor = Object.getOwnPropertyDescriptor(ctr.prototype, key);
        if (existingDescriptor) {
            throw new Error(`assignFeatures: "${key}" already exists on ${ctr.name || 'constructor'}.prototype`);
        }
        if (featuresRegistry.hasKey(ctr, key)) {
            throw new Error(`assignFeatures: "${key}" has already been assigned for ${ctr.name || 'constructor'}`);
        }
        featuresRegistry.set(ctr, key, features[key]);
        installFeatureGetter(ctr, key, featuresRegistry);
        const featureConfig = features[key];
        const optIn = supportedFeatures[key];
        const authorCallbacks = optIn.callbackForwarding || [];
        const consumerCallbacks = featureConfig.callbackForwarding || [];
        const allCallbacks = [...new Set([...authorCallbacks, ...consumerCallbacks])];
        if (allCallbacks.length > 0) {
            installCallbackForwarding(ctr, key, allCallbacks);
        }
    }
    const featuresConfig = ctr.featuresConfig;
    if (featuresConfig?.lifecycleKeys) {
        const methodName = resolveWhenFeatureReadyName(featuresConfig.lifecycleKeys);
        if (methodName) {
            installWhenFeatureReadyMethod(ctr, methodName);
        }
    }
    return undefined;
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
/**
 * Global store for inter-feature suggestions.
 * Structure: Map<targetSymbol, Map<targetClass, Array<FeatureInfoSuggestion>>>
 * Scoped per target class to prevent leaking between different custom elements.
 */
const featureInfoSuggestions = new Map();
/**
 * Suggest configuration to another feature during registration.
 *
 * Call this in a feature's `static onAssigned` to provide config fragments
 * (withAttrs, customData) that another feature should merge into its own config.
 *
 * The target feature is identified by a Symbol (stable across versions and mocks).
 * Suggestions are scoped per target class to prevent leaking between different
 * custom elements that use the same features.
 *
 * @param fromFeatureCtr - The feature class making the suggestion (for tracing)
 * @param toFeatureSymbol - Symbol identifying the target feature
 * @param featureInfo - Config fragments to suggest (withAttrs, customData)
 * @param targetClass - The custom element class being configured
 *
 * @example
 * import { suggestFeatureInfo } from 'assign-gingerly/assignFeatures.js';
 * import { ROUNDABOUT_FEATURE } from 'roundabout/symbols.js';
 *
 * class FaceUp {
 *     static onAssigned(ctr, featureConfig) {
 *         suggestFeatureInfo(FaceUp, ROUNDABOUT_FEATURE, {
 *             customData: { formBindings: { value: 'value' } }
 *         }, ctr);
 *     }
 * }
 */
export function suggestFeatureInfo(fromFeatureCtr, toFeatureSymbol, featureInfo, targetClass) {
    let symbolMap = featureInfoSuggestions.get(toFeatureSymbol);
    if (!symbolMap) {
        symbolMap = new Map();
        featureInfoSuggestions.set(toFeatureSymbol, symbolMap);
    }
    let suggestions = symbolMap.get(targetClass);
    if (!suggestions) {
        suggestions = [];
        symbolMap.set(targetClass, suggestions);
    }
    suggestions.push({
        from: fromFeatureCtr,
        ...featureInfo
    });
}
/**
 * Retrieve suggestions made to a feature by other features.
 *
 * Call this in a feature's `static onAssigned` to read config fragments
 * suggested by other features that were processed earlier.
 *
 * @param toFeatureSymbol - Symbol identifying this feature (the target)
 * @param targetClass - The custom element class being configured
 * @returns Array of suggestions (empty if none)
 *
 * @example
 * import { getFeatureInfoSuggestions } from 'assign-gingerly/assignFeatures.js';
 * import { ROUNDABOUT_FEATURE } from './symbols.js';
 *
 * class RoundaboutFeature {
 *     static onAssigned(ctr, featureConfig) {
 *         const suggestions = getFeatureInfoSuggestions(ROUNDABOUT_FEATURE, ctr);
 *         for (const suggestion of suggestions) {
 *             if (suggestion.customData) {
 *                 featureConfig.customData = { ...featureConfig.customData, ...suggestion.customData };
 *             }
 *         }
 *     }
 * }
 */
export function getFeatureInfoSuggestions(toFeatureSymbol, targetClass) {
    const symbolMap = featureInfoSuggestions.get(toFeatureSymbol);
    if (!symbolMap)
        return [];
    return symbolMap.get(targetClass) || [];
}
// =============================================================================
// PropertyBag — base class for nested feature containers
// =============================================================================
/**
 * PropertyBag is a base class for creating nested feature containers.
 *
 * Subclass it to group related features under a single namespace property.
 * PropertyBag carries the `customElementRegistry` reference from the host element
 * so that nested features can resolve their registries correctly.
 *
 * PropertyBag must be subclassed — direct instantiation throws an error.
 * Subclasses must define `static supportedFeatures` to declare their feature slots.
 *
 * @example
 * class ClubMemberBehaviors extends PropertyBag {
 *     static supportedFeatures = {
 *         commandBehavior: { fallbackSpawn: CommandFeatureImpl },
 *         ariaBehavior: { fallbackSpawn: AriaFeatureImpl }
 *     }
 * }
 *
 * class ClubMember extends HTMLElement {
 *     static supportedFeatures = {
 *         behaviors: { fallbackSpawn: ClubMemberBehaviors }
 *     }
 * }
 *
 * customElements.assignFeatures(ClubMember, { behaviors: { spawn: ClubMemberBehaviors } });
 * customElements.assignFeatures(ClubMemberBehaviors, {
 *     commandBehavior: { spawn: CommandFeatureImpl }
 * });
 */
export class PropertyBag {
    /** Registry reference carried from the host element */
    customElementRegistry;
    constructor(hostElement, ctx, initVals) {
        if (this.constructor === PropertyBag) {
            throw new Error('PropertyBag must be subclassed. Define static supportedFeatures on your subclass.');
        }
        // Carry the registry reference from the host element
        this.customElementRegistry = hostElement.customElementRegistry ||
            (typeof customElements !== 'undefined' ? customElements : undefined);
        // Apply any initVals
        if (initVals && typeof initVals === 'object') {
            Object.assign(this, initVals);
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
            return assignFeatures(ctr, features, this.featuresRegistry);
        },
        writable: true,
        enumerable: false,
        configurable: true,
    });
}
