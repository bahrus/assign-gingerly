import assignGingerly from './index.js';

/**
 * Adds assignGingerly method to all objects via the Object prototype
 */
Object.defineProperty(Object.prototype, 'assignGingerly', {
  value: async function (source, options) {
    await assignGingerly(this, source, options);
    return this;
  },
  writable: true,
  enumerable: false,
  configurable: true,
});

export default assignGingerly;
