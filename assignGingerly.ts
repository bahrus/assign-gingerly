

import { EnhancementConfig } from "./types/assign-gingerly/types";
import type { AssignFromOptions, FeatureConfigsMap, IAssignGingerlyOptions } from "./types/assign-gingerly/types";
import type { AssignPermissions } from "./isAllowedImportPath.js";
import { normalizeAliasOptions } from './getValues.js';

/**
 * Constructor signature for ItemScope Manager classes
 */
export type ItemscopeManager<T = any> = {
  new (element: HTMLElement, initVals?: Partial<T>): T;
}

/**
 * Configuration for ItemScope Manager registration
 */
export interface ItemscopeManagerConfig<T = any> {
  /**
   * Manager class constructor
   */
  manager: ItemscopeManager<T>;
  
  /**
   * Optional lifecycle method keys
   * - dispose: Method name to call when manager is disposed
   * - resolved: Property/event name indicating manager is ready
   */
  lifecycleKeys?: {
    dispose?: string | symbol;
    resolved?: string | symbol;
  };
}


/**
 * GUID for global instance map storage to ensure uniqueness across package versions
 */
export const INSTANCE_MAP_GUID = 'HDBhTPLuIUyooMxK88m68Q';

/**
 * Get or create the global instance map
 * Stored in globalThis to ensure uniqueness across different package versions
 * Maps objects to a Map of registry items to their spawned instances
 */
export function getInstanceMap(): WeakMap<object, Map<EnhancementConfig, any>> {
  if (!(globalThis as any)[INSTANCE_MAP_GUID]) {
    (globalThis as any)[INSTANCE_MAP_GUID] = new WeakMap<object, Map<EnhancementConfig, any>>();
  }
  return (globalThis as any)[INSTANCE_MAP_GUID];
}

/**
 * Base registry class for managing enhancement configurations
 */
/**
 * Event dispatched when enhancement configs are registered
 */
export class EnhancementRegisteredEvent extends Event {
  static eventName = 'register';
  
  constructor(
    public config: EnhancementConfig | EnhancementConfig[]
  ) {
    super(EnhancementRegisteredEvent.eventName);
  }
}

/**
 * Registry for enhancement configurations
 * Extends EventTarget to dispatch events when configs are registered
 */
export class EnhancementRegistry extends EventTarget {
  #items: Set<EnhancementConfig> = new Set();

  push(items: EnhancementConfig | EnhancementConfig[]): void {
    if (Array.isArray(items)) {
      items.forEach(item => this.#items.add(item));
    } else {
      this.#items.add(items);
    }
    
    // Dispatch event after adding items
    this.dispatchEvent(new EnhancementRegisteredEvent(items));

    // Process features if present (fire-and-forget, uses shared featuresRegistry)
    const itemsArr = Array.isArray(items) ? items : [items];
    for (const item of itemsArr) {
      if (item.features) {
        this.#assignFeatures(item.spawn, item.features);
      }
    }
  }

  async #assignFeatures(spawn: any, features: FeatureConfigsMap): Promise<void> {
    const { assignFeatures } = await import('./assignFeatures.js');
    const featuresRegistry = (this as any)._featuresRegistry
      ?? (typeof customElements !== 'undefined' ? (customElements as any).featuresRegistry : undefined);
    if (featuresRegistry) {
      assignFeatures(spawn, features, featuresRegistry);
    }
  }

  getItems(): EnhancementConfig[] {
    return Array.from(this.#items);
  }

  findBySymbol(symbol: symbol | string): EnhancementConfig | undefined {
    for (const item of this.#items) {
      const symlinks = item.symlinks;
      if (!symlinks) continue;

      const hasSymbol = Object.keys(symlinks).some(key => {
        if (typeof key === 'symbol' || (typeof symlinks[key as any] === 'symbol')) {
          return key === symbol || symlinks[key as any] === symbol;
        }
        return false;
      }) || Object.getOwnPropertySymbols(symlinks).some(sym => sym === symbol);

      if (hasSymbol) return item;
    }
    return undefined;
  }

  findByEnhKey(enhKey: string | symbol): EnhancementConfig | undefined {
    for (const item of this.#items) {
      if (item.enhKey === enhKey) return item;
    }
    return undefined;
  }
}

/**
 * Registry for ItemScope Manager configurations
 * Extends EventTarget to support lazy registration via events
 */
export class ItemscopeRegistry extends EventTarget {
  #configs: Map<string, ItemscopeManagerConfig> = new Map();
  #pendingSetups: Map<string, Promise<void>[]> = new Map();

  /**
   * Define a new manager configuration
   * @param name - Manager name (matches itemscope attribute value)
   * @param config - Manager configuration object
   * @throws Error if name is already registered
   */
  define(name: string, config: ItemscopeManagerConfig): void {
    if (this.#configs.has(name)) {
      throw new Error('Already registered');
    }
    this.#configs.set(name, config);
    this.dispatchEvent(new Event(name));

    // Process features if present (fire-and-forget, uses shared featuresRegistry)
    if ((config as any).features) {
      this.#assignFeatures(config.manager, (config as any).features);
    }
  }

