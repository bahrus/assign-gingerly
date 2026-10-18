const KINDS = ['enhancementRegistry', 'itemscopeRegistry', 'featuresRegistry'];
/** `registry` option objects already checked, so the shape is validated once per object. */
const checked = new WeakSet();
/**
 * The `registry` option, checked: a CustomElementRegistry, or a plain object with (some of)
 * `enhancementRegistry`, `itemscopeRegistry` and `featuresRegistry`. Anything else, such as
 * an EnhancementRegistry passed directly (the former shape), throws.
 */
export function registryOption(options) {
    const registry = options?.registry;
    if (registry == null)
        return undefined;
    if (typeof registry === 'object' && checked.has(registry))
        return registry;
    const isElementRegistry = typeof CustomElementRegistry !== 'undefined' && registry instanceof CustomElementRegistry;
    const prototype = typeof registry === 'object' ? Object.getPrototypeOf(registry) : undefined;
    const isPlain = (prototype === Object.prototype || prototype === null)
        && Object.keys(registry).every(key => KINDS.includes(key));
    if (!isElementRegistry && !isPlain) {
        throw new Error('The "registry" option takes { enhancementRegistry?, itemscopeRegistry?, featuresRegistry? } '
            + '(or a CustomElementRegistry). An EnhancementRegistry goes in registry.enhancementRegistry: '
            + '{ registry: { enhancementRegistry: myRegistry } }.');
    }
    checked.add(registry);
    return registry;
}
/**
 * The registry of one kind for a call: the `registry` option's first, then each target's
 * `customElementRegistry` (in order; a shadow root may carry a scoped one), then `customElements`.
 */
export function resolveRegistry(kind, options, ...targets) {
    const local = registryOption(options)?.[kind];
    if (local)
        return local;
    for (const target of targets) {
        const scoped = target?.customElementRegistry?.[kind];
        if (scoped)
            return scoped;
    }
    return typeof customElements !== 'undefined' ? customElements[kind] : undefined;
}
