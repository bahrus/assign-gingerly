import assignGingerly, { BaseRegistry, IAssignGingerlyOptions } from './assignGingerly.js';

/**
 * Extends the Object interface to include the assignGingerly method
 */
declare global {
  interface Object {
    /**
     * Carefully merge properties from a source object into this object.
     * Supports nested paths with ?. notation and dependency injection via registry.
     * 
     * @param source - The source object to merge
     * @param options - Optional configuration with registry for dependency injection
     * @returns A promise that resolves to this object after merging
     * 
     * @example
     * const target = {};
     * await target.assignGingerly({ '?.style?.height': '15px' });
     * console.log(target); // { style: { height: '15px' } }
     * 
     * @example
     * const obj = { a: 1 };
     * await obj.assignGingerly({ b: 2, '?.nested?.key': 'value' });
     * console.log(obj); // { a: 1, b: 2, nested: { key: 'value' } }
     */
    assignGingerly(
      source: Record<string | symbol, any>,
      options?: IAssignGingerlyOptions
    ): this;
  }
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
    assignGingerly(this, source, options);
    return this;
  },
  writable: true,
  enumerable: false,
  configurable: true,
});

export default assignGingerly;
