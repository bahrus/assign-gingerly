/**
 * builtIns.lazyLoad handler for assignFrom.
 * 
 * Conditionally clones a template into a target element, using comment markers
 * to track the inserted content. Supports show/hide and show/remove modes.
 * 
 * This handler is auto-loaded by processHandlerCommands when `do: 'builtIns.lazyLoad'`
 * is encountered — no explicit import is needed.
 * 
 * @example
 * assignFrom(document.body, {
 *     '?.querySelector?..mainView =>': {
 *         do: 'builtIns.lazyLoad',
 *         resolve: {
 *             if: '?.isHappy',
 *             instantiate: 'globalThis://happyMood',
 *         }
 *     }
 * }, { withMethods: ['querySelector'], from: myVM });
 */

import type { AssignFromHandler } from '../assignFrom.js';
import type { LazyLoadResolvedParams, LazyLoadInstantiatedContext } from '../types/assign-gingerly/types.js';
import { withTransition, ensureHideStyle, DEFAULT_HIDE_CLASS } from '../transitionHelper.js';
import { findMarkers, createMarkers, getNodesBetweenMarkers, MARKER_START_PREFIX, MARKER_END } from '../markerUtils.js';

export type { LazyLoadResolvedParams, LazyLoadInstantiatedContext };

/**
 * Get the marker name from a template element (uses its id).
 */
function getMarkerName(templateEl: any): string {
    if (templateEl instanceof HTMLTemplateElement) {
        return templateEl.id || 'anonymous';
    }
    if (typeof templateEl === 'string') {
        return templateEl;
    }
    return 'anonymous';
}

/**
 * LazyLoadHandler — built-in handler for conditional template instantiation.
 * 
 * Exported so it can be subclassed for custom behavior.
 */
export class LazyLoadHandler implements AssignFromHandler {
    config: any;

    constructor(config: any) {
        this.config = config;
    }

    async assign(lhsTarget: any, resolvedParams: LazyLoadResolvedParams): Promise<void> {
        const {
            if: condition,
            instantiate,
            method = 'appendChild',
            forget = false,
            transitional = false,
            hideClass = DEFAULT_HIDE_CLASS,
        } = resolvedParams;

        if (!(lhsTarget instanceof Element)) {
            throw new Error('builtIns.lazyLoad: lhsTarget must be a DOM Element');
        }

        const name = getMarkerName(instantiate);

        // Find or create markers
        let [startMarker, endMarker] = findMarkers(lhsTarget, name);

        if (condition) {
            // SHOW
            if (startMarker && endMarker) {
                // Markers exist — check if content is hidden or removed
                const nodes = getNodesBetweenMarkers(startMarker, endMarker);
                if (nodes.length > 0) {
                    // Content exists — show it
                    withTransition(startMarker, 'show', transitional, () => {
                        for (const node of nodes) {
                            if (node instanceof Element) {
                                if (transitional) {
                                    node.classList.remove(hideClass);
                                } else {
                                    node.removeAttribute('hidden');
                                }
                            }
                        }
                    });
                } else {
                    // Content was removed (forget mode) — re-clone
                    if (transitional) {
                        ensureHideStyle(lhsTarget.getRootNode());
                        withTransition(startMarker, 'show', true, () => {
                            // cloneAndInsert is async but the transition callback is sync
                            // For transitions with clone, we insert synchronously
                            this.cloneAndInsertSync(instantiate, startMarker!, endMarker!, lhsTarget, resolvedParams);
                        });
                    } else {
                        await this.cloneAndInsert(instantiate, startMarker, endMarker, lhsTarget, resolvedParams);
                    }
                }
            } else {
                // No markers — first time. Create markers and clone template.
                [startMarker, endMarker] = createMarkers(lhsTarget, name, method);
                if (transitional) {
                    ensureHideStyle(lhsTarget.getRootNode());
                    withTransition(startMarker, 'show', true, () => {
                        this.cloneAndInsertSync(instantiate, startMarker!, endMarker!, lhsTarget, resolvedParams);
                    });
                } else {
                    await this.cloneAndInsert(instantiate, startMarker, endMarker, lhsTarget, resolvedParams);
                }
            }
        } else {
            // HIDE or REMOVE
            if (startMarker && endMarker) {
                const nodes = getNodesBetweenMarkers(startMarker, endMarker);
                if (nodes.length === 0) return;

                if (forget) {
                    // Remove nodes entirely (markers persist for re-insertion)
                    withTransition(startMarker, 'hide', transitional, () => {
                        for (const node of nodes) {
                            node.parentNode?.removeChild(node);
                        }
                    });
                } else {
                    // Hide nodes
                    withTransition(startMarker, 'hide', transitional, () => {
                        for (const node of nodes) {
                            if (node instanceof Element) {
                                if (transitional) {
                                    ensureHideStyle(lhsTarget.getRootNode(), hideClass);
                                    node.classList.add(hideClass);
                                } else {
                                    node.setAttribute('hidden', '');
                                }
                            }
                        }
                    });
                }
            }
            // If no markers exist and condition is false, do nothing (never loaded)
        }
    }

