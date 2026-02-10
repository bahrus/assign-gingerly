import assignGingerly, { BaseRegistry, getInstanceMap } from './assignGingerly.js';
/**
 * Adds assignGingerlyRegistry to CustomElementRegistry prototype as a lazy getter
 */
if (typeof CustomElementRegistry !== 'undefined') {
    Object.defineProperty(CustomElementRegistry.prototype, 'assignGingerlyRegistry', {
        get: function () {
            // Create a new BaseRegistry instance on first access and cache it
            const registry = new BaseRegistry();
            // Replace the getter with the actual value
            Object.defineProperty(this, 'assignGingerlyRegistry', {
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
}
/**
 * Enhancement container class for Element.prototype.enh
 * Provides a 'set' proxy for enhanced property assignment
 */
class ElementEnhancementContainer {
    element;
    _setProxy;
    constructor(element) {
        this.element = element;
    }
    /**
     * Get or spawn an instance for a registry item
     * @param registryItem - The registry item to get/spawn instance for
     * @returns The spawned instance
     */
    get(registryItem) {
        const element = this.element;
        // Get the registry from customElementRegistry
        const registry = element.customElementRegistry?.assignGingerlyRegistry;
        if (!registry) {
            throw new Error('customElementRegistry.assignGingerlyRegistry not available');
        }
        // Check if registryItem is in the registry
        const items = registry.getItems();
        if (!items.includes(registryItem)) {
            // Add it to the registry
            registry.push(registryItem);
        }
        // Get or create instance using the global instance map
        const instanceMap = getInstanceMap();
        if (!instanceMap.has(element)) {
            instanceMap.set(element, new Map());
        }
        const instances = instanceMap.get(element);
        let instance = instances.get(registryItem);
        if (!instance) {
            // Need to spawn
            const SpawnClass = registryItem.spawn;
            // Check if there's an enhKey
            if (registryItem.enhKey) {
                const ctx = { mountInfo: registryItem };
                const self = this;
                const initVals = self[registryItem.enhKey] &&
                    !(self[registryItem.enhKey] instanceof SpawnClass)
                    ? self[registryItem.enhKey]
                    : undefined;
                instance = new SpawnClass(element, ctx, initVals);
                // Store on enh container
                self[registryItem.enhKey] = instance;
            }
            else {
                // No enhKey, just spawn with element
                const ctx = { mountInfo: registryItem };
                instance = new SpawnClass(element, ctx);
            }
            // Store in global instance map
            instances.set(registryItem, instance);
        }
        return instance;
    }
    /**
     * Lazy getter for the set proxy
     */
    get set() {
        if (!this._setProxy) {
            const self = this; // Allow dynamic property access
            const element = this.element;
            this._setProxy = new Proxy(this, {
                get(obj, prop) {
                    // Get the registry from customElementRegistry
                    const registry = element.customElementRegistry?.assignGingerlyRegistry;
                    if (registry) {
                        // Check if there's a registry item with matching enhKey
                        const registryItem = registry.findByEnhKey(prop);
                        if (registryItem) {
                            const SpawnClass = registryItem.spawn;
                            // Check the global instance map first
                            const instanceMap = getInstanceMap();
                            if (!instanceMap.has(element)) {
                                instanceMap.set(element, new Map());
                            }
                            const instances = instanceMap.get(element);
                            let instance = instances.get(registryItem);
                            if (!instance) {
                                // Need to spawn
                                let initVals = undefined;
                                // If property exists but isn't the right instance, pass it as initVals
                                if (self[prop] && !(self[prop] instanceof SpawnClass)) {
                                    initVals = self[prop];
                                }
                                // Create spawn context
                                const ctx = { mountInfo: registryItem };
                                // Spawn the instance
                                instance = new SpawnClass(element, ctx, initVals);
                                // Store in global instance map
                                instances.set(registryItem, instance);
                                // Set it on the enh container
                                self[prop] = instance;
                            }
                            else {
                                // Instance exists in global map, ensure it's on enh container
                                if (self[prop] !== instance) {
                                    self[prop] = instance;
                                }
                            }
                            return instance;
                        }
                    }
                    // No registry item found - create plain object if needed
                    if (self[prop] === undefined) {
                        self[prop] = {};
                    }
                    return self[prop];
                }
            });
        }
        return this._setProxy;
    }
}
/**
 * Adds 'enh' property to Element prototype for enhanced property assignment
 * Supports automatic spawning of enhancement classes based on registry
 */
if (typeof Element !== 'undefined') {
    const enhContainerWeakMap = new WeakMap();
    Object.defineProperty(Element.prototype, 'enh', {
        get: function () {
            if (!enhContainerWeakMap.has(this)) {
                enhContainerWeakMap.set(this, new ElementEnhancementContainer(this));
            }
            return enhContainerWeakMap.get(this);
        },
        enumerable: true,
        configurable: true,
    });
}
/**
 * Adds assignGingerly method to all objects via the Object prototype
 */
Object.defineProperty(Object.prototype, 'assignGingerly', {
    value: function (source, options) {
        // Auto-populate registry from customElementRegistry if this is an Element
        if (this instanceof Element && (!options || !options.registry)) {
            if (!options)
                options = {};
            options.registry = this.customElementRegistry?.assignGingerlyRegistry;
        }
        assignGingerly(this, source, options);
        return this;
    },
    writable: true,
    enumerable: false,
    configurable: true,
});
/**
 * Adds assignTentatively method to all objects via the Object prototype
 * This is an alias for assignGingerly
 */
Object.defineProperty(Object.prototype, 'assignTentatively', {
    value: function (source, options) {
        // Auto-populate registry from customElementRegistry if this is an Element
        if (this instanceof Element && (!options || !options.registry)) {
            if (!options)
                options = {};
            options.registry = this.customElementRegistry?.assignGingerlyRegistry;
        }
        assignGingerly(this, source, options);
        return this;
    },
    writable: true,
    enumerable: false,
    configurable: true,
});
export default assignGingerly;
