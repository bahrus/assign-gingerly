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
import {IAssignGingerlyOptions} from './types/assign-gingerly/types.js';
import assignGingerly from './assignGingerly.js';
import type { AssignPermissions } from './types/assign-gingerly/types.js';
import type { AssignFromHandler, AssignFromHandlerConstructor } from './types/assign-gingerly/types.js';
import {
  expandSubstitutions, categorizeKeys, handleSpreads, isHandlerCommand
} from './assignFrom.js';

export interface AssignFromOptions extends IAssignGingerlyOptions {
  from: any;
  protocols?: Record<string, (key: string) => any | Promise<any>>;
  where_x_in?: string[];
  where_y_in?: string[];
  where_z_in?: string[];
  pin?: Record<string, string | { qry: string } | { path: number[]; expect?: string; fallback?: boolean }>;
  at?: Record<string, number[] | { path: number[]; expect?: string; fallback?: boolean }>;
  handlers?: Record<string, AssignFromHandlerConstructor | string>;
  infer?: {
    byItemprop?: string[] | true;
    '|'?: string[] | true;
    byName?: string[] | true | { props: string[] | true; outside: string };
    '@'?: string[] | true | { props: string[] | true; outside: string };
    beVigilant?: boolean;
  };
  enhance?: Array<{ emc: string; matching?: string; parse?: boolean }>;
}

export type { AssignFromHandler, AssignFromHandlerConstructor };

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
      akaMethods: options.akaMethods,
      protocols: options.protocols,
      root: target
    });

    // Recursively handle "..." spread keys at all nesting levels
    handleSpreads(resolved);

    assignGingerly(target, resolved, options, permissions);
  }

  // Process #[x] normal keys — resolve element, then apply remaining path + value
  if (idRefNormalKeys.length > 0 && (options.pin || options.at)) {
    const ids = { ...options.pin, ...options.at };
    const { resolveIdVariable, parseIdRef } = await import('./resolveIdRef.js');
    const { withMethods, aka, akaMethods, protocols, from } = options;
    for (const key of idRefNormalKeys) {
      const parsed = parseIdRef(key);
      if (!parsed) continue;

      const el = resolveIdVariable(parsed.varName, target, ids);
      if (!el) continue;

      const value = expandedPattern[key];
      if (parsed.remainingPath) {
        // Resolve the RHS value
        const resolvedValue = await resolveValues(
          { __v: value }, from,
          { withMethods, aka, akaMethods, protocols, root: el }
        );
        // Apply remaining path on the resolved element
        assignGingerly(el, { [parsed.remainingPath]: resolvedValue.__v }, options, permissions);
      } else {
        // No remaining path — resolve and assign directly to the element
        const resolvedValue = await resolveValues(
          typeof value === 'object' && value !== null ? value : { __v: value },
          from,
          { withMethods, aka, akaMethods, protocols, root: el }
        );
        if ('__v' in resolvedValue) {
          // Single value — can't assign to element root without a path
        } else {
          assignGingerly(el, resolvedValue, options, permissions);
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
  if (idRefHandlerKeys.length > 0 && (options.pin || options.at)) {
    const ids = { ...options.pin, ...options.at };
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