    /**
     * Clone a template and insert its content between the markers (synchronous version).
     * Used inside view transition callbacks which must be synchronous.
     * Does not call async hooks (onCloneInserted, onInstantiated).
     */
    protected cloneAndInsertSync(
        templateEl: any,
        startMarker: Comment,
        endMarker: Comment,
        lhsTarget: Element,
        resolvedParams: LazyLoadResolvedParams
    ): Node[] {
        let content: DocumentFragment;

        if (templateEl instanceof HTMLTemplateElement) {
            content = templateEl.content.cloneNode(true) as DocumentFragment;
        } else if (templateEl instanceof DocumentFragment) {
            content = templateEl.cloneNode(true) as DocumentFragment;
        } else {
            throw new Error(
                `builtIns.lazyLoad: instantiate must resolve to an HTMLTemplateElement or DocumentFragment`
            );
        }

        const nodes = Array.from(content.childNodes);
        endMarker.parentNode!.insertBefore(content, endMarker);
        return nodes;
    }

    /**
     * Clone a template and insert its content between the markers.
     * Calls onCloneInserted hook and onInstantiated callback after insertion.
     */
    protected async cloneAndInsert(
        templateEl: any,
        startMarker: Comment,
        endMarker: Comment,
        lhsTarget: Element,
        resolvedParams: LazyLoadResolvedParams
    ): Promise<Node[]> {
        let content: DocumentFragment;

        if (templateEl instanceof HTMLTemplateElement) {
            content = templateEl.content.cloneNode(true) as DocumentFragment;
        } else if (templateEl instanceof DocumentFragment) {
            content = templateEl.cloneNode(true) as DocumentFragment;
        } else {
            throw new Error(
                `builtIns.lazyLoad: instantiate must resolve to an HTMLTemplateElement or DocumentFragment`
            );
        }

        // Capture nodes before insertion (childNodes empties after insertBefore)
        const nodes = Array.from(content.childNodes);

        // Insert before endMarker
        endMarker.parentNode!.insertBefore(content, endMarker);

        // Call protected hook (for subclass overrides)
        await this.onCloneInserted(nodes, lhsTarget, resolvedParams);

        // Call onInstantiated callback if provided (resolved from VM)
        if (resolvedParams.onInstantiated && typeof resolvedParams.onInstantiated === 'function') {
            const ctx: LazyLoadInstantiatedContext = {
                nodes,
                target: lhsTarget,
                config: this.config,
                resolvedParams
            };
            await resolvedParams.onInstantiated(ctx);
        }

        return nodes;
    }

    /**
     * Hook called after template content is cloned and inserted.
     * Override in subclasses for custom post-clone logic.
     * 
     * @param nodes - The inserted child nodes
     * @param lhsTarget - The target element
     * @param resolvedParams - The resolved parameters
     */
    protected async onCloneInserted(
        nodes: Node[],
        lhsTarget: Element,
        resolvedParams: LazyLoadResolvedParams
    ): Promise<void> {
        // No-op by default. Subclasses override.
    }
}
