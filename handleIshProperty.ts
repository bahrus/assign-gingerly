import type { IAssignGingerlyOptions, ItemscopeManagerConfig } from './types/assign-gingerly/types.js';

/**
 * Handle the 'ish' property assignment for HTMLElements with itemscope attributes.
 * This function validates the element, then defines or updates the 'ish' property.
 *
 * @param element - The HTMLElement to assign the 'ish' property to
 * @param value - The value to assign (any type)
 * @param options - Optional assignGingerly options
 * @param assignGingerlyFn - Reference to the assignGingerly function for recursive calls
 */
export async function handleIshProperty(
  element: HTMLElement,
  value: any,
  options: IAssignGingerlyOptions | undefined,
  assignGingerlyFn: (target: any, source: any, options?: IAssignGingerlyOptions) => any
): Promise<void> {
  // Validate itemscope attribute
  const itemscopeValue = element.getAttribute('itemscope');
  if (typeof itemscopeValue !== 'string' || itemscopeValue.length === 0) {
    throw new Error('Element must have itemscope attribute set to a non-empty string value');
  }

  // Get or create the 'ish' property on the element
  if (!('ish' in element)) {
    await defineIshProperty(element, itemscopeValue, options, assignGingerlyFn);
  }

  // Queue the value for assignment
  const ishDescriptor = Object.getOwnPropertyDescriptor(element, 'ish');
  if (ishDescriptor && ishDescriptor.set) {
    ishDescriptor.set.call(element, value);
  }
}

/**
 * Define the 'ish' property on an HTMLElement with itemscope attribute.
 * This function handles both immediate and lazy manager instantiation.
 * 
 * @param element - The HTMLElement to define the 'ish' property on
 * @param managerName - The name of the manager (from itemscope attribute)
 * @param options - Optional assignGingerly options
 * @param assignGingerlyFn - Reference to the assignGingerly function for recursive calls
 */
async function defineIshProperty(
  element: HTMLElement,
  managerName: string,
  options: IAssignGingerlyOptions | undefined,
  assignGingerlyFn: (target: any, source: any, options?: IAssignGingerlyOptions) => any
): Promise<void> {
  // Determine which registry to use
  const registry = (element as any).customElementRegistry?.itemscopeRegistry
    ?? (typeof customElements !== 'undefined' ? customElements.itemscopeRegistry : undefined);

  if (!registry) {
    throw new Error('ItemscopeRegistry not available');
  }

  // Check if manager is registered
  let config = registry.get(managerName);

  // If not registered, wait for registration
  if (!config) {
    const { waitForEvent } = await import('./utils/waitForEvent.js');
    await waitForEvent(registry, managerName);
    config = registry.get(managerName);
    
    if (!config) {
      throw new Error(`Manager "${managerName}" not found after registration event`);
    }
  }

  defineIshCore(element, config, options, assignGingerlyFn);
}

/**
 * Synchronously define the 'ish' property on an element, given an already-resolved
 * manager config. The manager is instantiated on the first set.
 *
 * Used directly by builtIns.itemscopeTree, which already holds the config and must
 * stay synchronous.
 *
 * @param element - The HTMLElement to define the 'ish' property on
 * @param config - The resolved manager configuration
 * @param options - Optional assignGingerly options
 * @param assignGingerlyFn - Reference to the assignGingerly function for recursive calls
 */
export function defineIshCore(
  element: HTMLElement,
  config: ItemscopeManagerConfig,
  options: IAssignGingerlyOptions | undefined,
  assignGingerlyFn: (target: any, source: any, options?: IAssignGingerlyOptions) => any
): void {
  // Create manager instance
  let managerInstance: any = null;
  const valueQueue: any[] = [];

  // Define the 'ish' property
  Object.defineProperty(element, 'ish', {
    get() {
      return managerInstance;
    },
    set(newValue: any) {
      // If setting the same instance, do nothing
      // (guarded so a first value of null doesn't match the not-yet-created instance)
      if (managerInstance !== null && newValue === managerInstance) {
        return;
      }

      // Queue the value
      valueQueue.push(newValue);

      // If manager not yet instantiated, create it
      if (!managerInstance) {
        // Merge all queued values for initVals
        const initVals = Object.assign({}, ...valueQueue);
        managerInstance = new config.manager(element, initVals);
        valueQueue.length = 0; // Clear queue
      } else {
        // Process queue asynchronously
        (async () => {
          while (valueQueue.length > 0) {
            const queuedValue = valueQueue.shift();
            // Nothing to merge (assignGingerly would throw on null / undefined)
            if (queuedValue == null) continue;
            await assignGingerlyFn(managerInstance, queuedValue, options);
          }
        })();
      }
    },
    enumerable: true,
    configurable: true,
  });
}
