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
const MARKER_START_PREFIX = '?start name="';
const MARKER_END = '?end';
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
 * Find existing start/end comment markers in a target element.
 * Returns [startMarker, endMarker] or [null, null] if not found.
 */
function findMarkers(target, name) {
    const startText = `${MARKER_START_PREFIX}${name}"`;
    let startMarker = null;
    let endMarker = null;
    const walker = document.createTreeWalker(target, NodeFilter.SHOW_COMMENT);
    let node;
    while ((node = walker.nextNode())) {
        if (!startMarker && node.data === startText) {
            startMarker = node;
        }
        else if (startMarker && !endMarker && node.data === MARKER_END) {
            endMarker = node;
            break;
        }
    }
    return [startMarker, endMarker];
}
/**
 * Create start/end markers and insert them into the target.
 */
function createMarkers(target, name, method) {
    const startMarker = document.createComment(`${MARKER_START_PREFIX}${name}"`);
    const endMarker = document.createComment(MARKER_END);
    if (method === 'prepend') {
        target.prepend(endMarker);
        target.prepend(startMarker);
    }
    else {
        target.appendChild(startMarker);
        target.appendChild(endMarker);
    }
    return [startMarker, endMarker];
}
/**
 * Get all nodes between start and end markers.
 */
function getNodesBetweenMarkers(start, end) {
    const nodes = [];
    let current = start.nextSibling;
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
export class LazyLoadHandler {
    config;
    constructor(config) {
        this.config = config;
    }
    async assign(lhsTarget, resolvedParams) {
        const { if: condition, instantiate, method = 'appendChild', forget = false, transitional = false, hideClass = DEFAULT_HIDE_CLASS } = resolvedParams;
        if (!(lhsTarget instanceof Element)) {
            throw new Error('builtIns.lazyLoad: lhsTarget must be a DOM Element');
        }
        const name = getMarkerName(instantiate);
        let [startMarker, endMarker] = findMarkers(lhsTarget, name);
        if (condition) {
            if (startMarker && endMarker) {
                const nodes = getNodesBetweenMarkers(startMarker, endMarker);
                if (nodes.length > 0) {
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
                }
                else {
                    if (transitional) {
                        ensureHideStyle(lhsTarget.getRootNode());
                        withTransition(startMarker, 'show', true, () => {
                            this.cloneAndInsertSync(instantiate, startMarker, endMarker, lhsTarget, resolvedParams);
                        });
                    } else {
                        await this.cloneAndInsert(instantiate, startMarker, endMarker, lhsTarget, resolvedParams);
                    }
                }
            }
            else {
                [startMarker, endMarker] = createMarkers(lhsTarget, name, method);
                if (transitional) {
                    ensureHideStyle(lhsTarget.getRootNode());
                    withTransition(startMarker, 'show', true, () => {
                        this.cloneAndInsertSync(instantiate, startMarker, endMarker, lhsTarget, resolvedParams);
                    });
                } else {
                    await this.cloneAndInsert(instantiate, startMarker, endMarker, lhsTarget, resolvedParams);
                }
            }
        }
        else {
            if (startMarker && endMarker) {
                const nodes = getNodesBetweenMarkers(startMarker, endMarker);
                if (nodes.length === 0) return;
                if (forget) {
                    withTransition(startMarker, 'hide', transitional, () => {
                        for (const node of nodes) {
                            node.parentNode?.removeChild(node);
                        }
                    });
                }
                else {
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
        }
    }
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
        endMarker.parentNode.insertBefore(content, endMarker);
        return nodes;
    }
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
        const nodes = Array.from(content.childNodes);
        endMarker.parentNode.insertBefore(content, endMarker);
        await this.onCloneInserted(nodes, lhsTarget, resolvedParams);
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
    async onCloneInserted(nodes, lhsTarget, resolvedParams) {
        // No-op by default. Subclasses override.
    }
}
