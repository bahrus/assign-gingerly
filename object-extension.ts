import assignGingerly, { EnhancementRegistry, ItemscopeRegistry,  getInstanceMap } from './assignGingerly.js';
import {IAssignGingerlyOptions,} from './types/assign-gingerly/types.js';
import assignTentatively from './assignTentatively.js';
import type { IAssignTentativelyOptions } from './types/assign-gingerly/types.js';
import { EnhancementConfig, SpawnContext } from './types/assign-gingerly/types.js';
import { parseWithAttrs } from './parseWithAttrs.js';

/**
 * Normalizes lifecycleKeys to always return an object with dispose and resolved keys
 * @param lifecycleKeys - The lifecycleKeys from registry item (true or object)
 * @returns Normalized object with dispose and resolved keys, or undefined
 */
function normalizeLifecycleKeys(lifecycleKeys: true | { dispose?: string | symbol, resolved?: string | symbol } | undefined): { dispose?: string | symbol, resolved?: string | symbol } | undefined {
  if (lifecycleKeys === true) {
    return {
      dispose: 'dispose',
      resolved: 'resolved'
    };
  }
  return lifecycleKeys;
}

/**
 * Extends the CustomElementRegistry interface to include enhancementRegistry and itemscopeRegistry
 */
declare global {
  interface CustomElementRegistry {
    enhancementRegistry: typeof EnhancementRegistry | EnhancementRegistry;
    itemscopeRegistry: ItemscopeRegistry;
  }
  
  interface Element {
    enh: any; // Enhancement container
  }
}

/**
 * Extends the Object interface to include the assignGingerly and assignTentatively methods
 */
declare global {
  interface Object {
    /**
     * Carefully merge properties from a source object into this object.
     * Supports nested paths with ?. notation and dependency injection via registry.
     * 
     * @param source - The source object to merge
     * @param options - Optional configuration with registry for dependency injection
     * @returns This object after merging
     * 
     * @example
     * const target = {};
     * target.assignGingerly({ '?.style?.height': '15px' });
     * console.log(target); // { style: { height: '15px' } }
     * 
     * @example
     * const obj = { a: 1 };
     * obj.assignGingerly({ b: 2, '?.nested?.key': 'value' });
     * console.log(obj); // { a: 1, b: 2, nested: { key: 'value' } }
     */
    assignGingerly(
      source: Record<string | symbol, any>,
      options?: IAssignGingerlyOptions
    ): this;

    /**
     * Carefully merge properties from a source object into this object, tracking changes
     * for reversibility. Returns a reversal object that can undo all modifications.
     * 
     * @param source - The source object to merge
     * @param options - Optional configuration with reversal tracking
     * @returns A reversal object that, when passed to assignGingerly, undoes the changes
     * 
     * @example
     * const obj = { name: 'Alice', age: 30 };
     * const reversal = obj.assignTentatively({ name: 'Bob', score: 100 });
     * // obj = { name: 'Bob', age: 30, score: 100 }
     * obj.assignGingerly(reversal);
     * // obj = { name: 'Alice', age: 30 } — score removed, name restored
     */
    assignTentatively(
      source: Record<string | symbol, any>,
      options?: IAssignTentativelyOptions
    ): Record<string | symbol, any>;
  }
}

/**
 * Adds enhancementRegistry to CustomElementRegistry prototype as a lazy getter
 */
if (typeof CustomElementRegistry !== 'undefined') {
  Object.defineProperty(CustomElementRegistry.prototype, 'enhancementRegistry', {
    get: function () {
      // Create a new BaseRegistry instance on first access and cache it
      const registry = new EnhancementRegistry();
      // Replace the getter with the actual value
      Object.defineProperty(this, 'enhancementRegistry', {
        value: registry,
        writable: true,
        enumerable: false,
        configurable: true,
      });
      return registry;
    },
    enumerable: false,
    configurable: true,
  });

  /**
   * Adds itemscopeRegistry to CustomElementRegistry prototype as a lazy getter
   */
  Object.defineProperty(CustomElementRegistry.prototype, 'itemscopeRegistry', {
    get: function () {
      // Create a new ItemscopeRegistry instance on first access and cache it
      const registry = new ItemscopeRegistry();
      // Replace the getter with the actual value
      Object.defineProperty(this, 'itemscopeRegistry', {
        value: registry,
        writable: true,
        enumerable: false,
        configurable: true,
      });
      return registry;
    },
    enumerable: false,
    configurable: true,
  });
}

/**
 * Enhancement container class for Element.prototype.enh
 * Provides a 'set' proxy for enhanced property assignment
 */
class ElementEnhancementContainer {
  private element: Element;
  private _setProxy?: ProxyHandler<ElementEnhancementContainer>;

  constructor(element: Element) {
    this.element = element;
  }

