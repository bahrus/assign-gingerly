import assignGingerly, { BaseRegistry, IAssignGingerlyOptions } from './assignGingerly.js';

/**
 * Extends the CustomElementRegistry interface to include assignGingerlyRegistry
 */
declare global {
  interface CustomElementRegistry {
    assignGingerlyRegistry: typeof BaseRegistry | BaseRegistry;
  }
}

/**
 * Extends the Object interface to include the assignGingerly and assignTentatively methods
 */
declare global {
  interface Object {
    /**
     * Carefully merge properties from a source object into this object.
     * Supports nested paths with ?. notation and dependency injection via registry.
     * 
     * @param source - The source object to merge
     * @param options - Optional configuration with registry for dependency injection
     * @returns This object after merging
     * 
     * @example
     * const target = {};
     * target.assignGingerly({ '?.style?.height': '15px' });
     * console.log(target); // { style: { height: '15px' } }
     * 
     * @example
     * const obj = { a: 1 };
     * obj.assignGingerly({ b: 2, '?.nested?.key': 'value' });
     * console.log(obj); // { a: 1, b: 2, nested: { key: 'value' } }
     */
    assignGingerly(
      source: Record<string | symbol, any>,
      options?: IAssignGingerlyOptions
    ): this;

    /**
     * Alias for assignGingerly. Carefully merge properties from a source object into this object.
     * Supports nested paths with ?. notation and dependency injection via registry.
     * 
     * @param source - The source object to merge
     * @param options - Optional configuration with registry for dependency injection
     * @returns This object after merging
     * 
     * @example
     * const target = {};
     * target.assignTentatively({ '?.style?.height': '15px' });
     * console.log(target); // { style: { height: '15px' } }
     */
    assignTentatively(
      source: Record<string | symbol, any>,
      options?: IAssignGingerlyOptions
    ): this;
  }
}

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
  value: function <T extends object>(
    this: T,
    source: Record<string | symbol, any>,
    options?: IAssignGingerlyOptions
  ): T {
    // Auto-populate registry from customElementRegistry if this is an Element
    if (this instanceof Element && (!options || !options.registry)) {
      if (!options) options = {};
      options.registry = (this as any).customElementRegistry?.assignGingerlyRegistry;
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
  value: function <T extends object>(
    this: T,
    source: Record<string | symbol, any>,
    options?: IAssignGingerlyOptions
  ): T {
    // Auto-populate registry from customElementRegistry if this is an Element
    if (this instanceof Element && (!options || !options.registry)) {
      if (!options) options = {};
      options.registry = (this as any).customElementRegistry?.assignGingerlyRegistry;
    }
    assignGingerly(this, source, options);
    return this;
  },
  writable: true,
  enumerable: false,
  configurable: true,
});

export default assignGingerly;
