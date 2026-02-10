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
                                const instance = new SpawnClass(element, ctx, initVals);
                                // Set it on the enh container
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
