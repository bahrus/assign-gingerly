/**
 * assignFrom-extension.ts — Adds assignFrom to Object.prototype.
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
import type { AssignFromOptions } from './assignFromAsync.js';

declare global {
  interface Object {
    /**
     * Resolve RHS path strings from a source object and assign into this object.
     * Synchronous — handlers are fire-and-forget.
     * 
     * @param pattern - Object with LHS paths as keys and RHS path strings (or literals) as values
     * @param options - Configuration including `from` (source object), protocols, withMethods, etc.
     * @returns This object after assignment
     * 
     * @example
     * oElement.assignFrom({
     *     '?.textContent': '?.greeting',
     *     '?.style Y=': { width: '?.width' }
     * }, { from: viewModel });
     */
    assignFrom(
      pattern: Record<string, any>,
      options: AssignFromOptions
    ): this;
  }
}

Object.defineProperty(Object.prototype, 'assignFrom', {
  value: function <T extends object>(
    this: T,
    pattern: Record<string, any>,
    options: AssignFromOptions
  ): T {
    assignFrom(this, pattern, options);
    return this;
  },
  writable: true,
  enumerable: false,
  configurable: true,
});