  async #assignFeatures(manager: any, features: FeatureConfigsMap): Promise<void> {
    const { assignFeatures } = await import('./assignFeatures.js');
    const featuresRegistry = (this as any)._featuresRegistry
      ?? (typeof customElements !== 'undefined' ? (customElements as any).featuresRegistry : undefined);
    if (featuresRegistry) {
      assignFeatures(manager, features, featuresRegistry);
    }
  }

  /**
   * Get a manager configuration by name
   * @param name - Manager name
   * @returns Manager configuration or undefined
   */
  get(name: string): ItemscopeManagerConfig | undefined {
    return this.#configs.get(name);
  }

  /**
   * Wait for a manager to be defined and all pending setups to complete
   * @param name - Manager name to wait for
   * @returns Promise that resolves when manager is defined and all setups are complete
   */
  async whenDefined(name: string): Promise<void> {
    // If not yet defined, wait for definition
    if (!this.#configs.has(name)) {
      await new Promise<void>((resolve) => {
        this.addEventListener(name, () => resolve(), { once: true });
      });
    }

    // Wait for all pending setups for this manager
    const pending = this.#pendingSetups.get(name);
    if (pending && pending.length > 0) {
      await Promise.all(pending);
    }
  }

  /**
   * Internal method to track a pending setup
   * @param name - Manager name
   * @param promise - Promise representing the setup operation
   */
  _trackSetup(name: string, promise: Promise<void>): void {
    if (!this.#pendingSetups.has(name)) {
      this.#pendingSetups.set(name, []);
    }
    this.#pendingSetups.get(name)!.push(promise);

    // Clean up after completion
    promise.finally(() => {
      const pending = this.#pendingSetups.get(name);
      if (pending) {
        const index = pending.indexOf(promise);
        if (index > -1) {
          pending.splice(index, 1);
        }
      }
    });
  }
}


/**
 * Helper function to check if a string key represents a Symbol.for expression
 */
function isSymbolForKey(key: string): boolean {
  return key.startsWith('[Symbol.for(') && key.endsWith(')]');
}

/**
 * Helper function to extract the symbol key from a Symbol.for string
 */
