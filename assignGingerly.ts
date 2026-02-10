/**
 * Interface for registry items that define dependency injection mappings
 */
export interface IBaseRegistryItem<T = any> {
  spawn: { new (oElement?: Element, ctx?: SpawnContext<T>, initVals?: Partial<T>): T };
  map: { [key: string | symbol]: keyof T };
  enhKey?: string;
}

export interface SpawnContext<T = any> {
  mountInfo: IBaseRegistryItem<T>;
}

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
export function getInstanceMap(): WeakMap<object, Map<IBaseRegistryItem, any>> {
  if (!(globalThis as any)[INSTANCE_MAP_GUID]) {
    (globalThis as any)[INSTANCE_MAP_GUID] = new WeakMap<object, Map<IBaseRegistryItem, any>>();
  }
  return (globalThis as any)[INSTANCE_MAP_GUID];
}

/**
 * Base registry class for managing dependency injection
 */
export class BaseRegistry {
  private items: IBaseRegistryItem[] = [];

  push(items: IBaseRegistryItem | IBaseRegistryItem[]): void {
    if (Array.isArray(items)) {
      this.items.push(...items);
    } else {
      this.items.push(items);
    }
  }

  getItems(): IBaseRegistryItem[] {
    return this.items;
  }

  findBySymbol(symbol: symbol | string): IBaseRegistryItem | undefined {
    return this.items.find(item => {
      const map = item.map;
      return Object.keys(map).some(key => {
        if (typeof key === 'symbol' || (typeof map[key as any] === 'symbol')) {
          return key === symbol || map[key as any] === symbol;
        }
        return false;
      }) || Object.getOwnPropertySymbols(map).some(sym => sym === symbol);
    });
  }

  findByEnhKey(enhKey: string | symbol): IBaseRegistryItem | undefined {
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
 * Helper function to check if a key represents an !inc command
 */
function isIncCommand(key: string): boolean {
  return key.startsWith('!inc ');
}

/**
 * Helper function to parse an !inc command and extract the path
 */
function parseIncCommand(key: string): string | null {
  if (!isIncCommand(key)) {
    return null;
  }
  return key.substring(5); // Remove '!inc ' prefix
}

/**
 * Helper function to check if a key represents a !toggle command
 */
function isToggleCommand(key: string): boolean {
  return key.startsWith('!toggle ');
}

/**
 * Helper function to parse a !toggle command and extract the path
 */
function parseToggleCommand(key: string): string | null {
  if (!isToggleCommand(key)) {
    return null;
  }
  return key.substring(8); // Remove '!toggle ' prefix
}

/**
 * Helper function to check if a key represents a !delete command
 */
function isDeleteCommand(key: string): boolean {
  return key.startsWith('!delete ');
}

/**
 * Helper function to parse a !delete command and extract the path
 */
function parseDeleteCommand(key: string): string | null {
  if (!isDeleteCommand(key)) {
    return null;
  }
  return key.substring(8); // Remove '!delete ' prefix
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

    // Handle !inc commands
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

    // Handle !toggle commands
    if (isToggleCommand(key)) {
      const path = parseToggleCommand(key);
      if (path) {
        const delay = value;
        
        if (delay === 0) {
          // Immediate toggle
          const pathParts = parsePath(path);
          const lastKey = pathParts[pathParts.length - 1];
          const parent = ensureNestedPath(target, pathParts);

          if (lastKey in parent) {
            // Path exists, toggle it
            parent[lastKey] = !parent[lastKey];
          }
          // If path doesn't exist, don't create it for immediate toggle
        } else {
          // Delayed toggle using setTimeout
          setTimeout(() => {
            const pathParts = parsePath(path);
            const lastKey = pathParts[pathParts.length - 1];
            const parent = ensureNestedPath(target, pathParts);

            if (lastKey in parent) {
              // Path exists, toggle it
              parent[lastKey] = !parent[lastKey];
            } else {
              // Path doesn't exist, initialize to true
              parent[lastKey] = true;
            }
          }, delay);
        }
      }
      continue;
    }

    // Handle !delete commands
    if (isDeleteCommand(key)) {
      const path = parseDeleteCommand(key);
      if (path) {
        const delay = value;
        
        if (delay === 0) {
          // Immediate delete
          const pathParts = parsePath(path);
          if (pathParts.length > 0) {
            const lastKey = pathParts[pathParts.length - 1];
            const parentPathParts = pathParts.slice(0, -1);
            
            // Navigate to parent without creating intermediate paths
            let parent = target;
            let canDelete = true;
            
            for (const part of parentPathParts) {
              if (!(part in parent) || typeof parent[part] !== 'object' || parent[part] === null) {
                canDelete = false;
                break;
              }
              parent = parent[part];
            }
            
            if (canDelete && lastKey in parent) {
              delete parent[lastKey];
            }
          }
        } else {
          // Delayed delete using setTimeout
          setTimeout(() => {
            const pathParts = parsePath(path);
            if (pathParts.length > 0) {
              const lastKey = pathParts[pathParts.length - 1];
              const parentPathParts = pathParts.slice(0, -1);
              
              // Navigate to parent without creating intermediate paths
              let parent = target;
              let canDelete = true;
              
              for (const part of parentPathParts) {
                if (!(part in parent) || typeof parent[part] !== 'object' || parent[part] === null) {
                  canDelete = false;
                  break;
                }
                parent = parent[part];
              }
              
              if (canDelete && lastKey in parent) {
                delete parent[lastKey];
              }
            }
          }, delay);
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
          
          // If target is an Element and registryItem has enhKey, pass element to constructor
          if (registryItem.enhKey && typeof Element !== 'undefined' && target instanceof Element) {
            const ctx = { mountInfo: registryItem };
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
        const mappedKey = registryItem.map[sym];
        if (mappedKey && instance && typeof instance === 'object') {
          (instance as any)[mappedKey] = value;
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
                    
                    // If target is an Element and registryItem has enhKey, pass element to constructor
                    if (registryItem.enhKey && typeof Element !== 'undefined' && target instanceof Element) {
                      const ctx = { mountInfo: registryItem };
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
                  
                  const mappedKey = registryItem.map[prop];
                  if (mappedKey && instance && typeof instance === 'object') {
                    (instance as any)[mappedKey] = value;
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
