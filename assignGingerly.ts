/**
 * Interface for registry items that define dependency injection mappings
 */
export interface IBaseRegistryItem<T = any> {
  spawn: { new (oElement?: Element, ctx?: SpawnContext<T>, initVals?: Partial<T>): T };
  map: { [key: string | symbol]: keyof T };
  enhKey?: string;
  lifecycleKeys?: {
    dispose?: string;
    resolved?: string;
  };
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
 * Helper function to check if a key represents a ??x delete command
 */
function isDeleteCommand(key: string): boolean {
  return key.includes('??');
}

/**
 * Helper function to parse a ??x delete command and extract the path and property
 */
function parseDeleteCommand(key: string): { path: string; property: string } | null {
  if (!isDeleteCommand(key)) {
    return null;
  }
  const parts = key.split('??');
  if (parts.length !== 2) {
    return null;
  }
  return { path: parts[0], property: parts[1] };
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

    // Handle ??x delete commands
    if (isDeleteCommand(key)) {
      const parsed = parseDeleteCommand(key);
      if (parsed && value === null) {
        const { path, property } = parsed;
        const pathParts = parsePath(path);
        
        // Navigate to parent without creating intermediate paths
        let parent = target;
        let canDelete = true;
        
        for (const part of pathParts) {
          if (parent && typeof parent === 'object' && part in parent) {
            parent = parent[part];
          } else {
            canDelete = false;
            break;
          }
        }
        
        if (canDelete && typeof parent === 'object' && parent !== null && property in parent) {
          delete parent[property];
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