function parseSymbolForKey(key: string): symbol | null {
  const match = key.match(/^\[Symbol\.for\(['"](.+)['"]\)\]$/);
  if (match && match[1]) {
    return Symbol.for(match[1]);
  }
  return null;
}

/**
 * Helper function to check if a key represents an += command
 */
function isIncCommand(key: string): boolean {
  return key.endsWith(' +=');
}

/**
 * Helper function to parse an += command and extract the path
 */
function parseIncCommand(key: string): string | null {
  if (!isIncCommand(key)) {
    return null;
  }
  return key.substring(0, key.length - 3); // Remove ' +=' suffix
}

/**
 * Helper function to check if a key represents a =! command
 */
function isToggleCommand(key: string): boolean {
  return key.endsWith(' =!');
}

/**
 * Helper function to parse a =! command and extract the path
 */
function parseToggleCommand(key: string): string | null {
  if (!isToggleCommand(key)) {
    return null;
  }
  return key.substring(0, key.length - 3); // Remove ' =!' suffix
}

/**
 * Helper function to check if a key represents a -= delete command
 */
function isDeleteCommand(key: string): boolean {
  return key.endsWith(' -=');
}

/**
 * Helper function to parse a -= delete command and extract the path
 */
function parseDeleteCommand(key: string): string | null {
  if (!isDeleteCommand(key)) {
    return null;
  }
  return key.substring(0, key.length - 3); // Remove ' -=' suffix
}

/**
 * Helper function to check if a key represents a Y= merge command
 */
function isMergeCommand(key: string): boolean {
  return key.endsWith(' Y=');
}

/**
 * Helper function to parse a Y= merge command and extract the path
 */
function parseMergeCommand(key: string): string | null {
  if (!isMergeCommand(key)) {
    return null;
  }
  return key.substring(0, key.length - 3); // Remove ' Y=' suffix
}

/**
 * Helper function to parse a path string with ?. notation
 * Always splits on '?.' delimiter, preserving dots that are part of values
 * (e.g., CSS class selectors like '.username')
/**
 * Path cache for parsed path strings in assignGingerly.
 * Avoids re-splitting the same path on repeated calls.
 */
const agPathCache = new Map<string, string[]>();

/**
 * Paths must use ?. notation — plain dot notation is not supported.
 */
function parsePath(path: string): string[] {
  let parts = agPathCache.get(path);
  if (!parts) {
    parts = path.split('?.').filter(part => part.length > 0);
    agPathCache.set(path, parts);
  }
  return parts;
}

/**
 * Helper function to check if a path starts with ?. notation
 */
function isNestedPath(path: string): boolean {
  return path.startsWith('?.');
}

/**
 * Helper function to get or create a nested object
 */
function ensureNestedPath(obj: any, pathParts: string[]): any {
  let current = obj;
  for (const part of pathParts.slice(0, -1)) {
    if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
      current[part] = {};
    }
    current = current[part];
  }
  return current;
}

/**
 * Helper function to check if a property should be merged into rather than replaced.
 * A property is non-replaceable if:
 * - It's a data property with writable: false, OR
 * - It's an accessor property with a getter but no setter
 * 
 * Properties with both a getter and setter (e.g., element.style) are treated as
 * replaceable — the setter runs with whatever value is provided (garbage in, garbage out).
 * 
 * Exported for use by eachTime.ts
 */
export function isReadonlyProperty(obj: any, propName: string | symbol): boolean {
  let descriptor = Object.getOwnPropertyDescriptor(obj, propName);
  
  if (!descriptor) {
    // Check prototype chain
    let proto = Object.getPrototypeOf(obj);
    while (proto) {
      descriptor = Object.getOwnPropertyDescriptor(proto, propName);
      if (descriptor) break;
      proto = Object.getPrototypeOf(proto);
    }
  }
  
  if (!descriptor) return false;
  
  // If it's a data property, check writable flag
  if ('value' in descriptor) {
    return descriptor.writable === false;
  }
  
  // If it's an accessor property with a getter but no setter, it's readonly
  if ('get' in descriptor && descriptor.get !== undefined) {
    return descriptor.set === undefined;
  }
  
  return false;
}

/**
 * Checks if a class defines a static `assignTo` method and calls it.
 * This is the "bring your own assigner" protocol — classes can opt into
 * custom assignment behavior by defining `static assignTo`.
 * 
 * Only triggers for classes that explicitly define `assignTo` on themselves
 * (not inherited from Object or other base classes).
 * 
 * @returns true if assignTo was found and called, false otherwise
 */
function tryAssignTo(currentValue: any, value: any, parent: any, key: string | symbol): boolean {
  if (currentValue != null && typeof currentValue === 'object') {
    const { constructor } = currentValue;
    if (constructor && Object.hasOwn(constructor, 'assignTo') && typeof constructor.assignTo === 'function') {
      constructor.assignTo(currentValue, value, parent, key);
      return true;
    }
  }
  return false;
}

/**
 * Helper function to check if a value is a class instance (not a plain object)
 * Returns true for instances of classes, false for plain objects, arrays, and primitives
 * 
 * Exported for use by eachTime.ts
 */
export function isClassInstance(value: any): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return false;
  
  const proto = Object.getPrototypeOf(value);
  // Plain objects have Object.prototype or null as prototype
  return proto !== Object.prototype && proto !== null;
}

/**
 * Helper function to evaluate a nested path with method calls
 * Handles chained method calls where path segments can be methods
 * 
 * Exported for use by eachTime.ts
 */
export function evaluatePathWithMethods(
  target: any,
  pathParts: string[],
  value: any,
  withMethods: Set<string>
): { target: any; lastKey: string; isMethod: boolean } {
  let current = target;
  let i = 0;
  
  // Process all segments except the last one
  while (i < pathParts.length - 1) {
    const part = pathParts[i];
    const nextPart = pathParts[i + 1];
    
    if (withMethods.has(part)) {
      const method = current[part];
      if (typeof method === 'function') {
        // Check if next part is also a method
        if (withMethods.has(nextPart)) {
          // Both are methods - call first with no args
          current = method.call(current);
        } else {
          // Only current is method - call with next part as string arg
          current = method.call(current, nextPart);
          i++; // Skip next part since we consumed it as argument
        }
      } else {
        // Not a function - just access property (create if needed)
        if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
          current[part] = {};
        }
        current = current[part];
      }
    } else {
      // Not a method - normal property access (create if needed)
      if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
        current[part] = {};
      }
      current = current[part];
    }
    
    i++;
  }
  
  const lastKey = pathParts[pathParts.length - 1];
  return {
    target: current,
    lastKey,
    isMethod: withMethods.has(lastKey)
  };
}

/**
 * Check if a value is iterable (can be used with for...of or has forEach)
 */
function isIterable(value: any): boolean {
  if (value == null) return false;
  
  // Check for Symbol.iterator
  if (typeof value[Symbol.iterator] === 'function') return true;
  
  // Check if it's an Array
  if (Array.isArray(value)) return true;
  
  // Check if it's array-like (has length and numeric indices)
  // This covers NodeList, HTMLCollection, etc.
  if (typeof value.length === 'number' && value.length >= 0) {
    return true;
  }
  
  return false;
}

/**
 * Check if a segment is the forEach symbol (@each) or aliased to it
 */
function isForEachSymbol(segment: string, aliasMap: Map<string, string>): boolean {
  // Direct match
  if (segment === '@each') return true;
  
  // Check if this segment is aliased to '@each'
  const aliasTarget = aliasMap.get(segment);
  return aliasTarget === '@each';
}

/**
 * Check if a segment is the reactive forEach symbol (@eachTime) or aliased to it
 */
function isReactiveForEachSymbol(segment: string, aliasMap: Map<string, string>): boolean {
  // Direct match
  if (segment === '@eachTime') return true;
  
  // Check if this segment is aliased to '@eachTime'
  const aliasTarget = aliasMap.get(segment);
  return aliasTarget === '@eachTime';
}

