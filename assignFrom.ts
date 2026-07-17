/**
 * assignFrom.ts — Synchronous assign-from-source function.
 * 
 * Resolves RHS path strings synchronously via getValues, then assigns into the target.
 * Supports looped substitution, #[x] refs, inferredAssignments, and handleSpreads — all sync.
 * 
 * For async protocol handlers or awaitable handler execution, use assignFromAsync.
 * 
 * Handler commands (` =>`) are fire-and-forget (kicked off asynchronously, not awaited).
 */

import { getValues, getValue } from './getValues.js';
import assignGingerly, { IAssignGingerlyOptions } from './assignGingerly.js';
import { resolveIdVariable, parseIdRef } from './resolveIdRef.js';
import { processInferredAssignments } from './inferredAssignments.js';
import type { AssignPermissions } from './isAllowedImportPath.js';

// Re-export types and interfaces for consumers
export type { AssignFromOptions, AssignFromHandler, AssignFromHandlerConstructor } from './assignFromAsync.js';
import type { AssignFromOptions } from './assignFromAsync.js';

/**
 * Supported substitution variables and their option keys.
 */
export const SUBSTITUTION_VARS = [
  { placeholder: '${x}', optionKey: 'where_x_in' },
  { placeholder: '${y}', optionKey: 'where_y_in' },
  { placeholder: '${z}', optionKey: 'where_z_in' },
] as const;

/**
 * Check if a key ends with the handler operator ' =>'.
 */
export function isHandlerCommand(key: string): boolean {
    return key.endsWith(' =>');
}

/**
 * Recursively substitute a placeholder in all string values of an object.
 */
export function substituteInValue(value: any, placeholder: string, replacement: string): any {
  if (typeof value === 'string') {
    return value.includes(placeholder) ? value.replaceAll(placeholder, replacement) : value;
  }
  if (Array.isArray(value)) {
    return value.map(item => substituteInValue(item, placeholder, replacement));
  }
  if (value && typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto === Object.prototype || proto === null) {
      const result: Record<string, any> = {};
      for (const [k, v] of Object.entries(value)) {
        result[k] = substituteInValue(v, placeholder, replacement);
      }
      return result;
    }
  }
  return value;
}

/**
 * Check if a pattern entry (key + value) contains a given placeholder.
 */
export function entryContainsPlaceholder(key: string, value: any, placeholder: string): boolean {
  if (key.includes(placeholder)) return true;
  return valueContainsPlaceholder(value, placeholder);
}

/**
 * Check if a value (string, object, or array) contains a placeholder.
 */
export function valueContainsPlaceholder(value: any, placeholder: string): boolean {
  if (typeof value === 'string') return value.includes(placeholder);
  if (Array.isArray(value)) return value.some(item => valueContainsPlaceholder(item, placeholder));
  if (value && typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto === Object.prototype || proto === null) {
      return Object.values(value).some(v => valueContainsPlaceholder(v, placeholder));
    }
  }
  return false;
}

/**
 * Expand looped substitution variables in a pattern.
 */
export function expandSubstitutions(
  pattern: Record<string, any>,
  options: AssignFromOptions
): Record<string, any> {
  let entries = Object.entries(pattern);

  for (const { placeholder, optionKey } of SUBSTITUTION_VARS) {
    const values = options[optionKey as keyof AssignFromOptions] as string[] | undefined;
    if (!values || values.length === 0) continue;

    const expanded: [string, any][] = [];
    for (const [key, value] of entries) {
      if (entryContainsPlaceholder(key, value, placeholder)) {
        for (const replacement of values) {
          const newKey = key.includes(placeholder)
            ? key.replaceAll(placeholder, replacement)
            : key;
          const newValue = substituteInValue(value, placeholder, replacement);
          expanded.push([newKey, newValue]);
        }
      } else {
        expanded.push([key, value]);
      }
    }
    entries = expanded;
  }

  return mergeHandlerDuplicates(entries);
}

/**
 * Convert entries to an object, merging duplicate handler (` =>`) keys into arrays.
 */
