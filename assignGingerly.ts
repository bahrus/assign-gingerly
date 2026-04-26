

import { EnhancementConfig } from "./types/assign-gingerly/types";

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
 * Interface for the options passed to assignGingerly
 */
export interface IAssignGingerlyOptions {
  registry?: typeof EnhancementRegistry | EnhancementRegistry;
  bypassChecks?: boolean;
  
  /**
   * List of property names that should be treated as methods to call
   * rather than properties to assign.
   * 
   * When a path segment matches a name in this array/set:
   * - If the property is a function, call it with appropriate arguments
   * - For the last segment: use RHS value as argument (spread if array)
   * - For middle segments: use next segment as string argument (if next is not also a method)
   * - If consecutive segments are both methods, first is called with no arguments
   * - If the property is not a function, silently skip
   * 
   * Example:
   * assignGingerly(element, {
   *   '?.classList?.add': 'myClass'
   * }, { withMethods: ['add'] });
   * // Calls: element.classList.add('myClass')
   * 
   * Chained methods:
   * assignGingerly(elementRef, {
   *   '?.deref?.querySelector?.myElement?.classList?.add': 'active'
   * }, { withMethods: ['deref', 'querySelector', 'add'] });
   * // Calls: elementRef.deref().querySelector('myElement').classList.add('active')
   */
  withMethods?: string[] | Set<string>;
  
