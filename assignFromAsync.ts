/**
 * Resolve RHS path strings against a source object, then assign the
 * resolved values into a target using assignGingerly.
 * 
 * Combines resolveValues + assignGingerly into a single call.
 * Inherits all assignGingerly options (withMethods, aka, signal, etc.).
 * 
 * @param target - Object to merge resolved values into
 * @param pattern - Object whose RHS values may contain `?.` path strings
 * @param options - Options including `from` (source object) and any assignGingerly options
 * @returns The target object after merging
 * 
 * @example
 * const source = { theme: { color: 'red' }, label: 'Hello' };
 * const target = { color: 'blue', text: '' };
 * assignFrom(target, {
 *   color: '?.theme?.color',
 *   text: '?.label'
 * }, { from: source });
 * // target is now { color: 'red', text: 'Hello' }
 */
import { resolveValues } from './resolveValues.js';
import assignGingerly, { IAssignGingerlyOptions } from './assignGingerly.js';
import type { AssignPermissions } from './isAllowedImportPath.js';
import {
  expandSubstitutions, categorizeKeys, handleSpreads, isHandlerCommand
} from './assignFrom.js';

export interface AssignFromOptions extends IAssignGingerlyOptions {
  /** Source object to resolve RHS path strings against */
  from: any;

  /** Protocol handlers (sync or async) */
  protocols?: Record<string, (key: string) => any | Promise<any>>;

  /** Loop variable bindings — expand pattern entries containing ${x} */
  where_x_in?: string[];
  /** Loop variable bindings — expand pattern entries containing ${y} */
  where_y_in?: string[];
  /** Loop variable bindings — expand pattern entries containing ${z} */
  where_z_in?: string[];

  /**
   * Cached element references by variable name.
   * Used with `#[varName]` syntax in LHS keys for fast repeated element access.
   * 
   * - String value: existing element ID (uses getElementById)
   * - Object value: { qry: 'selector' } — finds element via querySelector on target, auto-assigns an ID
   * 
   * Elements are cached via WeakRef with getElementById fallback on cache miss.
   */
  withIds?: Record<string, string | { qry: string }>;

  /**
   * Positional element references for use with `#[varName]` syntax.
   * Resolves elements by child index path — no IDs assigned, no caching.
   * 
   * - Array value: child index path (e.g., [0, 1] = target.children[0].children[1])
   * - Object value: { path: [...], expect?: 'selector', fallback?: true }
   *   expect: validates via element.matches(), logs correction if wrong
   *   fallback: on mismatch, recovers via querySelector(expect)
   */
  at?: Record<string, number[] | { path: number[]; expect?: string; fallback?: boolean }>;

  /**
   * Handler implementations scoped to this call.
   * Key: the `do` name referenced in handler configs.
   * Value: a class constructor, or an import path to dynamically load one.
   * 
   * Import paths must be local (relative, absolute, or bare specifier — no cross-domain URLs).
   * The module's default export is checked first; otherwise the first exported class
   * with an `assign` method on its prototype is used.
   * 
   * Built-in handlers (builtIns.*) auto-load without needing to be listed here.
   * 
   * @example
   * handlers: {
   *     'my-list': MyListHandler,                    // class constructor
   *     'my-chart': './handlers/chart.js',           // dynamic import path
   *     'vendor-widget': 'some-package/handler.js',  // bare specifier (import map)
   * }
   */
  handlers?: Record<string, AssignFromHandlerConstructor | string>;

  /**
   * Inferred assignments — automatically distribute source values to matching
   * DOM elements based on structural conventions (itemprop, name, etc.).
   * 
   * Uses the inferencer submodule to determine the correct property for each
   * matched element (textContent, value, checked, dateTime, ish, etc.).
   * 
   * @example
   * infer: {
   *     byItemprop: ['user', 'name', 'email'],  // or true for all source keys
   *     beVigilant: true,  // watch for new matching elements (requires signal)
   * }
   */
  infer?: {
    byItemprop?: string[] | true;
    '|'?: string[] | true;
    byName?: string[] | true | { props: string[] | true; outside: string };
    '@'?: string[] | true | { props: string[] | true; outside: string };
    /** Watch for new matching elements via MutationObserver. Requires options.signal for cleanup. */
    beVigilant?: boolean;
  };

  /**
   * Bulk enhancement application via EMC JSON configs.
   * Finds matching elements and spawns enhancements on them.
   * 
   * Each entry specifies an EMC JSON path and optionally overrides the matching selector.
   * Enhancements are auto-registered if not already present in the enhancement registry.
   * 
   * No scope perimeter is applied — use mount-observer for reactive/scoped enhancement.
   * 
   * @example
   * enhance: [
   *     { emc: 'be-bound/emc.json', matching: '[name]' },
   *     { emc: 'be-observant/emc.json', matching: '[itemprop]' },
   * ]
   */
  enhance?: Array<{ emc: string; matching?: string; parse?: boolean }>;
}

