/**
 * builtIns.lazyLoad handler for assignFrom.
 * 
 * Conditionally clones a template into a target element, using comment markers
 * to track the inserted content. Supports show/hide and show/remove modes.
 * 
 * Import this module to register the handler:
 *   import 'assign-gingerly/handlers/lazyLoad.js';
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

import { defineHandler } from '../assignFrom.js';
import type { AssignFromHandler } from '../assignFrom.js';

const MARKER_START_PREFIX = '?start name="';
const MARKER_END = '?end';

/**
 * Context passed to onInstantiated callbacks.
 */
export interface LazyLoadInstantiatedContext {
    /** The inserted child nodes */
    nodes: Node[];
    /** The target element containing the markers */
    target: Element;
    /** The full handler config */
    config: any;
    /** The resolved parameters */
    resolvedParams: Record<string, any>;
}

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
 * Find existing start/end comment markers in a target element.
 * Returns [startMarker, endMarker] or [null, null] if not found.
 */
function findMarkers(target: Element, name: string): [Comment | null, Comment | null] {
    const startText = `${MARKER_START_PREFIX}${name}"`;
    let startMarker: Comment | null = null;
    let endMarker: Comment | null = null;

    const walker = document.createTreeWalker(target, NodeFilter.SHOW_COMMENT);
    let node: Comment | null;
    while ((node = walker.nextNode() as Comment | null)) {
        if (!startMarker && node.data === startText) {
            startMarker = node;
        } else if (startMarker && !endMarker && node.data === MARKER_END) {
            endMarker = node;
            break;
        }
    }

    return [startMarker, endMarker];
}

/**
 * Create start/end markers and insert them into the target.
 */
function createMarkers(target: Element, name: string, method: string): [Comment, Comment] {
    const startMarker = document.createComment(`${MARKER_START_PREFIX}${name}"`);
    const endMarker = document.createComment(MARKER_END);

    if (method === 'prepend') {
        target.prepend(endMarker);
        target.prepend(startMarker);
    } else {
        // Default: appendChild
        target.appendChild(startMarker);
        target.appendChild(endMarker);
    }

    return [startMarker, endMarker];
}

/**
 * Get all nodes between start and end markers.
 */
function getNodesBetweenMarkers(start: Comment, end: Comment): Node[] {
    const nodes: Node[] = [];
    let current: Node | null = start.nextSibling;
    while (current && current !== end) {
        nodes.push(current);
        current = current.nextSibling;
    }
    return nodes;
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

    async assign(lhsTarget: any, resolvedParams: Record<string, any>): Promise<void> {
        const {
            if: condition,
            instantiate,
            method = 'appendChild',
            forget = false
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
                    // Content exists — remove hidden attribute
                    for (const node of nodes) {
                        if (node instanceof Element) {
                            node.removeAttribute('hidden');
                        }
                    }
                } else {
                    // Content was removed (forget mode) — re-clone
                    await this.cloneAndInsert(instantiate, startMarker, endMarker, lhsTarget, resolvedParams);
                }
            } else {
                // No markers — first time. Create markers and clone template.
                [startMarker, endMarker] = createMarkers(lhsTarget, name, method);
                await this.cloneAndInsert(instantiate, startMarker, endMarker, lhsTarget, resolvedParams);
            }
        } else {
            // HIDE or REMOVE
            if (startMarker && endMarker) {
                const nodes = getNodesBetweenMarkers(startMarker, endMarker);
                if (forget) {
                    // Remove nodes entirely (markers persist for re-insertion)
                    for (const node of nodes) {
                        node.parentNode?.removeChild(node);
                    }
                } else {
                    // Hide nodes
                    for (const node of nodes) {
                        if (node instanceof Element) {
                            node.setAttribute('hidden', '');
                        }
                    }
                }
            }
            // If no markers exist and condition is false, do nothing (never loaded)
        }
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
        resolvedParams: Record<string, any>
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
        resolvedParams: Record<string, any>
    ): Promise<void> {
        // No-op by default. Subclasses override.
    }
}

// Self-register on import
defineHandler('builtIns.lazyLoad', LazyLoadHandler);
