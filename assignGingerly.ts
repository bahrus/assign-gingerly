

import { EnhancementConfig } from "./types/assign-gingerly/types";

/**
 * @deprecated Use EnhancementConfig instead
 */
export type IBaseRegistryItem<T = any> = EnhancementConfig<T>;

/**
 * Interface for the options passed to assignGingerly
 */
export interface IAssignGingerlyOptions {
  registry?: typeof BaseRegistry | BaseRegistry;
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
export class BaseRegistry {
  private items: EnhancementConfig[] = [];

  push(items: EnhancementConfig | EnhancementConfig[]): void {
    if (Array.isArray(items)) {
      this.items.push(...items);
    } else {
      this.items.push(items);
    }
  }

  getItems(): EnhancementConfig[] {
    return this.items;
  }

  findBySymbol(symbol: symbol | string): EnhancementConfig | undefined {
    return this.items.find(item => {
      const symlinks = item.symlinks;
      if (!symlinks) return false;
      return Object.keys(symlinks).some(key => {
        if (typeof key === 'symbol' || (typeof symlinks[key as any] === 'symbol')) {
          return key === symbol || symlinks[key as any] === symbol;
        }
        return false;
      }) || Object.getOwnPropertySymbols(symlinks).some(sym => sym === symbol);
    });
  }

  findByEnhKey(enhKey: string | symbol): EnhancementConfig | undefined {
    return this.items.find(item => item.enhKey === enhKey);
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

  const registry = options?.registry instanceof BaseRegistry
    ? options.registry
    : options?.registry
    ? new options.registry()
    : undefined;

  // Convert Symbol.for string keys to actual symbols
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
      processedSource[key] = source[key];
    }
  }
  // Copy over actual symbol keys
  for (const sym of Object.getOwnPropertySymbols(source)) {
    processedSource[sym] = source[sym];
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
      const lastKey = pathParts[pathParts.length - 1];
      const parent = ensureNestedPath(target, pathParts);

      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Recursively apply assignGingerly for nested objects
        if (!(lastKey in parent) || typeof parent[lastKey] !== 'object') {
          parent[lastKey] = {};
        }
        assignGingerly(parent[lastKey], value, options);
      } else {
        parent[lastKey] = value;
      }
    } else {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Recursively apply assignGingerly for nested objects
        if (!(key in target) || typeof target[key] !== 'object') {
          target[key] = {};
        }
        assignGingerly(target[key], value, options);
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
        if (!instanceMap.has(target)) {
          instanceMap.set(target, new Map());
        }
        const instances = instanceMap.get(target)!;

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
                  if (!instanceMap.has(target)) {
                    instanceMap.set(target, new Map());
                  }
                  const instances = instanceMap.get(target)!;
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
