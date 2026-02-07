/**
 * Interface for registry items that define dependency injection mappings
 */
export interface IBaseRegistryItem<T = any> {
  spawn: { new (): T };
  map: { [key: string | symbol]: keyof T };
  enhKey?: string;
}

/**
 * Interface for the options passed to assignGingerly
 */
export interface IAssignGingerlyOptions {
  registry?: typeof BaseRegistry | BaseRegistry;
}

/**
 * Map to store spawned instances associated with objects
 */
const instanceMap = new WeakMap<object, Map<symbol | string, any>>();

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
        // Get or initialize the instances map for this target
        if (!instanceMap.has(target)) {
          instanceMap.set(target, new Map());
        }
        const instances = instanceMap.get(target)!;

        // Check if instance already exists
        let instance = instances.get(sym);

        if (!instance) {
          const SpawnClass = registryItem.spawn;
          instance = new SpawnClass();
          instances.set(sym, instance);
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
                  if (!instanceMap.has(target)) {
                    instanceMap.set(target, new Map());
                  }
                  const instances = instanceMap.get(target)!;
                  let instance = instances.get(prop);

                  if (!instance) {
                    const SpawnClass = registryItem.spawn;
                    instance = new SpawnClass();
                    instances.set(prop, instance);
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