/**
 * Apply a path to each item in an iterable
 */
function applyToEach(
  iterable: any,
  remainingPath: string[],
  value: any,
  withMethods: Set<string>,
  aliasMap: Map<string, string>,
  options?: IAssignGingerlyOptions
): void {
  // Convert to array for iteration
  const items = Array.isArray(iterable) ? iterable : Array.from(iterable);
  
  // Apply the remaining path to each item
  for (const item of items) {
    if (remainingPath.length === 0) {
      // No remaining path, can't do anything
      continue;
    }
    
    // Check if there's another @each in the remaining path
    const forEachIndex = remainingPath.findIndex(part => isForEachSymbol(part, aliasMap));
    
    if (forEachIndex !== -1) {
      // There's a nested @each
      // Evaluate path up to the @each
      const pathToForEach = remainingPath.slice(0, forEachIndex);
      const pathAfterForEach = remainingPath.slice(forEachIndex + 1);
      
      // Navigate to the nested iterable
      let current = item;
      for (const part of pathToForEach) {
        if (withMethods.has(part)) {
          const method = current[part];
          if (typeof method === 'function') {
            // For methods in the middle, we need to check the next part
            const nextIndex = pathToForEach.indexOf(part) + 1;
            const nextPart = pathToForEach[nextIndex];
            if (nextPart && withMethods.has(nextPart)) {
              current = method.call(current);
            } else if (nextPart) {
              current = method.call(current, nextPart);
              // Skip next part
              pathToForEach.splice(nextIndex, 1);
            } else {
              current = method.call(current);
            }
          } else {
            current = current[part];
          }
        } else {
          current = current[part];
        }
      }
      
      // Recursively apply to the nested iterable
      if (isIterable(current)) {
        applyToEach(current, pathAfterForEach, value, withMethods, aliasMap, options);
      }
    } else {
      // No nested @each, evaluate the remaining path normally
      const result = evaluatePathWithMethods(item, remainingPath, value, withMethods);
      
      if (result.isMethod) {
        // Last segment is a method - call it
        const method = result.target[result.lastKey];
        if (typeof method === 'function') {
          if (Array.isArray(value)) {
            method.apply(result.target, value);
          } else {
            method.call(result.target, value);
          }
        }
      } else {
        // Normal assignment
        const lastKey = result.lastKey;
        const parent = result.target;
        
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          if (lastKey in parent && isReadonlyProperty(parent, lastKey)) {
            const currentValue = parent[lastKey];
            if (typeof currentValue !== 'object' || currentValue === null) {
              throw new Error(`Cannot merge object into readonly primitive property '${String(lastKey)}'`);
            }
            assignGingerly(currentValue, value, options);
          } else {
            parent[lastKey] = value;
          }
        } else {
          parent[lastKey] = value;
        }
      }
    }
  }
}

/**
 * Apply alias substitutions to a key string.
 * Replaces complete tokens between `?.` delimiters with their aliased values.
 * 
 * @param key - The key string (e.g., '?.$?.my-element?.c?.+')
 * @param aliasMap - Map of alias -> target name
 * @returns The key with aliases substituted (e.g., '?.querySelector?.my-element?.classList?.add')
 */
function applyAliases(key: string, aliasMap: Map<string, string>): string {
  if (aliasMap.size === 0) return key;
  
  // Split by ?. to get tokens
  const parts = key.split('?.');
  
  // Apply aliases to each part
  const substituted = parts.map(part => {
    // Check if this exact part is an alias
    return aliasMap.get(part) ?? part;
  });
  
  // Rejoin with ?.
  return substituted.join('?.');
}

/**
 * Main assignGingerly function
 */
