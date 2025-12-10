/**
 * Map to store spawned instances associated with objects
 */
const instanceMap = new WeakMap();
/**
 * Base registry class for managing dependency injection
 */
export class BaseRegistry {
    items = [];
    define(items) {
        if (Array.isArray(items)) {
            this.items.push(...items);
        }
        else {
            this.items.push(items);
        }
    }
    getItems() {
        return this.items;
    }
    findBySymbol(symbol) {
        return this.items.find(item => {
            const map = item.map;
            return Object.keys(map).some(key => {
                if (typeof key === 'symbol' || (typeof map[key] === 'symbol')) {
                    return key === symbol || map[key] === symbol;
                }
                return false;
            }) || Object.getOwnPropertySymbols(map).some(sym => sym === symbol);
        });
    }
}
/**
 * Helper function to parse a path string with ?. notation
 */
function parsePath(path) {
    return path
        .split('.')
        .map(part => part.replace(/\?/g, ''))
        .filter(part => part.length > 0);
}
/**
 * Helper function to check if a path starts with ?. notation
 */
function isNestedPath(path) {
    return path.startsWith('?.');
}
/**
 * Helper function to get or create a nested object
 */
function ensureNestedPath(obj, pathParts) {
    let current = obj;
    for (const part of pathParts.slice(0, -1)) {
        if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
            current[part] = {};
        }
        current = current[part];
    }
    return current;
}
/**
 * Main assignGingerly function
 */
export async function assignGingerly(target, source, options) {
    if (!target || typeof target !== 'object') {
        return target;
    }
    const registry = options?.registry instanceof BaseRegistry
        ? options.registry
        : options?.registry
            ? new options.registry()
            : undefined;
    // Track promises for async spawning
    const asyncSpawns = [];
    // First pass: handle all non-symbol keys and sync operations
    for (const key of Object.keys(source)) {
        const value = source[key];
        if (isNestedPath(key)) {
            const pathParts = parsePath(key);
            const lastKey = pathParts[pathParts.length - 1];
            const parent = ensureNestedPath(target, pathParts);
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                // Recursively apply assignGingerly for nested objects
                if (!(lastKey in parent) || typeof parent[lastKey] !== 'object') {
                    parent[lastKey] = {};
                }
                await assignGingerly(parent[lastKey], value, options);
            }
            else {
                parent[lastKey] = value;
            }
        }
        else {
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                // Recursively apply assignGingerly for nested objects
                if (!(key in target) || typeof target[key] !== 'object') {
                    target[key] = {};
                }
                await assignGingerly(target[key], value, options);
            }
            else {
                target[key] = value;
            }
        }
    }
    // Second pass: handle symbol keys for dependency injection
    const symbols = Object.getOwnPropertySymbols(source);
    for (const sym of symbols) {
        const value = source[sym];
        if (registry) {
            const registryItem = registry.findBySymbol(sym);
            if (registryItem) {
                // Get or initialize the instances map for this target
                if (!instanceMap.has(target)) {
                    instanceMap.set(target, new Map());
                }
                const instances = instanceMap.get(target);
                // Check if instance already exists
                let instance = instances.get(sym);
                if (!instance) {
                    // Check if spawn is a constructor or a promise
                    const SpawnClass = await Promise.resolve(registryItem.spawn);
                    instance = new SpawnClass();
                    instances.set(sym, instance);
                }
                // Find the mapped property name
                const mappedKey = registryItem.map[sym];
                if (mappedKey && instance && typeof instance === 'object') {
                    instance[mappedKey] = value;
                }
            }
        }
    }
    // Add lazy 'set' property that returns a proxy
    if (registry && !('set' in target)) {
        Object.defineProperty(target, 'set', {
            get() {
                return new Proxy({}, {
                    set: (_, prop, value) => {
                        if (typeof prop === 'symbol') {
                            const registryItem = registry.findBySymbol(prop);
                            if (registryItem) {
                                if (!instanceMap.has(target)) {
                                    instanceMap.set(target, new Map());
                                }
                                const instances = instanceMap.get(target);
                                let instance = instances.get(prop);
                                if (!instance) {
                                    const SpawnClass = registryItem.spawn;
                                    if (SpawnClass instanceof Promise) {
                                        // Handle async case - would need to be awaited externally
                                        SpawnClass.then((SC) => {
                                            instance = new SC();
                                            instances.set(prop, instance);
                                            const mappedKey = registryItem.map[prop];
                                            if (mappedKey && instance && typeof instance === 'object') {
                                                instance[mappedKey] = value;
                                            }
                                        });
                                    }
                                    else {
                                        instance = new SpawnClass();
                                        instances.set(prop, instance);
                                        const mappedKey = registryItem.map[prop];
                                        if (mappedKey && instance && typeof instance === 'object') {
                                            instance[mappedKey] = value;
                                        }
                                    }
                                }
                                else {
                                    const mappedKey = registryItem.map[prop];
                                    if (mappedKey && instance && typeof instance === 'object') {
                                        instance[mappedKey] = value;
                                    }
                                }
                            }
                        }
                        return true;
                    },
                });
            },
            configurable: true,
        });
    }
    return target;
}
export default assignGingerly;
