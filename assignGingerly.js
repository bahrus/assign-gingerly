// Polyfill for Map.prototype.getOrInsert and WeakMap.prototype.getOrInsert
if (typeof Map.prototype.getOrInsertComputed !== 'function') {
    Map.prototype.getOrInsertComputed = function (key, insert) {
        if (this.has(key))
            return this.get(key);
        const value = insert();
        this.set(key, value);
        return value;
    };
}
if (typeof WeakMap.prototype.getOrInsertComputed !== 'function') {
    WeakMap.prototype.getOrInsertComputed = function (key, insert) {
        if (this.has(key))
            return this.get(key);
        const value = insert();
        this.set(key, value);
        return value;
    };
}
/**
 * GUID for global instance map storage to ensure uniqueness across package versions
 */
export const INSTANCE_MAP_GUID = 'HDBhTPLuIUyooMxK88m68Q';
/**
 * Get or create the global instance map
 * Stored in globalThis to ensure uniqueness across different package versions
 * Maps objects to a Map of registry items to their spawned instances
 */
export function getInstanceMap() {
    if (!globalThis[INSTANCE_MAP_GUID]) {
        globalThis[INSTANCE_MAP_GUID] = new WeakMap();
    }
    return globalThis[INSTANCE_MAP_GUID];
}
/**
 * Base registry class for managing enhancement configurations
 */