export function assignGingerly(
  target: any,
  source: Record<string | symbol, any>,
  options?: IAssignGingerlyOptions,
  permissions?: AssignPermissions
): any {
  if (!target || typeof target !== 'object') {
    return target;
  }

  const { aliasMap, withMethods: withMethodsSet } = normalizeAliasOptions(options);

  // Convert withAsyncMethods array to Set for O(1) lookup
  const withAsyncMethodsSet = options?.withAsyncMethods
    ? options.withAsyncMethods instanceof Set
      ? options.withAsyncMethods
      : new Set(options.withAsyncMethods)
    : undefined;

  const registry = options?.registry instanceof EnhancementRegistry
    ? options.registry
    : options?.registry
    ? new options.registry()
    : undefined;

  // Convert Symbol.for string keys to actual symbols and apply aliases
  const processedSource: Record<string | symbol, any> = {};
  for (const key of Object.keys(source)) {
    if (isSymbolForKey(key)) {
      const symbol = parseSymbolForKey(key);
      if (symbol) {
        processedSource[symbol] = source[key];
      } else {
        // Invalid Symbol.for format - treat as regular string key
        processedSource[key] = source[key];
      }
    } else {
      // Apply aliases to string keys
      const substitutedKey = applyAliases(key, aliasMap);
      processedSource[substitutedKey] = source[key];
    }
  }
  // Copy over actual symbol keys
  for (const sym of Object.getOwnPropertySymbols(source)) {
    processedSource[sym] = source[sym];
  }

  // Process 'ish' property for HTMLElements with itemscope (async, non-blocking)
  if ('ish' in processedSource) {
    if (typeof HTMLElement !== 'undefined' && target instanceof HTMLElement) {
      // Capture the value before deleting
      const ishValue = processedSource['ish'];
      // Remove 'ish' from processedSource to prevent normal assignment
      delete processedSource['ish'];
      
      // Get the itemscope attribute to track the setup
      const itemscopeValue = target.getAttribute('itemscope');
      
      // Load handler on demand and process asynchronously
      const setupPromise = (async () => {
        try {
          const { handleIshProperty } = await import('./handleIshProperty.js');
          await handleIshProperty(target, ishValue, options, assignGingerly);
        } catch (err) {
          console.error('Error in handleIshProperty:', err);
          // Re-throw errors asynchronously so they're visible
          setTimeout(() => { throw err; }, 0);
        }
      })();
      
      // Track the setup promise with the registry if we have an itemscope value
      if (itemscopeValue && typeof itemscopeValue === 'string' && itemscopeValue.length > 0) {
        const registry = (target as any).customElementRegistry?.itemscopeRegistry
          ?? (typeof customElements !== 'undefined' ? customElements.itemscopeRegistry : undefined);
        
        if (registry && typeof registry._trackSetup === 'function') {
          registry._trackSetup(itemscopeValue, setupPromise);
        }
      }
    }
    // For non-HTMLElement targets, 'ish' is processed as a normal property
  }

  // First pass: handle all non-symbol keys and sync operations
  for (const key of Object.keys(processedSource)) {
    const value = processedSource[key];

    // Handle += commands
    if (isIncCommand(key)) {
      const path = parseIncCommand(key);
      if (path) {
        if (isNestedPath(path)) {
          const pathParts = parsePath(path);

          // Check for withMethods path evaluation
          let lhsValue: any;
          let lhsParent: any;
          let lhsKey: string;
          if (withMethodsSet) {
            const result = evaluatePathWithMethods(target, pathParts, value, withMethodsSet);
            lhsParent = result.target;
            lhsKey = result.lastKey;
            lhsValue = lhsParent[lhsKey];
          } else {
            lhsKey = pathParts[pathParts.length - 1];
            lhsParent = ensureNestedPath(target, pathParts);
            lhsValue = lhsParent[lhsKey];
          }

          //TODO:  this logic seems to occur twice at least.  Maybe make it a method?
          // Event handler: Element LHS + object RHS with 'on' property
          if (lhsValue instanceof Element && value && typeof value === 'object' && !Array.isArray(value) && 'on' in value) {
            const capturedLhs = lhsValue;
            const capturedValue = value;
            const capturedTarget = target;
            const capturedOptions = options as AssignFromOptions | undefined;
            import('./handlers/addEventListener.js').then(({ attachEventListener }) => {
              attachEventListener(capturedLhs, capturedValue, capturedTarget, capturedOptions?.from ?? capturedTarget, capturedOptions ?? {});
            });
            continue;
          }

          if (!(lhsKey in lhsParent)) {
            lhsParent[lhsKey] = value;
          } else if (Array.isArray(lhsValue)) {
            lhsParent[lhsKey] = Array.isArray(value)
              ? [...lhsValue, ...value]
              : [...lhsValue, value];
          } else if (typeof lhsValue === 'number' && typeof value === 'string') {
            const parsed = Number(value);
            lhsParent[lhsKey] = isNaN(parsed) ? lhsValue + value : lhsValue + parsed;
          } else {
            lhsParent[lhsKey] += value;
          }
        } else {
          // Plain key - direct operation on target
          // Event handler: Element LHS + object RHS with 'on' property
          if (target[path] instanceof Element && value && typeof value === 'object' && !Array.isArray(value) && 'on' in value) {
            const capturedLhs = target[path];
            const capturedValue = value;
            const capturedTarget = target;
            const capturedOptions = options as AssignFromOptions | undefined;
            import('./handlers/addEventListener.js').then(({ attachEventListener }) => {
              attachEventListener(capturedLhs, capturedValue, capturedTarget, capturedOptions?.from ?? capturedTarget, capturedOptions ?? {});
            });
            continue;
          }

          if (!(path in target)) {
            target[path] = value;
          } else if (Array.isArray(target[path])) {
            target[path] = Array.isArray(value)
              ? [...target[path], ...value]
              : [...target[path], value];
          } else if (typeof target[path] === 'number' && typeof value === 'string') {
            const parsed = Number(value);
            target[path] = isNaN(parsed) ? target[path] + value : target[path] + parsed;
          } else {
            target[path] += value;
          }
        }
      }
      continue;
    }

    // Handle =! commands (toggle/negate)
    if (isToggleCommand(key)) {
      const lhsPath = parseToggleCommand(key);
      if (lhsPath) {
        const rhsPath = value;
        
        // Resolve LHS
        let lhsParent: any;
        let lhsLastKey: string;
        if (isNestedPath(lhsPath)) {
          const lhsPathParts = parsePath(lhsPath);
          lhsLastKey = lhsPathParts[lhsPathParts.length - 1];
          lhsParent = ensureNestedPath(target, lhsPathParts);
        } else {
          lhsLastKey = lhsPath;
          lhsParent = target;
        }

        // Determine what to negate
        let valueToNegate;
        if (rhsPath === '.') {
          // Self-reference: negate the LHS value itself (if it exists)
          if (lhsLastKey in lhsParent) {
            valueToNegate = lhsParent[lhsLastKey];
          } else {
            valueToNegate = undefined;
          }
        } else {
          // RHS path: navigate to get the value (don't create paths)
          if (isNestedPath(rhsPath)) {
            const rhsPathParts = parsePath(rhsPath);
            let current = target;
            let exists = true;
            for (const part of rhsPathParts) {
              if (current && typeof current === 'object' && part in current) {
                current = current[part];
              } else {
                exists = false;
                break;
              }
            }
            valueToNegate = exists ? current : true;
          } else {
            // Plain key RHS
            valueToNegate = (rhsPath in target) ? target[rhsPath] : true;
          }
        }
        
        // Apply negation to LHS
        lhsParent[lhsLastKey] = !valueToNegate;
      }
      continue;
    }

    // Handle -= delete commands
    if (isDeleteCommand(key)) {
      const path = parseDeleteCommand(key);
      if (path !== null) {
        // Determine the parent object
        let parent = target;
        let canDelete = true;
        
        if (isNestedPath(path)) {
          const pathParts = parsePath(path);
          if (pathParts.length === 0) {
            parent = target;
          } else {
            for (const part of pathParts) {
              if (parent && typeof parent === 'object' && part in parent) {
                parent = parent[part];
              } else {
                canDelete = false;
                break;
              }
            }
          }
        } else if (path.length > 0) {
          // Plain key - navigate one level
          if (parent && typeof parent === 'object' && path in parent) {
            parent = parent[path];
          } else {
            canDelete = false;
          }
        }
        // else: empty path = delete from root
        
        if (canDelete && typeof parent === 'object' && parent !== null) {
          const propertiesToDelete = Array.isArray(value) ? value : [value];
          for (const prop of propertiesToDelete) {
            if (prop in parent) {
              delete parent[prop];
            }
          }
        }
      }
      continue;
    }

    // Handle Y= merge commands (recursive assignGingerly into sub-object)
    if (isMergeCommand(key)) {
      const path = parseMergeCommand(key);
      if (path) {
        // Navigate to the target sub-object
        let mergeTarget: any;
        if (isNestedPath(path)) {
          if (withMethodsSet) {
            const result = evaluatePathWithMethods(target, parsePath(path), value, withMethodsSet);
            mergeTarget = result.target[result.lastKey];
          } else {
            const pathParts = parsePath(path);
            mergeTarget = target;
            for (const part of pathParts) {
              if (mergeTarget && typeof mergeTarget === 'object' && part in mergeTarget) {
                mergeTarget = mergeTarget[part];
              } else {
                mergeTarget = undefined;
                break;
              }
            }
          }
        } else {
          mergeTarget = target[path];
        }
        
        // Recursively merge if target is a valid object
        if (mergeTarget && typeof mergeTarget === 'object') {
          assignGingerly(mergeTarget, value, options, permissions);
        }
      }
      continue;
    }

    if (isNestedPath(key)) {
      const pathParts = parsePath(key);
      
      // Check if path contains @each or @eachTime (forEach)
      const forEachIndex = pathParts.findIndex(part => 
        isForEachSymbol(part, aliasMap) || isReactiveForEachSymbol(part, aliasMap)
      );
      
      if (forEachIndex !== -1) {
        // Check if it's reactive (@eachTime)
        const isReactive = isReactiveForEachSymbol(pathParts[forEachIndex], aliasMap);
        
        if (isReactive) {
          // Reactive forEach - dynamic load and fire-and-forget
          (async () => {
            try {
              const { handleEachTime } = await import('./eachTime.js');
              await handleEachTime(
                target,
                pathParts,
                forEachIndex,
                value,
                withMethodsSet,
                aliasMap,
                options
              );
            } catch (error) {
              console.error('Error in @eachTime:', error);
            }
          })();
          continue;
        }
        
        // Static forEach (@each) - existing logic
        const pathToForEach = pathParts.slice(0, forEachIndex);
        const pathAfterForEach = pathParts.slice(forEachIndex + 1);
        
        // Navigate to the iterable
        let current = target;
        if (pathToForEach.length > 0) {
          if (withMethodsSet) {
            const result = evaluatePathWithMethods(target, pathToForEach, value, withMethodsSet);
            // The result.target is the current position after evaluating the path
            // This is already the iterable we want
            current = result.target;
          } else {
            for (const part of pathToForEach) {
              current = current[part];
            }
          }
        }
        
        // Apply to each item in the iterable
        if (isIterable(current)) {
          applyToEach(current, pathAfterForEach, value, withMethodsSet || new Set(), aliasMap, options);
        }
        // If not iterable, let JavaScript throw error naturally when trying to iterate
        
        continue;
      }
      
      // No @each in path - handle normally
      // Check if we need to handle async methods (fire-and-forget)
      if (withAsyncMethodsSet && pathParts.some(p => withAsyncMethodsSet.has(p))) {
        // Fire-and-forget: dynamically import the async evaluator and run the chain
        const capturedTarget = target;
        const capturedPathParts = pathParts;
        const capturedValue = value;
        const capturedWithMethodsSet = withMethodsSet || new Set<string>();
        const capturedOptions = options;
        (async () => {
          const { evaluatePathWithAsyncMethods } = await import('./evaluatePathWithAsyncMethods.js');
          const result = await evaluatePathWithAsyncMethods(
            capturedTarget, capturedPathParts, capturedValue,
            capturedWithMethodsSet, withAsyncMethodsSet
          );

          if (result.isMethod || result.isAsyncMethod) {
            // Last segment is a method — call it
            const method = result.target[result.lastKey];
            if (typeof method === 'function') {
              const returnVal = Array.isArray(capturedValue)
                ? method.apply(result.target, capturedValue)
                : method.call(result.target, capturedValue);
              // If it's an async method, await it (for side effects)
              if (result.isAsyncMethod) await returnVal;
            }
          } else {
            // Not a method — assign the value
            const lastKey = result.lastKey;
            const parent = result.target;
            if (typeof capturedValue === 'object' && capturedValue !== null && !Array.isArray(capturedValue)) {
              if (lastKey in parent && isReadonlyProperty(parent, lastKey)) {
                const currentValue = parent[lastKey];
                if (typeof currentValue !== 'object' || currentValue === null) {
                  throw new Error(`Cannot merge object into readonly primitive property '${String(lastKey)}'`);
                }
                assignGingerly(currentValue, capturedValue, capturedOptions);
              } else {
                parent[lastKey] = capturedValue;
              }
            } else {
              parent[lastKey] = capturedValue;
            }
          }
        })();
        continue;
      }

      // Check if we need to handle methods
      if (withMethodsSet) {
        const result = evaluatePathWithMethods(target, pathParts, value, withMethodsSet);
        
        if (result.isMethod) {
          // Last segment is a method - call it
          const method = result.target[result.lastKey];
          if (typeof method === 'function') {
            if (Array.isArray(value)) {
              method.apply(result.target, value);
            } else {
              method.call(result.target, value);
            }
          }
          // Silently skip if not a function
          continue;
        }
        
        // Not a method - proceed with normal assignment using evaluated target
        const lastKey = result.lastKey;
        const parent = result.target;
        
        // Check for static assignTo protocol
        if (lastKey in parent && tryAssignTo(parent[lastKey], value, parent, lastKey)) {
          continue;
        }

        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          // Check if property exists and is readonly
          if (lastKey in parent && isReadonlyProperty(parent, lastKey)) {
            const currentValue = parent[lastKey];
            if (typeof currentValue !== 'object' || currentValue === null) {
              throw new Error(`Cannot merge object into readonly primitive property '${String(lastKey)}'`);
            }
            assignGingerly(currentValue, value, options);
          } else {
            // Property is writable - replace it
            parent[lastKey] = value;
          }
        } else {
          parent[lastKey] = value;
        }
      } else {
        // No withMethods - use original logic
        const lastKey = pathParts[pathParts.length - 1];
        const parent = ensureNestedPath(target, pathParts);

        // Check for static assignTo protocol
        if (lastKey in parent && tryAssignTo(parent[lastKey], value, parent, lastKey)) {
          continue;
        }

        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          // Check if property exists and is readonly
          if (lastKey in parent && isReadonlyProperty(parent, lastKey)) {
            // Property is readonly - check if current value is an object
            const currentValue = parent[lastKey];
            if (typeof currentValue !== 'object' || currentValue === null) {
              throw new Error(`Cannot merge object into readonly primitive property '${String(lastKey)}'`);
            }
            // Recursively apply assignGingerly to the readonly object
            assignGingerly(currentValue, value, options);
          } else {
            // Property is writable - replace it
            parent[lastKey] = value;
          }
        } else {
          parent[lastKey] = value;
        }
      }
    } else {
      // Non-nested path
      
      // Check if this is a method call
      if (withMethodsSet && withMethodsSet.has(key)) {
        const method = target[key];
        if (typeof method === 'function') {
          if (Array.isArray(value)) {
            method.apply(target, value);
          } else {
            method.call(target, value);
          }
        }
        // Silently skip if not a function
        continue;
      }
      
      // Normal assignment
      // Check for static assignTo protocol
      if (key in target && tryAssignTo(target[key], value, target, key)) {
        continue;
      }

      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Check if property exists and is readonly
        if (key in target && isReadonlyProperty(target, key)) {
          // Property is readonly - check if current value is an object
          const currentValue = target[key];
          if (typeof currentValue !== 'object' || currentValue === null) {
            throw new Error(`Cannot merge object into readonly primitive property '${String(key)}'`);
          }
          // Recursively apply assignGingerly to the readonly object
          assignGingerly(currentValue, value, options);
        } else {
          // Property is writable - replace it
          target[key] = value;
        }
      } else {
        target[key] = value;
      }
    }
  }

  // Second pass: handle symbol keys for dependency injection
  const symbols = Object.getOwnPropertySymbols(processedSource);
  for (const sym of symbols) {
    const value = processedSource[sym];

    if (registry) {
      const registryItem = registry.findBySymbol(sym);
      if (registryItem) {
        const instanceMap = getInstanceMap();
        // Get or initialize the instances map for this target
        const instances = instanceMap.getOrInsertComputed(target, () => new Map());

        // Check if instance already exists (keyed by registryItem)
        let instance = instances.get(registryItem);

        if (!instance) {
          const SpawnClass = registryItem.spawn;
          
          // Check canSpawn if it exists
          if (typeof SpawnClass.canSpawn === 'function') {
            const ctx = { config: registryItem };
            if (!SpawnClass.canSpawn(target, ctx)) {
              // canSpawn returned false, skip spawning
              continue;
            }
          }
          
          // If target is an Element and registryItem has enhKey, pass element to constructor
          if (registryItem.enhKey && typeof Element !== 'undefined' && target instanceof Element) {
            const ctx = { config: registryItem };
            const initVals = (target as any).enh?.[registryItem.enhKey] && 
                            !((target as any).enh[registryItem.enhKey] instanceof SpawnClass)
                            ? (target as any).enh[registryItem.enhKey]
                            : undefined;
            instance = new SpawnClass(target, ctx, initVals);
          } else {
            instance = new SpawnClass();
          }
          
          instances.set(registryItem, instance);
          
          // If target is an Element and registryItem has enhKey, store on enh
          if (registryItem.enhKey && typeof Element !== 'undefined' && target instanceof Element) {
            if (!(target as any).enh) {
              // This shouldn't happen if object-extension is loaded, but handle it
              (target as any).enh = {};
            }
            (target as any).enh[registryItem.enhKey] = instance;
          }
        }

        // Find the mapped property name
        if(registryItem.symlinks){
          const mappedKey = registryItem.symlinks[sym];
          if (mappedKey && instance && typeof instance === 'object') {
            (instance as any)[mappedKey] = value;
          }
        }

      }
    }
  }

  // Add lazy 'set' property that returns a proxy
  if (registry && !('set' in target)) {
    Object.defineProperty(target, 'set', {
      get() {
        return new Proxy(
          {},
          {
            set: (_, prop: string | symbol, value) => {
              if (typeof prop === 'symbol') {
                const registryItem = registry.findBySymbol(prop);
                if (registryItem) {
                  const instanceMap = getInstanceMap();
                  const instances = instanceMap.getOrInsertComputed(target, () => new Map());
                  let instance = instances.get(registryItem);

                  if (!instance) {
                    const SpawnClass = registryItem.spawn;
                    
                    // Check canSpawn if it exists
                    if (typeof SpawnClass.canSpawn === 'function') {
                      const ctx = { config: registryItem };
                      if (!SpawnClass.canSpawn(target, ctx)) {
                        // canSpawn returned false, skip spawning
                        return true;
                      }
                    }
                    
                    // If target is an Element and registryItem has enhKey, pass element to constructor
                    if (registryItem.enhKey && typeof Element !== 'undefined' && target instanceof Element) {
                      const ctx = { config: registryItem };
                      const initVals = (target as any).enh?.[registryItem.enhKey] && 
                                      !((target as any).enh[registryItem.enhKey] instanceof SpawnClass)
                                      ? (target as any).enh[registryItem.enhKey]
                                      : undefined;
                      instance = new SpawnClass(target, ctx, initVals);
                    } else {
                      instance = new SpawnClass();
                    }
                    
                    instances.set(registryItem, instance);
                    
                    // If target is an Element and registryItem has enhKey, store on enh
                    if (registryItem.enhKey && typeof Element !== 'undefined' && target instanceof Element) {
                      if (!(target as any).enh) {
                        (target as any).enh = {};
                      }
                      (target as any).enh[registryItem.enhKey] = instance;
                    }
                  }
                  if(registryItem.symlinks){
                    const mappedKey = registryItem.symlinks[prop];
                    if (mappedKey && instance && typeof instance === 'object') {
                      (instance as any)[mappedKey] = value;
                    }
                  }

                }
              }
              return true;
            },
          }
        );
      },
      configurable: true,
    });
  }

  // Fire-and-forget bulk enhancements (async, non-blocking)
  if (options?.enhance && options.enhance.length > 0 && typeof target === 'object' && target instanceof Element) {
    import('./enhanceAll.js').then(({ enhanceAll }) => {
      enhanceAll(target, options!.enhance!, permissions);
    });
  }

  return target;
}

export default assignGingerly;