export function mergeHandlerDuplicates(entries: [string, any][]): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of entries) {
    if (key.endsWith(' =>') && key in result) {
      const existing = result[key];
      if (Array.isArray(existing)) {
        existing.push(value);
      } else {
        result[key] = [existing, value];
      }
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Recursively walk an object and handle "..." spread keys.
 */
export function handleSpreads(obj: Record<string, any>): Record<string, any> {
  for (const [key, value] of Object.entries(obj)) {
    if (key !== '...' && typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const proto = Object.getPrototypeOf(value);
      if (proto === Object.prototype || proto === null) {
        obj[key] = handleSpreads(value);
      }
    }
  }
  if ('...' in obj) {
    const spreadValue = obj['...'];
    delete obj['...'];
    if (spreadValue && typeof spreadValue === 'object') {
      Object.assign(obj, spreadValue);
    }
  }
  return obj;
}

/**
 * Categorize pattern keys into handler keys, #[x] keys, and normal keys.
 */
export function categorizeKeys(expandedPattern: Record<string, any>) {
  const handlerKeys: string[] = [];
  const normalPattern: Record<string, any> = {};
  const idRefNormalKeys: string[] = [];
  const idRefHandlerKeys: string[] = [];

  for (const key of Object.keys(expandedPattern)) {
    if (isHandlerCommand(key)) {
      if (key.startsWith('#[')) {
        idRefHandlerKeys.push(key);
      } else {
        handlerKeys.push(key);
      }
    } else if (key.startsWith('#[')) {
      idRefNormalKeys.push(key);
    } else {
      normalPattern[key] = expandedPattern[key];
    }
  }

  return { handlerKeys, normalPattern, idRefNormalKeys, idRefHandlerKeys };
}

/**
 * Process #[x] normal keys synchronously.
 */
function processIdRefNormalKeys(
  idRefNormalKeys: string[],
  expandedPattern: Record<string, any>,
  target: any,
  options: AssignFromOptions
): void {
  if (!options.withIds) return;

  for (const key of idRefNormalKeys) {
    const parsed = parseIdRef(key);
    if (!parsed) continue;

    const el = resolveIdVariable(parsed.varName, target, options.withIds);
    if (!el) continue;

    const value = expandedPattern[key];
    if (parsed.remainingPath) {
      const resolvedValue = getValues(
        { __v: value }, options.from,
        { withMethods: options.withMethods, aka: options.aka, protocols: options.protocols }
      );
      assignGingerly(el, { [parsed.remainingPath]: resolvedValue.__v }, options);
    } else {
      const resolvedValue = getValues(
        typeof value === 'object' && value !== null ? value : { __v: value },
        options.from,
        { withMethods: options.withMethods, aka: options.aka, protocols: options.protocols }
      );
      if (!('__v' in resolvedValue)) {
        assignGingerly(el, resolvedValue, options);
      }
    }
  }
}

/**
 * Synchronous assignFrom — resolves values, assigns to target, all without awaiting.
 * 
 * Handler commands (` =>`), beVigilant, and enhance are fire-and-forget (async, non-blocking).
 * For awaitable handler execution, use assignFromAsync.
 * 
 * @param target - Object to merge resolved values into
 * @param pattern - Object whose RHS values may contain `?.` path strings
 * @param options - Options including `from` (source object)
 * @param permissions - Optional security permissions
 * @returns The target object after merging
 */
export function assignFrom(
  target: any,
  pattern: Record<string, any>,
  options: AssignFromOptions,
  permissions?: AssignPermissions
): any {
  // Expand looped substitution variables
  const expandedPattern = expandSubstitutions(pattern, options);

  // Categorize keys
  const { handlerKeys, normalPattern, idRefNormalKeys, idRefHandlerKeys } = categorizeKeys(expandedPattern);

  // Process normal keys via getValues (sync) + assignGingerly
  if (Object.keys(normalPattern).length > 0) {
    const resolved = getValues(normalPattern, options.from, {
      withMethods: options.withMethods,
      aka: options.aka,
      protocols: options.protocols
    });

    handleSpreads(resolved);
    assignGingerly(target, resolved, options);
  }

  // Process #[x] normal keys (sync)
  if (idRefNormalKeys.length > 0) {
    processIdRefNormalKeys(idRefNormalKeys, expandedPattern, target, options);
  }

  // Process handler commands — fire-and-forget (async)
  if (handlerKeys.length > 0) {
    import('./processHandlerCommands.js').then(({ processHandlerCommands }) => {
      processHandlerCommands(target, handlerKeys, expandedPattern, options, permissions);
    });
  }

  // Process #[x] handler keys — fire-and-forget (async)
  if (idRefHandlerKeys.length > 0 && options.withIds) {
    import('./processHandlerCommands.js').then(({ processHandlerCommands }) => {
      for (const key of idRefHandlerKeys) {
        const parsed = parseIdRef(key);
        if (!parsed) continue;
        const el = resolveIdVariable(parsed.varName, target, options.withIds!);
        if (!el) continue;
        const syntheticKey = parsed.remainingPath ? `${parsed.remainingPath} =>` : ' =>';
        const syntheticPattern = { [syntheticKey]: expandedPattern[key] };
        processHandlerCommands(el, [syntheticKey], syntheticPattern, options, permissions);
      }
    });
  }

  // Process inferred assignments (sync)
  if (options.inferredAssignments) {
    processInferredAssignments(target, options.from, options.inferredAssignments);

    // beVigilant — fire-and-forget (async)
    if (options.inferredAssignments.beVigilant) {
      if (!options.signal) {
        throw new Error('assignFrom: inferredAssignments.beVigilant requires options.signal (AbortSignal) for cleanup');
      }
      import('./beVigilant.js').then(({ setupVigilantObserver }) => {
        setupVigilantObserver(target, options.from, options.inferredAssignments!, options.signal!);
      });
    }
  }

  // Process bulk enhancements — fire-and-forget (async)
  if (options.enhance && options.enhance.length > 0) {
    import('./enhanceAll.js').then(({ enhanceAll }) => {
      enhanceAll(target, options.enhance!, permissions);
    });
  }

  return target;
}

export default assignFrom;
