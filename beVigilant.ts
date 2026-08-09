/**
 * beVigilant.ts — MutationObserver-based reactive inference for newly added elements.
 * 
 * Dynamically imported when `inferredAssignments.beVigilant: true` is set.
 * Watches for new [itemprop] elements and attribute changes, applying inferred
 * assignments from the live `from` object.
 * 
 * Requires an AbortSignal for cleanup (disconnects the observer on abort).
 */

import { Infer } from './inferencer/inferencer.js';
import { withScopePerimeter } from './inferencer/withScopePerimeter.js';
import { registerInCache } from './resolve/resolveIdRef.js';

/**
 * Set up a MutationObserver that watches for new [itemprop] elements
 * and applies inferred assignments from the live `from` object.
 * 
 * @param target - The DOM element to observe
 * @param from - The live source object (read at observation time for current values)
 * @param config - The inferredAssignments config (byItemprop keys)
 * @param signal - AbortSignal for cleanup (required)
 */
export function setupVigilantObserver(
    target: Element,
    from: any,
    config: { byItemprop?: string[] | true },
    signal: AbortSignal
): void {
    const keys = config.byItemprop === true ? null : new Set(config.byItemprop);

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                // Process added nodes and their descendants
                for (const node of mutation.addedNodes) {
                    if (!(node instanceof Element)) continue;
                    // Check the added element itself
                    processElement(node, from, keys, target);
                    // Check descendants (respecting scope perimeter)
                    const nested = node.querySelectorAll('[itemprop]');
                    for (const el of nested) {
                        processElement(el as Element, from, keys, target);
                    }
                }
            } else if (mutation.type === 'attributes' && mutation.target instanceof Element) {
                // itemprop attribute was added or changed on an existing element
                processElement(mutation.target, from, keys, target);
            }
        }
    });

    observer.observe(target, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['itemprop']
    });

    // Cleanup on abort
    signal.addEventListener('abort', () => observer.disconnect(), { once: true });
}

/**
 * Process a single element: check if it matches, apply inferred value, cache it.
 */
function processElement(
    element: Element,
    from: any,
    keys: Set<string> | null,
    scopeRoot: Element
): void {
    const itemprop = element.getAttribute('itemprop');
    if (!itemprop) return;
    if (keys && !keys.has(itemprop)) return;
    if (!(itemprop in from)) return;
    if (!withScopePerimeter(scopeRoot, element, '[itemscope]')) return;

    // Set value via inferencer
    const infer = new Infer(element, itemprop);
    infer.value = from[itemprop];

    // Cache for future fast access
    registerInCache(scopeRoot, itemprop, element);
}