  /**
   * Resolve a registryItem parameter to an EnhancementConfig.
   * If a string or symbol is passed, looks it up via findByEnhKey in the registry.
   * @param registryItem - EnhancementConfig object, or string/symbol enhKey
   * @param registry - The enhancement registry to search
   * @returns The resolved EnhancementConfig
   * @throws Error if string/symbol not found in registry
   */
  private resolveRegistryItem(
    registryItem: EnhancementConfig | string | symbol,
    registry: EnhancementRegistry
  ): EnhancementConfig {
    if (typeof registryItem === 'string' || typeof registryItem === 'symbol') {
      const found = registry.findByEnhKey(registryItem);
      if (!found) {
        throw new Error(`${String(registryItem)} not in registry`);
      }
      return found;
    }
    return registryItem;
  }

  /**
   * Get or spawn an instance for a registry item
   * @param registryItem - The registry item (EnhancementConfig object, or string/symbol enhKey) to get/spawn instance for
   * @param mountCtx - Optional context to pass to the spawned instance
   * @returns The spawned instance
   */
  get(registryItem: EnhancementConfig | string | symbol, mountCtx?: any): any {
    const element = this.element;
    
    // Get the registry from customElementRegistry
    const registry = (element as any).customElementRegistry?.enhancementRegistry;
    
    if (!registry) {
      throw new Error('customElementRegistry.enhancementRegistry not available');
    }
    
    // Resolve string/symbol to EnhancementConfig via enhKey lookup
    registryItem = this.resolveRegistryItem(registryItem, registry);
    
    // Check if registryItem is in the registry
    const items = registry.getItems();
    if (!items.includes(registryItem)) {
      // Add it to the registry
      registry.push(registryItem);
    }
    
    // Get or create instance using the global instance map
    const instanceMap = getInstanceMap();
    const instances = instanceMap.getOrInsertComputed(element, () => new Map());
    
    let instance = instances.get(registryItem);
    
    if (!instance) {
      // Need to spawn
      const SpawnClass = registryItem.spawn;
      
      // Check canSpawn if it exists
      if (typeof SpawnClass.canSpawn === 'function') {
        const ctx = { config: registryItem, mountCtx };
        if (!SpawnClass.canSpawn(element, ctx)) {
          // canSpawn returned false, return undefined
          return undefined;
        }
      }
      
      // Parse attributes if withAttrs is defined (regardless of enhKey)
      let attrInitVals: any = undefined;
      if (registryItem.withAttrs && element) {
        try {
          // Create SpawnContext to pass to parseWithAttrs
          // If mountCtx already has synthesizerElement, use it directly in the SpawnContext
          const spawnContext = { 
            config: registryItem, 
            mountCtx,
            synthesizerElement: (mountCtx as any)?.synthesizerElement
          };
          attrInitVals = parseWithAttrs(
            element, 
            registryItem.withAttrs,
            registryItem.allowUnprefixed,
            spawnContext
          );
        } catch (e) {
          console.error('Error parsing attributes:', e);
          throw e;
        }
      }
      
      // Check if there's an enhKey
      if (registryItem.enhKey) {
        const ctx: SpawnContext = { config: registryItem, mountCtx, emc: (mountCtx as any)?.emc };
        const self = this as any;
        
        // Get existing initVals from enhKey
        const existingInitVals = self[registryItem.enhKey] && 
                        !(self[registryItem.enhKey] instanceof SpawnClass)
                        ? self[registryItem.enhKey]
                        : undefined;
        
        // Merge attrInitVals with existingInitVals (existingInitVals takes precedence)
        const initVals = attrInitVals 
          ? (existingInitVals ? { ...attrInitVals, ...existingInitVals } : attrInitVals)
          : existingInitVals;
        
        instance = new SpawnClass(element, ctx, initVals);
        
        // Store on enh container
        self[registryItem.enhKey] = instance;
      } else {
        // No enhKey, still pass attrInitVals
        const ctx: SpawnContext = { config: registryItem, mountCtx, emc: (mountCtx as any)?.emc };
        instance = new SpawnClass(element, ctx, attrInitVals);
      }
      
      // Store in global instance map
      instances.set(registryItem, instance);
    }
    
    return instance;
  }

