/**
 * defineWithFeatures - Declaratively define a custom element with features from JSON config.
 *
 * Resolves async fallback spawns from the base class's `static supportedFeatures`,
 * creates a subclass, registers features with resolved spawns + JSON config,
 * and defines the custom element.
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
import { assignFeatures } from './assignFeatures.js';
/**
 * Determines if a function is an async spawner (same heuristic as assignFeatures).
 */
function isAsyncSpawn(fn) {
    if (typeof fn !== 'function')
        return false;
    if (fn.constructor.name === 'AsyncFunction')
        return true;
    if (fn.prototype === undefined)
        return true;
    return false;
}
/**
 * Cache for resolved fallback spawns.
 * Key: BaseClass, Value: Map<featureKey, resolvedConstructor>
 */
const resolvedSpawnCache = new WeakMap();
/**
 * Declaratively define a custom element with features.
 *
 * 1. Waits for the base class to be defined (if not already).
 * 2. Resolves all async fallback spawns from `static supportedFeatures`.
 * 3. Creates a subclass extending the base class.
 * 4. Calls `assignFeatures` with resolved spawns + the JSON config.
 * 5. Defines the new custom element in the registry.
 *
 * @param tagName - The custom element tag name to define (e.g., 'time-ticker')
 * @param baseTagName - The tag name of the base class to extend (e.g., 'el-maker')
 * @param config - JSON-serializable configuration specifying which features to activate
 * @param registry - Optional custom element registry (defaults to global `customElements`)
 * @returns The newly created and defined custom element class
 */
export async function defineWithFeatures(tagName, baseTagName, config, registry, options) {
    const reg = registry || customElements;
    // 1. Resolve base class — wait for it if not yet defined
    let BaseClass = reg.get(baseTagName);
    if (!BaseClass) {
        await reg.whenDefined(baseTagName);
        BaseClass = reg.get(baseTagName);
    }
    if (!BaseClass) {
        throw new Error(`defineWithFeatures: base class "${baseTagName}" could not be resolved`);
    }
    const supportedFeatures = BaseClass.supportedFeatures;
    if (!supportedFeatures) {
        throw new Error(`defineWithFeatures: "${baseTagName}" does not define static supportedFeatures`);
    }
    // 2. Resolve all async fallback spawns (with caching)
    let classCache = resolvedSpawnCache.get(BaseClass);
    if (!classCache) {
        classCache = new Map();
        resolvedSpawnCache.set(BaseClass, classCache);
    }
    const { assignFeatures: af } = config;
    console.log({ af });
    let resolvedSpawns;
    if (af) {
        const featureKeys = Object.keys(af);
        resolvedSpawns = new Map();
        await Promise.all(featureKeys.map(async (key) => {
            const optIn = supportedFeatures[key];
            if (!optIn) {
                throw new Error(`defineWithFeatures: feature "${key}" not found in ${baseTagName}.supportedFeatures`);
            }
            // Check cache first
            if (classCache.has(key)) {
                resolvedSpawns.set(key, classCache.get(key));
                return;
            }
            const featureConfig = af[key];
            const { spawn } = featureConfig;
            if (spawn) {
                if (isAsyncSpawn(spawn)) {
                    // Resolve the async spawner
                    const resolvedSpawn = await spawn();
                    classCache.set(key, resolvedSpawn);
                    resolvedSpawns.set(key, resolvedSpawn);
                    return;
                }
                if (typeof spawn === 'string') {
                    // Resolve the string spawn (import path or builtIns.* alias)
                    const { findClassPrototypeInPath } = await import('./utils/findClassPrototypeInPath.js');
                    const resolvedSpawn = await findClassPrototypeInPath(spawn);
                    classCache.set(key, resolvedSpawn);
                    resolvedSpawns.set(key, resolvedSpawn);
                    return;
                }
                // if spawn is a constructor, just use it
                classCache.set(key, spawn);
                resolvedSpawns.set(key, spawn);
                return;
            }
            let spawnClass = undefined;
            let { fallbackSpawn } = optIn;
            //let spawn = optIn.fallbackSpawn;
            if (fallbackSpawn && isAsyncSpawn(fallbackSpawn)) {
                // Resolve the async spawner
                fallbackSpawn = await fallbackSpawn();
            }
            // Cache the resolved spawn
            if (fallbackSpawn) {
                classCache.set(key, fallbackSpawn);
            }
            resolvedSpawns.set(key, fallbackSpawn);
        }));
    }
    // 3. Create subclass
    const NewClass = class extends BaseClass {
    };
    // 3b. Call onSubclassCreated callback (before define, before features if needed)
    if (options?.onSubclassCreated) {
        options.onSubclassCreated(NewClass);
    }
    if (af) {
        // 4. Build FeatureConfigsMap: resolved spawns + JSON config
        const featuresMap = {};
        for (const [key, jsonConfig] of Object.entries(af)) {
            featuresMap[key] = {
                spawn: resolvedSpawns.get(key),
                ...jsonConfig
            };
        }
        // 5. assignFeatures (sequential onAssigned) + define
        await assignFeatures(NewClass, featuresMap, reg.featuresRegistry);
    }
    reg.define(tagName, NewClass);
    return NewClass;
}
