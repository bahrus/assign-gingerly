import assignGingerly, { EnhancementRegistry, ItemscopeRegistry, IAssignGingerlyOptions, getInstanceMap, INSTANCE_MAP_GUID } from './assignGingerly.js';
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
     * Alias for assignGingerly. Carefully merge properties from a source object into this object.
     * Supports nested paths with ?. notation and dependency injection via registry.
     * 
     * @param source - The source object to merge
     * @param options - Optional configuration with registry for dependency injection
     * @returns This object after merging
     * 
     * @example
     * const target = {};
     * target.assignTentatively({ '?.style?.height': '15px' });
     * console.log(target); // { style: { height: '15px' } }
     */
    assignTentatively(
      source: Record<string | symbol, any>,
      options?: IAssignGingerlyOptions
    ): this;
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
   * Get or spawn an instance for a registry item
   * @param registryItem - The registry item to get/spawn instance for
   * @param mountCtx - Optional context to pass to the spawned instance
   * @returns The spawned instance
   */
  get(registryItem: any, mountCtx?: any): any {
    const element = this.element;
    
    // Get the registry from customElementRegistry
    const registry = (element as any).customElementRegistry?.enhancementRegistry;
    
    if (!registry) {
      throw new Error('customElementRegistry.enhancementRegistry not available');
    }
    
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
            registryItem.allowUnprefixed || false,
            spawnContext
          );
        } catch (e) {
          console.error('Error parsing attributes:', e);
          throw e;
        }
      }
      
      // Check if there's an enhKey
      if (registryItem.enhKey) {
        const ctx = { config: registryItem, mountCtx };
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
        const ctx = { config: registryItem, mountCtx };
        instance = new SpawnClass(element, ctx, attrInitVals);
      }
      
      // Store in global instance map
      instances.set(registryItem, instance);
    }
    
    return instance;
  }

  /**
   * Dispose of an enhancement instance
   * @param registryItem - The registry item to dispose
   */
  dispose(registryItem: any): void {
    const element = this.element;
    
    // Get the instance map
    const instanceMap = getInstanceMap();
    if (!instanceMap.has(element)) {
      return; // No instances for this element
    }
    
    const instances = instanceMap.get(element)!;
    const spawnedInstance = instances.get(registryItem);
    
    if (!spawnedInstance) {
      return; // No instance for this registry item
    }
    
    // Call dispose lifecycle method if it exists
    const lifecycleKeys = normalizeLifecycleKeys(registryItem?.lifecycleKeys);
    const disposeKey = lifecycleKeys?.dispose;
    if (disposeKey && typeof spawnedInstance[disposeKey] === 'function') {
      spawnedInstance[disposeKey](registryItem);
    }
    
    // Remove from instance map
    instances.delete(registryItem);
    
    // Remove from enh container if it has an enhKey
    if (registryItem.enhKey) {
      const self = this as any;
      delete self[registryItem.enhKey];
    }
  }

  /**
   * Wait for an enhancement instance to be resolved
   * @param registryItem - The registry item to wait for
   * @param mountCtx - Optional context to pass to the spawned instance
   * @returns Promise that resolves with the spawned instance
   */
  async whenResolved(registryItem: any, mountCtx?: any): Promise<any> {
    const lifecycleKeys = normalizeLifecycleKeys(registryItem?.lifecycleKeys);
    const resolvedKey = lifecycleKeys?.resolved;
    
    if (resolvedKey === undefined) {
      throw new Error('Must specify resolved key in lifecycleKeys');
    }
    
    // Get or spawn the instance (pass mountCtx through)
    const spawnedInstance = this.get(registryItem, mountCtx);
    
    // Check if already resolved
    if ((spawnedInstance as any)[resolvedKey]) {
      return spawnedInstance;
    }
    
    // Check if instance is an EventTarget
    if (!(spawnedInstance instanceof EventTarget)) {
      throw new Error('Instance must be an EventTarget to use whenResolved');
    }
    
    // Lazy load waitForEvent
    const { waitForEvent } = await import('./waitForEvent.js');
    
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
 * This is an alias for assignGingerly
 */
Object.defineProperty(Object.prototype, 'assignTentatively', {
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

export default assignGingerly;
