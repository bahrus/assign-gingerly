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
/**
 * Event dispatched when enhancement configs are registered
 */
export class EnhancementRegisteredEvent extends Event {
    config;
    static eventName = 'register';
    constructor(config) {
        super(EnhancementRegisteredEvent.eventName);
        this.config = config;
    }
}
/**
 * Registry for enhancement configurations
 * Extends EventTarget to dispatch events when configs are registered
 */
export class EnhancementRegistry extends EventTarget {
    #items = new Set();
    push(items) {
        if (Array.isArray(items)) {
            items.forEach(item => this.#items.add(item));
        }
        else {
            this.#items.add(items);
        }
        // Dispatch event after adding items
        this.dispatchEvent(new EnhancementRegisteredEvent(items));
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
 * Registry for ItemScope Manager configurations
 * Extends EventTarget to support lazy registration via events
 */
export class ItemscopeRegistry extends EventTarget {
    #configs = new Map();
    #pendingSetups = new Map();
    /**
     * Define a new manager configuration
     * @param name - Manager name (matches itemscope attribute value)
     * @param config - Manager configuration object
     * @throws Error if name is already registered
     */
    define(name, config) {
        if (this.#configs.has(name)) {
            throw new Error('Already registered');
        }
        this.#configs.set(name, config);
        this.dispatchEvent(new Event(name));
    }
    /**
     * Get a manager configuration by name
     * @param name - Manager name
     * @returns Manager configuration or undefined
     */
    get(name) {
        return this.#configs.get(name);
    }
    /**
     * Wait for a manager to be defined and all pending setups to complete
     * @param name - Manager name to wait for
     * @returns Promise that resolves when manager is defined and all setups are complete
     */
    async whenDefined(name) {
        // If not yet defined, wait for definition
        if (!this.#configs.has(name)) {
            await new Promise((resolve) => {
                this.addEventListener(name, () => resolve(), { once: true });
            });
        }
        // Wait for all pending setups for this manager
        const pending = this.#pendingSetups.get(name);
        if (pending && pending.length > 0) {
            await Promise.all(pending);
        }
    }
    /**
     * Internal method to track a pending setup
     * @param name - Manager name
     * @param promise - Promise representing the setup operation
     */
    _trackSetup(name, promise) {
        if (!this.#pendingSetups.has(name)) {
            this.#pendingSetups.set(name, []);
        }
        this.#pendingSetups.get(name).push(promise);
        // Clean up after completion
        promise.finally(() => {
            const pending = this.#pendingSetups.get(name);
            if (pending) {
                const index = pending.indexOf(promise);
                if (index > -1) {
                    pending.splice(index, 1);
                }
            }
        });
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
 * Helper function to check if a property is readonly
 * A property is readonly if:
 * - It's a data property with writable: false, OR
 * - It's an accessor property with a getter but no setter
 */
function isReadonlyProperty(obj, propName) {
    let descriptor = Object.getOwnPropertyDescriptor(obj, propName);
    if (!descriptor) {
        // Check prototype chain
        let proto = Object.getPrototypeOf(obj);
        while (proto) {
            descriptor = Object.getOwnPropertyDescriptor(proto, propName);
            if (descriptor)
                break;
            proto = Object.getPrototypeOf(proto);
        }
    }
    if (!descriptor)
        return false;
    // If it's a data property, check writable flag
    if ('value' in descriptor) {
        return descriptor.writable === false;
    }
    // If it's an accessor property, check if it has only a getter (no setter)
    if ('get' in descriptor) {
        return descriptor.set === undefined;
    }
    return false;
}
/**
 * Helper function to check if a value is a class instance (not a plain object)
 * Returns true for instances of classes, false for plain objects, arrays, and primitives
 */
function isClassInstance(value) {
    if (!value || typeof value !== 'object')
        return false;
    if (Array.isArray(value))
        return false;
    const proto = Object.getPrototypeOf(value);
    // Plain objects have Object.prototype or null as prototype
    return proto !== Object.prototype && proto !== null;
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
    // Process 'ish' property for HTMLElements with itemscope (async, non-blocking)
    if ('ish' in processedSource) {
        if (typeof HTMLElement !== 'undefined' && target instanceof HTMLElement) {
            // Capture the value before deleting
            const ishValue = processedSource['ish'];
            // Remove 'ish' from processedSource to prevent normal assignment
            delete processedSource['ish'];
            // Get the itemscope attribute to track the setup
            const itemscopeValue = target.getAttribute('itemscope');
            // Load handler on demand and process asynchronously
            const setupPromise = (async () => {
                try {
                    const { handleIshProperty } = await import('./handleIshProperty.js');
                    await handleIshProperty(target, ishValue, options, assignGingerly);
                }
                catch (err) {
                    console.error('Error in handleIshProperty:', err);
                    // Re-throw errors asynchronously so they're visible
                    setTimeout(() => { throw err; }, 0);
                }
            })();
            // Track the setup promise with the registry if we have an itemscope value
            if (itemscopeValue && typeof itemscopeValue === 'string' && itemscopeValue.length > 0) {
                const registry = target.customElementRegistry?.itemscopeRegistry
                    ?? (typeof customElements !== 'undefined' ? customElements.itemscopeRegistry : undefined);
                if (registry && typeof registry._trackSetup === 'function') {
                    registry._trackSetup(itemscopeValue, setupPromise);
                }
            }
        }
        // For non-HTMLElement targets, 'ish' is processed as a normal property
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
                // Check if property exists and is readonly OR is a class instance
                if (lastKey in parent && (isReadonlyProperty(parent, lastKey) || isClassInstance(parent[lastKey]))) {
                    // Property is readonly or a class instance - check if current value is an object
                    const currentValue = parent[lastKey];
                    if (typeof currentValue !== 'object' || currentValue === null) {
                        throw new Error(`Cannot merge object into ${isReadonlyProperty(parent, lastKey) ? 'readonly ' : ''}primitive property '${String(lastKey)}'`);
                    }
                    // Recursively apply assignGingerly to the readonly object or class instance
                    assignGingerly(currentValue, value, options);
                }
                else {
                    // Property is writable and not a class instance - normal recursive merge
                    if (!(lastKey in parent) || typeof parent[lastKey] !== 'object') {
                        parent[lastKey] = {};
                    }
                    assignGingerly(parent[lastKey], value, options);
                }
            }
            else {
                parent[lastKey] = value;
            }
        }
        else {
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                // Check if property exists and is readonly OR is a class instance
                if (key in target && (isReadonlyProperty(target, key) || isClassInstance(target[key]))) {
                    // Property is readonly or a class instance - check if current value is an object
                    const currentValue = target[key];
                    if (typeof currentValue !== 'object' || currentValue === null) {
                        throw new Error(`Cannot merge object into ${isReadonlyProperty(target, key) ? 'readonly ' : ''}primitive property '${String(key)}'`);
                    }
                    // Recursively apply assignGingerly to the readonly object or class instance
                    assignGingerly(currentValue, value, options);
                }
                else {
                    // Property is writable and not a class instance - simple assignment
                    target[key] = value;
                }
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
