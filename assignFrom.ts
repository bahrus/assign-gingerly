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
import { resolveValues, ResolveValuesOptions } from './resolveValues.js';
import assignGingerly, { IAssignGingerlyOptions } from './assignGingerly.js';
import type { AssignPermissions } from './isAllowedImportPath.js';

export interface AssignFromOptions extends IAssignGingerlyOptions, ResolveValuesOptions {
  /** Source object to resolve RHS path strings against */
  from: any;

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
   * inferredAssignments: {
   *     byItemprop: ['user', 'name', 'email'],  // or true for all source keys
   *     beVigilant: true,  // watch for new matching elements (requires signal)
   * }
   */
  inferredAssignments?: {
    byItemprop?: string[] | true;
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

/**
 * Check if a key ends with the handler operator ' =>'.
 */
function isHandlerCommand(key: string): boolean {
    return key.endsWith(' =>');
}

/**
 * Supported substitution variables and their option keys.
 */
const SUBSTITUTION_VARS = [
  { placeholder: '${x}', optionKey: 'where_x_in' },
  { placeholder: '${y}', optionKey: 'where_y_in' },
  { placeholder: '${z}', optionKey: 'where_z_in' },
] as const;

/**
 * Recursively substitute a placeholder in all string values of an object.
 * Returns a new object (shallow clone at each level) with substitutions applied.
 */
function substituteInValue(value: any, placeholder: string, replacement: string): any {
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
function entryContainsPlaceholder(key: string, value: any, placeholder: string): boolean {
  if (key.includes(placeholder)) return true;
  return valueContainsPlaceholder(value, placeholder);
}

/**
 * Check if a value (string, object, or array) contains a placeholder.
 */
function valueContainsPlaceholder(value: any, placeholder: string): boolean {
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
 * Applies cartesian expansion: x values are expanded first, then y, then z.
 * Each variable multiplies the entries — result count = x.length × y.length × z.length.
 *
 * Returns the expanded pattern (or the original if no substitutions apply).
 */
function expandSubstitutions(
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
        // Expand this entry for each value in the variable array
        for (const replacement of values) {
          const newKey = key.includes(placeholder)
            ? key.replaceAll(placeholder, replacement)
            : key;
          const newValue = substituteInValue(value, placeholder, replacement);
          expanded.push([newKey, newValue]);
        }
      } else {
        // No placeholder in this entry — pass through
        expanded.push([key, value]);
      }
    }
    entries = expanded;
  }

  return mergeHandlerDuplicates(entries);
}

/**
 * Convert entries to an object, merging duplicate handler (` =>`) keys into arrays.
 * For normal (non-handler) keys, later entries overwrite earlier ones (standard object behavior).
 * For handler keys, duplicate entries are combined into an array (Multiple Handlers pattern).
 */
function mergeHandlerDuplicates(entries: [string, any][]): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of entries) {
    if (key.endsWith(' =>') && key in result) {
      // Duplicate handler key — merge into array
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

export async function assignFrom(
  target: any,
  pattern: Record<string, any>,
  options: AssignFromOptions,
  permissions?: AssignPermissions
): Promise<any> {
  // First: expand looped substitution variables (${x}, ${y}, ${z})
  const expandedPattern = expandSubstitutions(pattern, options);

  // Separate handler commands ( =>), #[x] keys, and normal keys
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
  if (idRefNormalKeys.length > 0 && options.withIds) {
    const { resolveIdVariable, parseIdRef } = await import('./resolveIdRef.js');
    for (const key of idRefNormalKeys) {
      const parsed = parseIdRef(key);
      if (!parsed) continue;

      const el = resolveIdVariable(parsed.varName, target, options.withIds);
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

  // Process handler commands ( =>) — dynamically imported only when needed
  if (handlerKeys.length > 0) {
    const { processHandlerCommands } = await import('./processHandlerCommands.js');
    await processHandlerCommands(target, handlerKeys, expandedPattern, options, permissions);
  }

  // Process #[x] handler keys — resolve element, then pass to handler processing
  if (idRefHandlerKeys.length > 0 && options.withIds) {
    const { resolveIdVariable, parseIdRef } = await import('./resolveIdRef.js');
    const { processHandlerCommands } = await import('./processHandlerCommands.js');

    for (const key of idRefHandlerKeys) {
      const parsed = parseIdRef(key);
      if (!parsed) continue;

      const el = resolveIdVariable(parsed.varName, target, options.withIds);
      if (!el) continue;

      // Build a synthetic key for processHandlerCommands:
      // The resolved element becomes the target, remaining path is the LHS
      const syntheticKey = parsed.remainingPath
        ? `${parsed.remainingPath} =>`
        : ' =>';

      const syntheticPattern: Record<string, any> = {
        [syntheticKey]: expandedPattern[key]
      };

      await processHandlerCommands(el, [syntheticKey], syntheticPattern, options, permissions);
    }
  }

  // Process inferred assignments — dynamically imported only when option is present
  if (options.inferredAssignments) {
    const { processInferredAssignments } = await import('./inferredAssignments.js');
    await processInferredAssignments(target, options.from, options.inferredAssignments);

    // Set up MutationObserver for new matching elements if beVigilant
    if (options.inferredAssignments.beVigilant) {
      if (!options.signal) {
        throw new Error('assignFrom: inferredAssignments.beVigilant requires options.signal (AbortSignal) for cleanup');
      }
      const { setupVigilantObserver } = await import('./beVigilant.js');
      setupVigilantObserver(target, options.from, options.inferredAssignments, options.signal);
    }
  }

  // Process bulk enhancements — dynamically imported only when option is present
  if (options.enhance && options.enhance.length > 0) {
    const { enhanceAll } = await import('./enhanceAll.js');
    await enhanceAll(target, options.enhance, permissions);
  }

  return target;
}

/**
 * Recursively walk an object and handle "..." spread keys.
 * When a "..." key is found, its value (which should be an object after protocol resolution)
 * is spread into the parent, replacing the "..." entry.
 */
function handleSpreads(obj: Record<string, any>): Record<string, any> {
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
