/**
 * Get the itemscope host element for a given element.
 * This function finds the closest element with an itemscope attribute and waits for it to be ready.
 *
 * @param el - The element to start searching from
 * @returns The itemscope host element, or null if none found
 */
export async function getHost(el) {
    const itemScopeHost = el.closest('[itemscope]');
    if (itemScopeHost) {
        const { localName } = itemScopeHost;
        // If it's a custom element, wait for it to be defined
        if (localName.includes('-')) {
            const registry = itemScopeHost.customElementRegistry ?? customElements;
            await registry.whenDefined(localName);
            return itemScopeHost;
        }
        else {
            // Check if itemscope specifies a value (manager name)
            const itemscopeValue = itemScopeHost.getAttribute('itemscope');
            if (itemscopeValue && itemscopeValue.length > 0) {
                // Wait for the manager to be defined in the itemscope registry
                const registry = itemScopeHost.customElementRegistry?.itemscopeRegistry
                    ?? (typeof customElements !== 'undefined' ? customElements.itemscopeRegistry : undefined);
                if (registry) {
                    await registry.whenDefined(itemscopeValue);
                }
            }
            return itemScopeHost;
        }
    }
    else {
        // No itemscope host found in the light DOM
        // Check if we're inside a shadow root and get the shadow host
        const rootNode = el.getRootNode();
        // Check if it's a shadow root (has a host property)
        if (rootNode && 'host' in rootNode && rootNode.host) {
            const host = rootNode.host;
            const { localName } = host;
            // If the host is a custom element, wait for it to be defined
            if (localName.includes('-')) {
                const registry = host.customElementRegistry ?? customElements;
                await registry.whenDefined(localName);
            }
            return host;
        }
        // Not in a shadow root either
        return null;
    }
}
export default getHost;
