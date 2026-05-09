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

/**
 * Context passed to feature spawn constructors
 */
export interface FeatureSpawnContext {
    /** The feature key (e.g., 'photoTaker') */
    key: string;
    /** The SupportedFeatureConfig from static supportedFeatures */
    optIn: SupportedFeatureConfig;
    /** The FeatureConfig from assignFeatures */
    injection: FeatureConfig;
    /** The features registry reference */
    featuresRegistry: FeaturesRegistry;
    /** Shared context from the host element (via getSharedContext callback) */
    shared?: any;
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

    /**
     * Optional callback to provide shared context (e.g., ElementInternals, private state)
     * to the feature at construction time.
     * 
     * Defined in the class body, this callback has access to #private fields
     * because static methods/properties of a class can access private fields
     * of instances of that class.
     * 
     * The returned object is passed to the feature constructor as `ctx.shared`.
     * 
     * @param instance - The host element instance
     * @returns An object containing shared data for the feature
     * 
     * @example
     * static supportedFeatures = {
     *     ariaManager: {
     *         fallbackSpawn: AriaManagerImpl,
     *         getSharedContext(instance) {
     *             return { internals: instance.#internals };
     *         }
     *     }
     * }
     */
    getSharedContext?: (instance: any) => any;
}

/**
 * Class-level configuration for the features system.
 * Declared as `static featuresConfig` on the class.
 * 
 * @example
 * class ClubMember extends HTMLElement {
 *     static supportedFeatures = { photoTaker: { fallbackSpawn: PhotoTakerImpl } }
 *     static featuresConfig = { lifecycleKeys: true }
 * }
 */
export interface FeaturesClassConfig {
    /**
     * Lifecycle method configuration.
     * 
     * If set to `true`, installs a method named 'whenFeatureReady' on the prototype.
     * If set to an object, allows customizing the method name.
     * 
     * The installed method accepts a feature key and returns a Promise that resolves
     * with the feature instance once it's ready (useful for async spawners).
     * For synchronous spawners, the Promise resolves immediately.
     * 
     * Suggested default name: 'whenFeatureReady'
     * 
     * @example
     * static featuresConfig = { lifecycleKeys: true }
     * // await el.whenFeatureReady('photoTaker')
     * 
     * @example
     * static featuresConfig = { lifecycleKeys: { whenFeatureReady: 'awaitFeature' } }
     * // await el.awaitFeature('photoTaker')
     */
    lifecycleKeys?: true | {
        /** Method name for awaiting feature readiness. Defaults to 'whenFeatureReady'. */
        whenFeatureReady?: string;
    };
}

export interface FeatureConfig {
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

    /**
     * Attribute patterns for parsing element attributes into initVals.
     * Attributes are the "base layer" — programmatic values override them.
     * Always unprefixed for features (no enh- prefix).
     */
    withAttrs?: any; // AttrPatterns<any> — imported type from types

    /**
     * Reserved field for custom configuration data.
     * Not interpreted by the library — available to the feature class
     * via ctx.injection.customData in the constructor.
     */
    customData?: any;
}

