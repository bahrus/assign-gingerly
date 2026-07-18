/**
 * assignFromAsync-extension.js — Adds assignFromAsync to Object.prototype.
 * 
 * Import this module for the side effect of extending all objects with
 * the assignFromAsync method, enabling awaitable handler execution:
 * 
 * @example
 * import 'assign-gingerly/assignFromAsync-extension.js';
 * 
 * await oElement.assignFromAsync({
 *     '?.querySelector?..mainView =>': {
 *         do: 'builtIns.lazyLoad',
 *         get: { if: '?.isVisible', instantiate: 'globalThis://myTemplate' }
 *     }
 * }, { from: vm, withMethods: ['querySelector'], protocols: { globalThis: k => globalThis[k] } });
 */

import { assignFromAsync } from './assignFromAsync.js';

Object.defineProperty(Object.prototype, 'assignFromAsync', {
  value: async function (pattern, options) {
    await assignFromAsync(this, pattern, options);
    return this;
  },
  writable: true,
  enumerable: false,
  configurable: true,
});