  /**
   * Dispose of an enhancement instance
   * @param registryItem - The registry item (EnhancementConfig object, or string/symbol enhKey) to dispose
   */
  dispose(registryItem: EnhancementConfig | string | symbol): void {
    const element = this.element;
    
    // Resolve string/symbol to EnhancementConfig via enhKey lookup
    let resolved: EnhancementConfig;
    if (typeof registryItem === 'string' || typeof registryItem === 'symbol') {
      const registry = (element as any).customElementRegistry?.enhancementRegistry;
      if (!registry) {
        return; // No registry, nothing to dispose
      }
      const found = registry.findByEnhKey(registryItem);
      if (!found) {
        throw new Error(`${String(registryItem)} not in registry`);
      }
      resolved = found;
    } else {
      resolved = registryItem;
    }
    
    // Get the instance map
    const instanceMap = getInstanceMap();
    if (!instanceMap.has(element)) {
      return; // No instances for this element
    }
    
    const instances = instanceMap.get(element)!;
    const spawnedInstance = instances.get(resolved);
    
    if (!spawnedInstance) {
      return; // No instance for this registry item
    }
    
    // Call dispose lifecycle method if it exists
    const lifecycleKeys = normalizeLifecycleKeys(resolved.lifecycleKeys);
    const disposeKey = lifecycleKeys?.dispose;
    if (disposeKey && typeof spawnedInstance[disposeKey] === 'function') {
      spawnedInstance[disposeKey](resolved);
    }
    
    // Remove from instance map
    instances.delete(resolved);
    
    // Remove from enh container if it has an enhKey
    if (resolved.enhKey) {
      const self = this as any;
      delete self[resolved.enhKey];
    }
  }

  /**
   * Wait for an enhancement instance to be resolved
   * @param registryItem - The registry item (EnhancementConfig object, or string/symbol enhKey) to wait for
   * @param mountCtx - Optional context to pass to the spawned instance
   * @returns Promise that resolves with the spawned instance
   */
  async whenResolved(registryItem: EnhancementConfig | string | symbol, mountCtx?: any): Promise<any> {
    // Resolve string/symbol to EnhancementConfig via enhKey lookup
    let resolved: EnhancementConfig;
    if (typeof registryItem === 'string' || typeof registryItem === 'symbol') {
      const element = this.element;
      const registry = (element as any).customElementRegistry?.enhancementRegistry;
      if (!registry) {
        throw new Error('customElementRegistry.enhancementRegistry not available');
      }
      const found = registry.findByEnhKey(registryItem);
      if (!found) {
        throw new Error(`${String(registryItem)} not in registry`);
      }
      resolved = found;
    } else {
      resolved = registryItem;
    }
    
    const lifecycleKeys = normalizeLifecycleKeys(resolved.lifecycleKeys);
    const resolvedKey = lifecycleKeys?.resolved;
    
    if (resolvedKey === undefined) {
      throw new Error('Must specify resolved key in lifecycleKeys');
    }
    
    // Get or spawn the instance (pass mountCtx through)
    const spawnedInstance = this.get(resolved, mountCtx);
    
    // Check if already resolved
    if ((spawnedInstance as any)[resolvedKey]) {
      return spawnedInstance;
    }
    
    // Check if instance is an EventTarget
    if (!(spawnedInstance instanceof EventTarget)) {
      throw new Error('Instance must be an EventTarget to use whenResolved');
    }
    
    // Lazy load waitForEvent
    const { waitForEvent } = await import('./utils/waitForEvent.js');
    
    // Wait for the resolved event (use resolvedKey as event name)
    // Note: When symbols are supported as event names, this will work with symbol keys too
    await waitForEvent(spawnedInstance, resolvedKey as string);
    
    // Check if resolved flag is now set
    if ((spawnedInstance as any)[resolvedKey]) {
      return spawnedInstance;
    }
    
    throw new Error('Rejected');
  }

  /**
   * Lazy getter for the set proxy
   */
  get set() {
    if (!this._setProxy) {
      const self = this as any; // Allow dynamic property access
      const element = this.element;
      this._setProxy = new Proxy(this, {
        get(obj: any, prop: string | symbol) {
          // Get the registry from customElementRegistry
          const registry = (element as any).customElementRegistry?.enhancementRegistry;
          
          if (registry) {
            // Check if there's a registry item with matching enhKey
            const registryItem = registry.findByEnhKey(prop);
            
            if (registryItem) {
              const SpawnClass = registryItem.spawn;
              
              // Check the global instance map first
              const instanceMap = getInstanceMap();
              const instances = instanceMap.getOrInsertComputed(element, () => new Map());
              
              let instance = instances.get(registryItem);
              
              if (!instance) {
                // Need to spawn
                const SpawnClass = registryItem.spawn;
                
                // Check canSpawn if it exists
                if (typeof SpawnClass.canSpawn === 'function') {
                  const ctx = { config: registryItem };
                  if (!SpawnClass.canSpawn(element, ctx)) {
                    // canSpawn returned false, return undefined
                    return undefined;
                  }
                }
                
                let initVals: any = undefined;
                
                // If property exists but isn't the right instance, pass it as initVals
                if (self[prop] && !(self[prop] instanceof SpawnClass)) {
                  initVals = self[prop];
                }
                
                // Create spawn context
                const ctx = { config: registryItem };
                
                // Spawn the instance
                instance = new SpawnClass(element, ctx, initVals);
                
                // Store in global instance map
                instances.set(registryItem, instance);
                
                // Set it on the enh container
                self[prop] = instance;
              } else {
                // Instance exists in global map, ensure it's on enh container
                if (self[prop] !== instance) {
                  self[prop] = instance;
                }
              }
              
              return instance;
            }
          }
          
          // No registry item found - create plain object if needed
          if (self[prop] === undefined) {
            self[prop] = {};
          }
          
          return self[prop];
        }
      }) as any;
    }
    
    return this._setProxy;
  }
}

