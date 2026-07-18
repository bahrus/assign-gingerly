/**
 * assignFromAsync-extension.ts — Adds assignFromAsync to Object.prototype.
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
import type { AssignFromOptions } from './assignFromAsync.js';

declare global {
  interface Object {
    /**
     * Resolve RHS path strings from a source object and assign into this object.
     * Async — awaits handler execution and supports async protocol handlers.
     * 
     * @param pattern - Object with LHS paths as keys and RHS path strings (or literals) as values
     * @param options - Configuration including `from` (source object), protocols, withMethods, etc.
     * @returns Promise resolving to this object after assignment
     * 
     * @example
     * await oElement.assignFromAsync({
     *     '?.querySelector?..outlet =>': {
     *         do: 'builtIns.lazyLoad',
     *         get: { if: '?.showContent', instantiate: 'globalThis://myTemplate' }
     *     }
     * }, { from: viewModel, withMethods: ['querySelector'], protocols: { globalThis: k => globalThis[k] } });
     */
    assignFromAsync(
      pattern: Record<string, any>,
      options: AssignFromOptions
    ): Promise<this>;
  }
}

Object.defineProperty(Object.prototype, 'assignFromAsync', {
  value: async function <T extends object>(
    this: T,
    pattern: Record<string, any>,
    options: AssignFromOptions
  ): Promise<T> {
    await assignFromAsync(this, pattern, options);
    return this;
  },
  writable: true,
  enumerable: false,
  configurable: true,
});
