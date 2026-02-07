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
