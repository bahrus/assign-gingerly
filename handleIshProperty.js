/**
 * Handle the 'ish' property assignment for HTMLElements with itemscope attributes.
 * This function validates the element, then defines or updates the 'ish' property.
 *
 * @param element - The HTMLElement to assign the 'ish' property to
 * @param value - The value to assign (any type)
 * @param options - Optional assignGingerly options
 * @param assignGingerlyFn - Reference to the assignGingerly function for recursive calls
 */
export async function handleIshProperty(element, value, options, assignGingerlyFn) {
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
async function defineIshProperty(element, managerName, options, assignGingerlyFn) {
    // Determine which registry to use
    const registry = element.customElementRegistry?.itemscopeRegistry
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
    // Another assignment waiting on the same registration may have defined it already;
    // redefining would discard that instance.
    if ('ish' in element)
        return;
    defineIshCore(element, config, options, assignGingerlyFn);
}
/**
 * Report an error from an async `onAssigned` without stopping the queue:
 * log it, and rethrow asynchronously so it stays visible.
 */
function reportAsync(err) {
    console.error('Error in onAssigned:', err);
    setTimeout(() => { throw err; }, 0);
}
function isThenable(value) {
    return value != null && typeof value.then === 'function';
}
/**
 * Synchronously define the 'ish' property on an element, given an already-resolved
 * manager config. The manager is instantiated on the first set.
 *
 * Each set is applied synchronously, in the setter:
 * - If the manager class has a static `onAssigned(instance, value, ctx)`, the first set
 *   constructs `new Manager(element)` (no initVals) and every set, including the first,
 *   calls `onAssigned`.
 * - Otherwise the first set constructs `new Manager(element, Object.assign({}, value))`
 *   and later sets merge via `assignGingerly` (`null` / `undefined` are skipped).
 *
 * If `onAssigned` returns a thenable, later values are queued and applied in order once
 * it settles — so async handlers never interleave. No `await` happens otherwise.
 *
 * Used directly by builtIns.itemscopeTree, which already holds the config and must
 * stay synchronous.
 *
 * @param element - The HTMLElement to define the 'ish' property on
 * @param config - The resolved manager configuration
 * @param options - Optional assignGingerly options
 * @param assignGingerlyFn - Reference to the assignGingerly function for recursive calls
 */
export function defineIshCore(element, config, options, assignGingerlyFn) {
    const { manager } = config;
    const { onAssigned } = manager;
    let managerInstance = null;
    // Values that arrived while an async onAssigned was in flight
    const valueQueue = [];
    let pending = false;
    /**
     * Apply one value synchronously. Returns onAssigned's result (possibly a thenable).
     */
    function apply(value) {
        if (managerInstance === null) {
            if (onAssigned) {
                managerInstance = new manager(element);
                return onAssigned.call(manager, managerInstance, value, { element, initial: true, options });
            }
            managerInstance = new manager(element, Object.assign({}, value));
            return;
        }
        if (onAssigned) {
            return onAssigned.call(manager, managerInstance, value, { element, initial: false, options });
        }
        // Nothing to merge (assignGingerly would throw on null / undefined)
        if (value == null)
            return;
        assignGingerlyFn(managerInstance, value, options);
    }
    /**
     * Single drain loop: wait for the in-flight onAssigned, then apply queued values in
     * order, waiting again whenever one of them returns a thenable.
     */
    async function drain(inFlight) {
        let current = inFlight;
        while (current) {
            try {
                await current;
            }
            catch (err) {
                reportAsync(err);
            }
            current = undefined;
            while (!current && valueQueue.length > 0) {
                try {
                    const result = apply(valueQueue.shift());
                    if (isThenable(result))
                        current = result;
                }
                catch (err) {
                    reportAsync(err);
                }
            }
        }
        pending = false;
    }
    // Define the 'ish' property
    Object.defineProperty(element, 'ish', {
        get() {
            return managerInstance;
        },
        set(newValue) {
            // If setting the same instance, do nothing
            // (guarded so a first value of null doesn't match the not-yet-created instance)
            if (managerInstance !== null && newValue === managerInstance) {
                return;
            }
            // An async onAssigned is in flight: preserve order
            if (pending) {
                valueQueue.push(newValue);
                return;
            }
            // Synchronous fast path (errors propagate out of the assignment)
            const result = apply(newValue);
            if (isThenable(result)) {
                pending = true;
                drain(result);
            }
        },
        enumerable: true,
        configurable: true,
    });
}
