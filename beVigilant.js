/**
 * beVigilant.js — MutationObserver-based reactive inference for newly added elements.
 *
 * Dynamically imported when `inferredAssignments.beVigilant: true` is set.
 * Watches for new [itemprop] elements and attribute changes, applying inferred
 * assignments from the live `from` object.
 *
 * Requires an AbortSignal for cleanup (disconnects the observer on abort).
 */
import { Infer } from './inferencer/inferencer.js';
import { withScopePerimeter } from './inferencer/withScopePerimeter.js';
import { registerInCache } from './resolveIdRef.js';

/**
 * Set up a MutationObserver that watches for new [itemprop] elements
 * and applies inferred assignments from the live `from` object.
 */
export function setupVigilantObserver(target, from, config, signal) {
    const keys = config.byItemprop === true ? null : new Set(config.byItemprop);

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                for (const node of mutation.addedNodes) {
                    if (!(node instanceof Element)) continue;
                    processElement(node, from, keys, target);
                    const nested = node.querySelectorAll('[itemprop]');
                    for (const el of nested) {
                        processElement(el, from, keys, target);
                    }
                }
            } else if (mutation.type === 'attributes' && mutation.target instanceof Element) {
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

    signal.addEventListener('abort', () => observer.disconnect(), { once: true });
}

function processElement(element, from, keys, scopeRoot) {
    const itemprop = element.getAttribute('itemprop');
    if (!itemprop) return;
    if (keys && !keys.has(itemprop)) return;
    if (!(itemprop in from)) return;
    if (!withScopePerimeter(scopeRoot, element, '[itemscope]')) return;

    const infer = new Infer(element, itemprop);
    infer.value = from[itemprop];

    registerInCache(scopeRoot, itemprop, element);
}