  /**
   * Alias mappings for property and method names.
   * Allows shorter, customizable shortcuts in path expressions.
   * 
   * Aliases are substituted before path evaluation, matching complete tokens
   * between `?.` delimiters (not substrings).
   * 
   * Reserved characters (cannot be used in aliases): space, backtick (`)
   * 
   * Example:
   * assignGingerly(element, {
   *   '?.$?.my-element?.c?.+': 'highlighted'
   * }, { 
   *   withMethods: ['querySelector', 'add'],
   *   aka: { '$': 'querySelector', 'c': 'classList', '+': 'add' }
   * });
   * // Equivalent to: element.querySelector('my-element').classList.add('highlighted')
   */
  aka?: Record<string, string>;
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
 * Helper function to parse a path string with ?. notation
 */
function parsePath(path: string): string[] {
  return path
    .split('.')
    .map(part => part.replace(/\?/g, ''))
    .filter(part => part.length > 0);
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
 * Helper function to check if a property is readonly
 * A property is readonly if:
 * - It's a data property with writable: false, OR
 * - It's an accessor property with a getter but no setter
 */
function isReadonlyProperty(obj: any, propName: string | symbol): boolean {
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
  
  // If it's an accessor property, check if it has only a getter (no setter)
  if ('get' in descriptor) {
    return descriptor.set === undefined;
  }
  
  return false;
}

/**
 * Helper function to check if a value is a class instance (not a plain object)
 * Returns true for instances of classes, false for plain objects, arrays, and primitives
 */
function isClassInstance(value: any): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return false;
  
  const proto = Object.getPrototypeOf(value);
  // Plain objects have Object.prototype or null as prototype
  return proto !== Object.prototype && proto !== null;
}

/**
 * Helper function to evaluate a nested path with method calls
 * Handles chained method calls where path segments can be methods
 */
function evaluatePathWithMethods(
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
  options?: IAssignGingerlyOptions
): any {
  if (!target || typeof target !== 'object') {
    return target;
  }

  // Convert withMethods array to Set for O(1) lookup
  const withMethodsSet = options?.withMethods
    ? options.withMethods instanceof Set
      ? options.withMethods
      : new Set(options.withMethods)
    : undefined;

  // Convert aka object to Map for O(1) lookup and validate aliases
  const aliasMap = new Map<string, string>();
  if (options?.aka) {
    for (const [alias, target] of Object.entries(options.aka)) {
      // Validate: disallow space and backtick in aliases
      if (alias.includes(' ') || alias.includes('`')) {
        throw new Error(`Invalid alias '${alias}': aliases cannot contain space or backtick characters`);
      }
      aliasMap.set(alias, target);
    }
  }

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
        const pathParts = parsePath(path);
        const lastKey = pathParts[pathParts.length - 1];
        const parent = ensureNestedPath(target, pathParts);

        // If the path doesn't exist, set it directly to the value
        if (!(lastKey in parent)) {
          parent[lastKey] = value;
        } else {
          // Path exists, apply increment: oldValue += newValue
          parent[lastKey] += value;
        }
      }
      continue;
    }

    // Handle =! commands (toggle/negate)
    if (isToggleCommand(key)) {
      const lhsPath = parseToggleCommand(key);
      if (lhsPath) {
        const rhsPath = value;
        
        // Parse LHS path
        const lhsPathParts = parsePath(lhsPath);
        const lhsLastKey = lhsPathParts[lhsPathParts.length - 1];
        const lhsParent = ensureNestedPath(target, lhsPathParts);

        // Determine what to negate
        let valueToNegate;
        if (rhsPath === '.') {
          // Self-reference: negate the LHS value itself (if it exists)
          if (lhsLastKey in lhsParent) {
            valueToNegate = lhsParent[lhsLastKey];
          } else {
            // LHS doesn't exist, treat as undefined -> !undefined = true
            valueToNegate = undefined;
          }
        } else {
          // RHS path: navigate to get the value (don't create paths)
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
          
          // If RHS doesn't exist, treat as truthy (will become false)
          valueToNegate = exists ? current : true;
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
        const pathParts = parsePath(path);
        
        // Determine the parent object
        let parent = target;
        let canDelete = true;
        
        // If path is empty or just '?', delete from root
        if (pathParts.length === 0) {
          parent = target;
        } else {
          // Navigate to parent object
          for (const part of pathParts) {
            if (parent && typeof parent === 'object' && part in parent) {
              parent = parent[part];
            } else {
              canDelete = false;
              break;
            }
          }
        }
        
        if (canDelete && typeof parent === 'object' && parent !== null) {
          // RHS can be a string (single property) or array (multiple properties)
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

    if (isNestedPath(key)) {
      const pathParts = parsePath(key);
      
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
        
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          // Check if property exists and is readonly OR is a class instance
          if (lastKey in parent && (isReadonlyProperty(parent, lastKey) || isClassInstance(parent[lastKey]))) {
            const currentValue = parent[lastKey];
            if (typeof currentValue !== 'object' || currentValue === null) {
              throw new Error(`Cannot merge object into ${isReadonlyProperty(parent, lastKey) ? 'readonly ' : ''}primitive property '${String(lastKey)}'`);
            }
            assignGingerly(currentValue, value, options);
          } else {
            // Property is writable and not a class instance - replace it
            parent[lastKey] = value;
          }
        } else {
          parent[lastKey] = value;
        }
      } else {
        // No withMethods - use original logic
        const lastKey = pathParts[pathParts.length - 1];
        const parent = ensureNestedPath(target, pathParts);

        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          // Check if property exists and is readonly OR is a class instance
          if (lastKey in parent && (isReadonlyProperty(parent, lastKey) || isClassInstance(parent[lastKey]))) {
            // Property is readonly or a class instance - check if current value is an object
            const currentValue = parent[lastKey];
            if (typeof currentValue !== 'object' || currentValue === null) {
              throw new Error(`Cannot merge object into ${isReadonlyProperty(parent, lastKey) ? 'readonly ' : ''}primitive property '${String(lastKey)}'`);
            }
            // Recursively apply assignGingerly to the readonly object or class instance
            assignGingerly(currentValue, value, options);
          } else {
            // Property is writable and not a class instance - replace it
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
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Check if property exists and is readonly OR is a class instance
        if (key in target && (isReadonlyProperty(target, key) || isClassInstance(target[key]))) {
          // Property is readonly or a class instance - check if current value is an object
          const currentValue = target[key];
          if (typeof currentValue !== 'object' || currentValue === null) {
            throw new Error(`Cannot merge object into ${isReadonlyProperty(target, key) ? 'readonly ' : ''}primitive property '${String(key)}'`);
          }
          // Recursively apply assignGingerly to the readonly object or class instance
          assignGingerly(currentValue, value, options);
        } else {
          // Property is writable and not a class instance - replace it
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

  return target;
}

export default assignGingerly;
