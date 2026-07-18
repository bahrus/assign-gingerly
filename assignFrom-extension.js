/**
 * assignFrom-extension.js — Adds assignFrom to Object.prototype.
 * 
 * Import this module for the side effect of extending all objects with
 * the assignFrom method, enabling fluent method chaining:
 * 
 * @example
 * import 'assign-gingerly/assignFrom-extension.js';
 * 
 * oElement
 *     .assignFrom({ '?.textContent': '?.greeting' }, { from: vm1 })
 *     .assignFrom({ '?.style Y=': { color: '?.themeColor' } }, { from: vm2 });
 */

import { assignFrom } from './assignFrom.js';

Object.defineProperty(Object.prototype, 'assignFrom', {
  value: function (pattern, options) {
    assignFrom(this, pattern, options);
    return this;
  },
  writable: true,
  enumerable: false,
  configurable: true,
});
