import assignGingerly, { BaseRegistry } from './assignGingerly.js';
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
 * Adds 'set' proxy to Element prototype for enhanced property assignment
 * Supports automatic spawning of enhancement classes based on registry
 */
if (typeof Element !== 'undefined') {
    const setProxyWeakMap = new WeakMap();
    Object.defineProperty(Element.prototype, 'set', {
        get: function () {
            if (!setProxyWeakMap.has(this)) {
                const self = this;
                const proxy = new Proxy(self, {
                    get(obj, prop) {
                        // Get the registry from customElementRegistry
                        const registry = self.customElementRegistry?.assignGingerlyRegistry;
                        if (registry) {
                            // Check if there's a registry item with matching enhKey
                            const registryItem = registry.findByEnhKey(prop);
                            if (registryItem) {
                                const SpawnClass = registryItem.spawn;
                                // Check if enhancement already exists and is correct instance
                                if (self[prop] && self[prop] instanceof SpawnClass) {
                                    // Already exists, just return it
                                    return self[prop];
                                }
                                else {
                                    // Need to spawn
                                    let initVals = undefined;
                                    // If property exists but isn't the right instance, pass it as initVals
                                    if (self[prop] && !(self[prop] instanceof SpawnClass)) {
                                        initVals = self[prop];
                                    }
                                    // Create spawn context
                                    const ctx = { mountInfo: registryItem };
                                    // Spawn the instance
                                    const instance = new SpawnClass(self, ctx, initVals);
                                    // Set it on the element
                                    self[prop] = instance;
                                    return instance;
                                }
                            }
                        }
                        // No registry item found - create plain object if needed
                        if (self[prop] === undefined) {
                            self[prop] = {};
                        }
                        return self[prop];
                    }
                });
                setProxyWeakMap.set(this, proxy);
            }
            return setProxyWeakMap.get(this);
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