export class EnhancementRegistry {
    #items = new Set();
    push(items) {
        if (Array.isArray(items)) {
            items.forEach(item => this.#items.add(item));
        }
        else {
            this.#items.add(items);
        }
    }
    getItems() {
        return Array.from(this.#items);
    }
    findBySymbol(symbol) {
        for (const item of this.#items) {
            const symlinks = item.symlinks;
            if (!symlinks)
                continue;
            const hasSymbol = Object.keys(symlinks).some(key => {
                if (typeof key === 'symbol' || (typeof symlinks[key] === 'symbol')) {
                    return key === symbol || symlinks[key] === symbol;
                }
                return false;
            }) || Object.getOwnPropertySymbols(symlinks).some(sym => sym === symbol);
            if (hasSymbol)
                return item;
        }
        return undefined;
    }
    findByEnhKey(enhKey) {
        for (const item of this.#items) {
            if (item.enhKey === enhKey)
                return item;
        }
        return undefined;
    }
}
/**
 * Helper function to check if a string key represents a Symbol.for expression
 */
function isSymbolForKey(key) {
    return key.startsWith('[Symbol.for(') && key.endsWith(')]');
}
/**
 * Helper function to extract the symbol key from a Symbol.for string
 */
function parseSymbolForKey(key) {
    const match = key.match(/^\[Symbol\.for\(['"](.+)['"]\)\]$/);
    if (match && match[1]) {
        return Symbol.for(match[1]);
    }
    return null;
}
/**
 * Helper function to check if a key represents an += command
 */
function isIncCommand(key) {
    return key.endsWith(' +=');
}
/**
 * Helper function to parse an += command and extract the path
 */
function parseIncCommand(key) {
    if (!isIncCommand(key)) {
        return null;
    }
    return key.substring(0, key.length - 3); // Remove ' +=' suffix
}
/**
 * Helper function to check if a key represents a =! command
 */
function isToggleCommand(key) {
    return key.endsWith(' =!');
}
/**
 * Helper function to parse a =! command and extract the path
 */
function parseToggleCommand(key) {
    if (!isToggleCommand(key)) {
        return null;
    }
    return key.substring(0, key.length - 3); // Remove ' =!' suffix
}
/**
 * Helper function to check if a key represents a -= delete command
 */
function isDeleteCommand(key) {
    return key.endsWith(' -=');
}
/**
 * Helper function to parse a -= delete command and extract the path
 */
function parseDeleteCommand(key) {
    if (!isDeleteCommand(key)) {
        return null;
    }
    return key.substring(0, key.length - 3); // Remove ' -=' suffix
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
export function assignGingerly(target, source, options) {
    if (!target || typeof target !== 'object') {
        return target;
    }
    const registry = options?.registry instanceof EnhancementRegistry
        ? options.registry
        : options?.registry
            ? new options.registry()
            : undefined;
    // Convert Symbol.for string keys to actual symbols
    const processedSource = {};
    for (const key of Object.keys(source)) {
        if (isSymbolForKey(key)) {
            const symbol = parseSymbolForKey(key);
            if (symbol) {
                processedSource[symbol] = source[key];
            }
            else {
                // Invalid Symbol.for format - treat as regular string key
                processedSource[key] = source[key];
            }
        }
        else {
            processedSource[key] = source[key];
        }
    }
    // Copy over actual symbol keys
    for (const sym of Object.getOwnPropertySymbols(source)) {
        processedSource[sym] = source[sym];
    }
    // First pass: handle all non-symbol keys and sync operations
    for (const key of Object.keys(processedSource)) {
        const value = processedSource[key];
        // Handle += commands
        if (isIncCommand(key)) {
            const path = parseIncCommand(key);
            if (path) {
                const pathParts = parsePath(path);
                const lastKey = pathParts[pathParts.length - 1];
                const parent = ensureNestedPath(target, pathParts);
                // If the path doesn't exist, set it directly to the value
                if (!(lastKey in parent)) {
                    parent[lastKey] = value;
                }
                else {
                    // Path exists, apply increment: oldValue += newValue
                    parent[lastKey] += value;
                }
            }
            continue;
        }
        // Handle =! commands (toggle/negate)
        if (isToggleCommand(key)) {
            const lhsPath = parseToggleCommand(key);
            if (lhsPath) {
                const rhsPath = value;
                // Parse LHS path
                const lhsPathParts = parsePath(lhsPath);
                const lhsLastKey = lhsPathParts[lhsPathParts.length - 1];
                const lhsParent = ensureNestedPath(target, lhsPathParts);
                // Determine what to negate
                let valueToNegate;
                if (rhsPath === '.') {
                    // Self-reference: negate the LHS value itself (if it exists)
                    if (lhsLastKey in lhsParent) {
                        valueToNegate = lhsParent[lhsLastKey];
                    }
                    else {
                        // LHS doesn't exist, treat as undefined -> !undefined = true
                        valueToNegate = undefined;
                    }
                }
                else {
                    // RHS path: navigate to get the value (don't create paths)
                    const rhsPathParts = parsePath(rhsPath);
                    let current = target;
                    let exists = true;
                    for (const part of rhsPathParts) {
                        if (current && typeof current === 'object' && part in current) {
                            current = current[part];
                        }
                        else {
                            exists = false;
                            break;
                        }
                    }
                    // If RHS doesn't exist, treat as truthy (will become false)
                    valueToNegate = exists ? current : true;
                }
                // Apply negation to LHS
                lhsParent[lhsLastKey] = !valueToNegate;
            }
            continue;
        }
        // Handle -= delete commands
        if (isDeleteCommand(key)) {
            const path = parseDeleteCommand(key);
            if (path !== null) {
                const pathParts = parsePath(path);
                // Determine the parent object
                let parent = target;
                let canDelete = true;
                // If path is empty or just '?', delete from root
                if (pathParts.length === 0) {
                    parent = target;
                }
                else {
                    // Navigate to parent object
                    for (const part of pathParts) {
                        if (parent && typeof parent === 'object' && part in parent) {
                            parent = parent[part];
                        }
                        else {
                            canDelete = false;
                            break;
                        }
                    }
                }
                if (canDelete && typeof parent === 'object' && parent !== null) {
                    // RHS can be a string (single property) or array (multiple properties)
                    const propertiesToDelete = Array.isArray(value) ? value : [value];
                    for (const prop of propertiesToDelete) {
                        if (prop in parent) {
                            delete parent[prop];
                        }
                    }
                }
            }
            continue;
        }
        if (isNestedPath(key)) {
            const pathParts = parsePath(key);
            const lastKey = pathParts[pathParts.length - 1];
            const parent = ensureNestedPath(target, pathParts);
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                // Recursively apply assignGingerly for nested objects
                if (!(lastKey in parent) || typeof parent[lastKey] !== 'object') {
                    parent[lastKey] = {};
                }
                assignGingerly(parent[lastKey], value, options);
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
                assignGingerly(target[key], value, options);
            }
            else {
                target[key] = value;
            }
        }
    }
    // Second pass: handle symbol keys for dependency injection
    const symbols = Object.getOwnPropertySymbols(processedSource);
    for (const sym of symbols) {
        const value = processedSource[sym];
        if (registry) {
            const registryItem = registry.findBySymbol(sym);
            if (registryItem) {
                const instanceMap = getInstanceMap();
                // Get or initialize the instances map for this target
                const instances = instanceMap.getOrInsertComputed(target, () => new Map());
                // Check if instance already exists (keyed by registryItem)
                let instance = instances.get(registryItem);
                if (!instance) {
                    const SpawnClass = registryItem.spawn;
                    // Check canSpawn if it exists
                    if (typeof SpawnClass.canSpawn === 'function') {
                        const ctx = { config: registryItem };
                        if (!SpawnClass.canSpawn(target, ctx)) {
                            // canSpawn returned false, skip spawning
                            continue;
                        }
                    }
                    // If target is an Element and registryItem has enhKey, pass element to constructor
                    if (registryItem.enhKey && typeof Element !== 'undefined' && target instanceof Element) {
                        const ctx = { config: registryItem };
                        const initVals = target.enh?.[registryItem.enhKey] &&
                            !(target.enh[registryItem.enhKey] instanceof SpawnClass)
                            ? target.enh[registryItem.enhKey]
                            : undefined;
                        instance = new SpawnClass(target, ctx, initVals);
                    }
                    else {
                        instance = new SpawnClass();
                    }
                    instances.set(registryItem, instance);
                    // If target is an Element and registryItem has enhKey, store on enh
                    if (registryItem.enhKey && typeof Element !== 'undefined' && target instanceof Element) {
                        if (!target.enh) {
                            // This shouldn't happen if object-extension is loaded, but handle it
                            target.enh = {};
                        }
                        target.enh[registryItem.enhKey] = instance;
                    }
                }
                // Find the mapped property name
                if (registryItem.symlinks) {
                    const mappedKey = registryItem.symlinks[sym];
                    if (mappedKey && instance && typeof instance === 'object') {
                        instance[mappedKey] = value;
                    }
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
                                const instanceMap = getInstanceMap();
                                const instances = instanceMap.getOrInsertComputed(target, () => new Map());
                                let instance = instances.get(registryItem);
                                if (!instance) {
                                    const SpawnClass = registryItem.spawn;
                                    // Check canSpawn if it exists
                                    if (typeof SpawnClass.canSpawn === 'function') {
                                        const ctx = { config: registryItem };
                                        if (!SpawnClass.canSpawn(target, ctx)) {
                                            // canSpawn returned false, skip spawning
                                            return true;
                                        }
                                    }
                                    // If target is an Element and registryItem has enhKey, pass element to constructor
                                    if (registryItem.enhKey && typeof Element !== 'undefined' && target instanceof Element) {
                                        const ctx = { config: registryItem };
                                        const initVals = target.enh?.[registryItem.enhKey] &&
                                            !(target.enh[registryItem.enhKey] instanceof SpawnClass)
                                            ? target.enh[registryItem.enhKey]
                                            : undefined;
                                        instance = new SpawnClass(target, ctx, initVals);
                                    }
                                    else {
                                        instance = new SpawnClass();
                                    }
                                    instances.set(registryItem, instance);
                                    // If target is an Element and registryItem has enhKey, store on enh
                                    if (registryItem.enhKey && typeof Element !== 'undefined' && target instanceof Element) {
                                        if (!target.enh) {
                                            target.enh = {};
                                        }
                                        target.enh[registryItem.enhKey] = instance;
                                    }
                                }
                                if (registryItem.symlinks) {
                                    const mappedKey = registryItem.symlinks[prop];
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