/**
 * Adds 'enh' property to Element prototype for enhanced property assignment
 * Supports automatic spawning of enhancement classes based on registry
 */
if (typeof Element !== 'undefined') {
  const enhContainerWeakMap = new WeakMap<Element, ElementEnhancementContainer>();
  
  Object.defineProperty(Element.prototype, 'enh', {
    get: function (this: Element) {
      return enhContainerWeakMap.getOrInsertComputed(this, () => new ElementEnhancementContainer(this));
    },
    enumerable: true,
    configurable: true,
  });
  
  /**
   * Adds 'set' property to Element prototype for symbol-based dependency injection
   * Returns a proxy that intercepts symbol property assignments
   */
  Object.defineProperty(Element.prototype, 'set', {
    get: function (this: Element) {
      const element = this;
      return new Proxy(
        {},
        {
          set: (_: any, prop: string | symbol, value: any) => {
            if (typeof prop === 'symbol') {
              // Get the registry from customElementRegistry (scoped or global)
              const registry = (element as any).customElementRegistry?.enhancementRegistry
                ?? (typeof customElements !== 'undefined' ? customElements.enhancementRegistry : undefined);
              
              if (registry) {
                const registryItem = registry.findBySymbol(prop);
                if (registryItem) {
                  const instanceMap = getInstanceMap();
                  const instances = instanceMap.getOrInsertComputed(element, () => new Map());
                  let instance = instances.get(registryItem);

                  if (!instance) {
                    const SpawnClass = registryItem.spawn;
                    
                    // Check canSpawn if it exists
                    if (typeof SpawnClass.canSpawn === 'function') {
                      const ctx = { config: registryItem };
                      if (!SpawnClass.canSpawn(element, ctx)) {
                        // canSpawn returned false, skip spawning
                        return true;
                      }
                    }
                    
                    // If target is an Element and registryItem has enhKey, pass element to constructor
                    if (registryItem.enhKey) {
                      const ctx = { config: registryItem };
                      const initVals = (element as any).enh?.[registryItem.enhKey] && 
                                      !((element as any).enh[registryItem.enhKey] instanceof SpawnClass)
                                      ? (element as any).enh[registryItem.enhKey]
                                      : undefined;
                      instance = new SpawnClass(element, ctx, initVals);
                    } else {
                      const ctx = { config: registryItem };
                      instance = new SpawnClass(element, ctx);
                    }
                    
                    instances.set(registryItem, instance);
                    
                    // If registryItem has enhKey, store on enh
                    if (registryItem.enhKey) {
                      if (!(element as any).enh) {
                        // This shouldn't happen since enh is a getter, but be safe
                        (element as any).enh = {};
                      }
                      (element as any).enh[registryItem.enhKey] = instance;
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
            }
            return true;
          },
        }
      );
    },
    enumerable: false,
    configurable: true,
  });
}

/**
 * Adds assignGingerly method to all objects via the Object prototype
 */
Object.defineProperty(Object.prototype, 'assignGingerly', {
  value: function <T extends object>(
    this: T,
    source: Record<string | symbol, any>,
    options?: IAssignGingerlyOptions
  ): T {
    // Auto-populate registry from customElementRegistry if this is an Element
    if (this instanceof Element && (!options || !options.registry)) {
      if (!options) options = {};
      options.registry = (this as any).customElementRegistry?.enhancementRegistry;
    }
    assignGingerly(this, source, options);
    return this;
  },
  writable: true,
  enumerable: false,
  configurable: true,
});

/**
 * Adds assignTentatively method to all objects via the Object prototype
 * Returns a reversal object that can undo the changes when passed to assignGingerly.
 */
Object.defineProperty(Object.prototype, 'assignTentatively', {
  value: function <T extends object>(
    this: T,
    source: Record<string | symbol, any>,
    options?: IAssignTentativelyOptions
  ): Record<string | symbol, any> {
    const reversal = options?.reversal ?? {};
    assignTentatively(this, source, { ...options, reversal });
    return reversal;
  },
  writable: true,
  enumerable: false,
  configurable: true,
});

export default assignGingerly;
