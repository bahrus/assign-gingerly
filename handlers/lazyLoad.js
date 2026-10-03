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
import { withTransition, ensureHideStyle, DEFAULT_HIDE_CLASS } from '../transitionHelper.js';
import { findMarkers, createMarkers, getNodesBetweenMarkers, findMarkersSibling, createMarkersSibling } from '../markerUtils.js';
import { assignFrom } from '../assignFrom.js';
/**
 * Get the marker name from a template element (uses its id).
 */
function getMarkerName(templateEl) {
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
export class LazyLoadHandler {
    config;
    _options;
    _permissionProcessor;
    static #markerCounter = 0;
    constructor(config) {
        this.config = config;
    }
    async assign(lhsTarget, resolvedParams, options, permissionProcessor) {
        this._options = options; // Store for applyAssign access
        this._permissionProcessor = permissionProcessor;
        const { if: condition, instantiate, method = 'appendChild', forget = false, transitional = false, hideClass = DEFAULT_HIDE_CLASS, hideCss, markerName, toggleInert = false, toggleDisabled = false, placeholder, } = resolvedParams;
        if (!(lhsTarget instanceof Element)) {
            throw new Error('builtIns.lazyLoad: lhsTarget must be a DOM Element');
        }
        // Determine marker name — auto-generate for 'after' mode if would be 'anonymous'
        let name = markerName ?? getMarkerName(instantiate) ?? (lhsTarget.id || 'anonymous');
        if (name === 'anonymous' && method === 'after') {
            // Check for previously stored name on the anchor
            const stored = lhsTarget.dataset?.agMarker;
            if (stored) {
                name = stored;
            }
            else {
                name = `_ag_${LazyLoadHandler.#markerCounter++}`;
                if (lhsTarget.dataset) {
                    lhsTarget.dataset.agMarker = name;
                }
            }
        }
        // Find or create markers based on method
        let [startMarker, endMarker] = method === 'after'
            ? findMarkersSibling(lhsTarget, name)
            : findMarkers(lhsTarget, name);
        if (condition) {
            // SHOW
            if (startMarker && endMarker) {
                const nodes = getNodesBetweenMarkers(startMarker, endMarker);
                if (nodes.length > 0) {
                    // Content exists — show it
                    withTransition(startMarker, 'show', transitional, () => {
                        this.showNodes(nodes, transitional, hideClass, toggleInert, toggleDisabled);
                    });
                }
                else {
                    // Content was removed (forget mode) — re-clone
                    if (transitional) {
                        ensureHideStyle(lhsTarget.getRootNode(), hideClass, hideCss);
                        withTransition(startMarker, 'show', true, () => {
                            this.cloneAndInsertSync(instantiate, startMarker, endMarker, lhsTarget, resolvedParams);
                        });
                    }
                    else {
                        await this.cloneAndInsert(instantiate, startMarker, endMarker, lhsTarget, resolvedParams);
                    }
                }
            }
            else {
                // No markers — first time. Create markers and clone template.
                // Remove placeholder content if specified
                if (placeholder) {
                    const [phStart, phEnd] = findMarkers(lhsTarget, placeholder);
                    if (phStart && phEnd) {
                        const phNodes = getNodesBetweenMarkers(phStart, phEnd);
                        for (const node of phNodes) {
                            node.parentNode?.removeChild(node);
                        }
                    }
                }
                if (method === 'after') {
                    [startMarker, endMarker] = createMarkersSibling(lhsTarget, name);
                }
                else {
                    [startMarker, endMarker] = createMarkers(lhsTarget, name, method);
                }
                if (transitional) {
                    ensureHideStyle(lhsTarget.getRootNode(), hideClass, hideCss);
                    withTransition(startMarker, 'show', true, () => {
                        this.cloneAndInsertSync(instantiate, startMarker, endMarker, lhsTarget, resolvedParams);
                    });
                }
                else {
                    await this.cloneAndInsert(instantiate, startMarker, endMarker, lhsTarget, resolvedParams);
                }
            }
        }
        else {
            // HIDE or REMOVE
            if (startMarker && endMarker) {
                const nodes = getNodesBetweenMarkers(startMarker, endMarker);
                if (nodes.length === 0)
                    return;
                if (forget) {
                    withTransition(startMarker, 'hide', transitional, () => {
                        for (const node of nodes) {
                            node.parentNode?.removeChild(node);
                        }
                    });
                }
                else {
                    withTransition(startMarker, 'hide', transitional, () => {
                        this.hideNodes(nodes, lhsTarget, transitional, hideClass, hideCss, toggleInert, toggleDisabled);
                    });
                }
            }
        }
    }
    /**
     * Show nodes — remove hidden/class and restore inert/disabled state.
     */
    showNodes(nodes, transitional, hideClass, toggleInert, toggleDisabled) {
        for (const node of nodes) {
            if (node instanceof Element) {
                if (transitional) {
                    node.classList.remove(hideClass);
                }
                else {
                    node.removeAttribute('hidden');
                }
                if (toggleInert) {
                    node.removeAttribute('inert');
                }
                if (toggleDisabled && 'disabled' in node) {
                    node.disabled = false;
                }
            }
        }
    }
    /**
     * Hide nodes — add hidden/class and set inert/disabled state.
     */
    hideNodes(nodes, lhsTarget, transitional, hideClass, hideCss, toggleInert, toggleDisabled) {
        for (const node of nodes) {
            if (node instanceof Element) {
                if (transitional) {
                    ensureHideStyle(lhsTarget.getRootNode(), hideClass, hideCss);
                    node.classList.add(hideClass);
                }
                else {
                    node.setAttribute('hidden', '');
                }
                if (toggleInert) {
                    node.setAttribute('inert', '');
                }
                if (toggleDisabled && 'disabled' in node) {
                    node.disabled = true;
                }
            }
        }
    }
    /**
     * Clone a template and insert its content between the markers (synchronous version).
     * Used inside view transition callbacks which must be synchronous.
     * Does not call async hooks (onCloneInserted, onInstantiated).
     */
    cloneAndInsertSync(templateEl, startMarker, endMarker, lhsTarget, resolvedParams) {
        let content;
        if (templateEl instanceof HTMLTemplateElement) {
            content = templateEl.content.cloneNode(true);
        }
        else if (templateEl instanceof DocumentFragment) {
            content = templateEl.cloneNode(true);
        }
        else {
            throw new Error(`builtIns.lazyLoad: instantiate must resolve to an HTMLTemplateElement or DocumentFragment`);
        }
        const nodes = Array.from(content.childNodes);
        // Apply assignments to cloned content before insertion
        this.applyAssign(nodes, resolvedParams);
        endMarker.parentNode.insertBefore(content, endMarker);
        return nodes;
    }
    /**
     * Clone a template and insert its content between the markers.
     * Calls onCloneInserted hook and onInstantiated callback after insertion.
     */
    async cloneAndInsert(templateEl, startMarker, endMarker, lhsTarget, resolvedParams) {
        let content;
        if (templateEl instanceof HTMLTemplateElement) {
            content = templateEl.content.cloneNode(true);
        }
        else if (templateEl instanceof DocumentFragment) {
            content = templateEl.cloneNode(true);
        }
        else {
            throw new Error(`builtIns.lazyLoad: instantiate must resolve to an HTMLTemplateElement or DocumentFragment`);
        }
        // Capture nodes before insertion (childNodes empties after insertBefore)
        const nodes = Array.from(content.childNodes);
        // Apply assignments to cloned content before insertion
        this.applyAssign(nodes, resolvedParams);
        // Insert before endMarker
        endMarker.parentNode.insertBefore(content, endMarker);
        // Call protected hook (for subclass overrides)
        await this.onCloneInserted(nodes, lhsTarget, resolvedParams);
        // Call onInstantiated callback if provided (resolved from VM)
        if (resolvedParams.onInstantiated && typeof resolvedParams.onInstantiated === 'function') {
            const ctx = {
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
     * Apply assignFrom to cloned nodes based on the `assign` config.
     * Supports single-element and multi-element (configs array) templates.
     */
    applyAssign(nodes, resolvedParams) {
        const assign = resolvedParams.assign;
        if (!assign)
            return;
        const elements = nodes.filter(n => n instanceof Element);
        if (elements.length === 0)
            return;
        const from = this._options?.from ?? {};
        if (assign.configs && Array.isArray(assign.configs)) {
            const len = Math.min(elements.length, assign.configs.length);
            for (let j = 0; j < len; j++) {
                const cfg = assign.configs[j];
                assignFrom(elements[j], cfg.toClone ?? {}, { from, ...cfg.withOptions }, this._permissionProcessor);
            }
        }
        else if (assign.toClone) {
            assignFrom(elements[0], assign.toClone, { from, ...assign.withOptions }, this._permissionProcessor);
        }
    }
    /**
     * Hook called after template content is cloned and inserted.
     * Override in subclasses for custom post-clone logic.
     *
     * @param nodes - The inserted child nodes
     * @param lhsTarget - The target element
     * @param resolvedParams - The resolved parameters
     */
    async onCloneInserted(nodes, lhsTarget, resolvedParams) {
        // No-op by default. Subclasses override.
    }
}