export type SupportedFeaturesMap = Record<string, SupportedFeatureConfig>;
export type FeatureConfigsMap = Record<string, FeatureConfig>;

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
    #registry = new Map<Function, Map<string, FeatureConfig>>();

    has(ctr: Function): boolean {
        return this.#registry.has(ctr);
    }

    get(ctr: Function): Map<string, FeatureConfig> | undefined {
        return this.#registry.get(ctr);
    }

    set(ctr: Function, key: string, injection: FeatureConfig): void {
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
 * WeakMap storing pending Promises for async feature resolution.
 * Outer key: the instance. Inner map: feature key -> { promise, resolve, reject }.
 */
const pendingFeatures = new WeakMap<object, Map<string, { promise: Promise<any>, resolve: Function, reject: Function }>>();

/**
 * Resolves the whenFeatureReady method name from lifecycleKeys config.
 * Returns undefined if lifecycleKeys is not set.
 */
function resolveWhenFeatureReadyName(lifecycleKeys: true | { whenFeatureReady?: string } | undefined): string | undefined {
    if (lifecycleKeys === undefined) return undefined;
    if (lifecycleKeys === true) return 'whenFeatureReady';
    return lifecycleKeys.whenFeatureReady || 'whenFeatureReady';
}

/**
 * Installs the whenFeatureReady method on the constructor prototype if not already present.
 */
function installWhenFeatureReadyMethod(ctr: Function, methodName: string): void {
    // Only install once per class
    if (Object.getOwnPropertyDescriptor(ctr.prototype, methodName)) return;

    Object.defineProperty(ctr.prototype, methodName, {
        value: function (this: any, featureKey: string): Promise<any> {
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
            const shared = optIn.getSharedContext?.(this);
            const ctx: FeatureSpawnContext = {
                key,
                optIn,
                injection,
                featuresRegistry: fr,
                shared
            };

            // Parse attributes if withAttrs is configured
            let attrInitVals: any = undefined;
            if (injection.withAttrs && this instanceof Element) {
                try {
                    attrInitVals = parseWithAttrs(
                        this as Element,
                        injection.withAttrs,
                        true // always unprefixed for features
                    );
                } catch (e) {
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
                let resolvePending: Function;
                let rejectPending: Function;
                const promise = new Promise<any>((resolve, reject) => {
                    resolvePending = resolve;
                    rejectPending = reject;
                });
                pendingMap.set(key, { promise, resolve: resolvePending!, reject: rejectPending! });

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

                    // Parse attributes at resolution time (element should be in DOM by now)
                    let asyncAttrInitVals: any = undefined;
                    if (injection.withAttrs && hostElement instanceof Element) {
                        try {
                            asyncAttrInitVals = parseWithAttrs(
                                hostElement as Element,
                                injection.withAttrs,
                                true // always unprefixed for features
                            );
                        } catch (e) {
                            // Non-fatal: log and continue with placeholder as initVals
                            console.error('Error parsing feature attributes during async resolution:', e);
                        }
                    }

                    // Merge: attributes are base, placeholder (programmatic) overrides
                    const asyncInitVals = asyncAttrInitVals
                        ? { ...asyncAttrInitVals, ...currentPlaceholder }
                        : currentPlaceholder;

                    // Instantiate the real class with merged initVals
                    const realCtx: FeatureSpawnContext = {
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
                            const error: any = new Error(
                                `assignFeatures: spawned instance for "${key}" failed shape validation`
                            );
                            error.placeholder = currentPlaceholder;
                            currentStorage!.set(key, { [FEATURE_ERROR]: error });
                            rejectPending!(error);
                            pendingMap!.delete(key);
                            return;
                        }
                    }

                    // Replace placeholder with real instance
                    currentStorage!.set(key, instance);

                    // Resolve the pending Promise and clean up
                    resolvePending!(instance);
                    pendingMap!.delete(key);
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

                    // Reject the pending Promise and clean up
                    rejectPending!(error);
                    pendingMap!.delete(key);
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
    features: FeatureConfigsMap,
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

    // 6. Install whenFeatureReady method if featuresConfig.lifecycleKeys is configured
    const featuresConfig: FeaturesClassConfig | undefined = (ctr as any).featuresConfig;
    if (featuresConfig?.lifecycleKeys) {
        const methodName = resolveWhenFeatureReadyName(featuresConfig.lifecycleKeys);
        if (methodName) {
            installWhenFeatureReadyMethod(ctr, methodName);
        }
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
    customElementRegistry: any;

    constructor(hostElement: any, ctx?: FeatureSpawnContext, initVals?: any) {
        if (this.constructor === PropertyBag) {
            throw new Error(
                'PropertyBag must be subclassed. Define static supportedFeatures on your subclass.'
            );
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

// =============================================================================
// Self-installing: adds featuresRegistry and assignFeatures to CustomElementRegistry
// This code runs as a side effect when this module is imported.
// =============================================================================

declare global {
    interface CustomElementRegistry {
        featuresRegistry: FeaturesRegistry;
        assignFeatures(ctr: Function, features: FeatureConfigsMap): void;
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
        value: function (ctr: Function, features: FeatureConfigsMap): void {
            assignFeatures(ctr, features, this.featuresRegistry);
        },
        writable: true,
        enumerable: false,
        configurable: true,
    });
}