/**
 * Interface for assignFrom handler classes.
 * Handlers are invoked when a LHS key ends with ' =>'.
 */
export interface AssignFromHandler {
    assign(lhsTarget: any, resolvedParams: Record<string, any>, options: AssignFromOptions): Promise<void> | void;
}

export interface AssignFromHandlerConstructor {
    new (config: any): AssignFromHandler;
}

// Module cache for processHandlerCommands — avoids await on dynamic import after first call
let _processHandlerCommands: any;

export async function assignFromAsync(
  target: any,
  pattern: Record<string, any>,
  options: AssignFromOptions,
  permissions?: AssignPermissions
): Promise<any> {
  // First: expand looped substitution variables (${x}, ${y}, ${z})
  const expandedPattern = expandSubstitutions(pattern, options);

  // Categorize keys
  const { handlerKeys, normalPattern, idRefNormalKeys, idRefHandlerKeys } = categorizeKeys(expandedPattern);

  // Process normal keys via resolveValues + assignGingerly
  if (Object.keys(normalPattern).length > 0) {
    const resolved = await resolveValues(normalPattern, options.from, {
      withMethods: options.withMethods,
      aka: options.aka,
      protocols: options.protocols
    });

    // Recursively handle "..." spread keys at all nesting levels
    handleSpreads(resolved);

    assignGingerly(target, resolved, options);
  }

  // Process #[x] normal keys — resolve element, then apply remaining path + value
  if (idRefNormalKeys.length > 0 && (options.withIds || options.at)) {
    const ids = { ...options.withIds, ...options.at };
    const { resolveIdVariable, parseIdRef } = await import('./resolveIdRef.js');
    for (const key of idRefNormalKeys) {
      const parsed = parseIdRef(key);
      if (!parsed) continue;

      const el = resolveIdVariable(parsed.varName, target, ids);
      if (!el) continue;

      const value = expandedPattern[key];
      if (parsed.remainingPath) {
        // Resolve the RHS value
        const resolvedValue = await resolveValues(
          { __v: value }, options.from,
          { withMethods: options.withMethods, aka: options.aka, protocols: options.protocols }
        );
        // Apply remaining path on the resolved element
        assignGingerly(el, { [parsed.remainingPath]: resolvedValue.__v }, options);
      } else {
        // No remaining path — resolve and assign directly to the element
        const resolvedValue = await resolveValues(
          typeof value === 'object' && value !== null ? value : { __v: value },
          options.from,
          { withMethods: options.withMethods, aka: options.aka, protocols: options.protocols }
        );
        if ('__v' in resolvedValue) {
          // Single value — can't assign to element root without a path
        } else {
          assignGingerly(el, resolvedValue, options);
        }
      }
    }
  }
  // Process handler commands ( =>) — cached after first load to avoid await overhead
  if (handlerKeys.length > 0) {
    
    _processHandlerCommands ??= (await import('./processHandlerCommands.js')).processHandlerCommands;
    await _processHandlerCommands(target, handlerKeys, expandedPattern, options, permissions);
  }
  // Process #[x] handler keys — resolve element, then pass to handler processing
  if (idRefHandlerKeys.length > 0 && (options.withIds || options.at)) {
    const ids = { ...options.withIds, ...options.at };
    const { resolveIdVariable, parseIdRef } = await import('./resolveIdRef.js');
    _processHandlerCommands ??= (await import('./processHandlerCommands.js')).processHandlerCommands;

    for (const key of idRefHandlerKeys) {
      const parsed = parseIdRef(key);
      if (!parsed) continue;

      const el = resolveIdVariable(parsed.varName, target, ids);
      if (!el) continue;

      // Build a synthetic key for processHandlerCommands:
      // The resolved element becomes the target, remaining path is the LHS
      const syntheticKey = parsed.remainingPath
        ? `${parsed.remainingPath} =>`
        : ' =>';

      const syntheticPattern: Record<string, any> = {
        [syntheticKey]: expandedPattern[key]
      };

      await _processHandlerCommands(el, [syntheticKey], syntheticPattern, options, permissions);
    }
  }

  // Process inferred assignments — dynamically imported only when option is present
  if (options.infer) {
    const { processInferredAssignments } = await import('./inferredAssignments.js');
    await processInferredAssignments(target, options.from, options.infer);

    // Set up MutationObserver for new matching elements if beVigilant
    if (options.infer.beVigilant) {
      if (!options.signal) {
        throw new Error('assignFrom: infer.beVigilant requires options.signal (AbortSignal) for cleanup');
      }
      const { setupVigilantObserver } = await import('./beVigilant.js');
      setupVigilantObserver(target, options.from, options.infer, options.signal);
    }
  }

  // Process bulk enhancements — dynamically imported only when option is present
  if (options.enhance && options.enhance.length > 0) {
    const { enhanceAll } = await import('./enhanceAll.js');
    await enhanceAll(target, options.enhance, permissions);
  }

  return target;
}
