/**
 * builtIns.manageTemplateList handler for assignFrom.
 *
 * Clones a template once per item in an iterable, distributing each item's
 * properties into its clone via assignFrom. Manages the list over time —
 * reconciling by key to add, remove, and update-in-place.
 */
import { findMarkers, createMarkers, getNodesBetweenMarkers } from '../markerUtils.js';

const listStateMap = new WeakMap();

export class ManageTemplateListHandler {
    config;
    constructor(config) {
        this.config = config;
    }

    async assign(lhsTarget, resolvedParams, options) {
        const {
            forEach: items,
            instantiate,
            method = 'appendChild',
            forget = false,
            markerName,
        } = resolvedParams;

        if (!(lhsTarget instanceof Element)) {
            throw new Error('builtIns.manageTemplateList: lhsTarget must be a DOM Element');
        }

        if (!items || typeof items[Symbol.iterator] !== 'function') {
            return;
        }

        const fromEachItem = this.config.fromEachItem;
        const assignToFragment = fromEachItem?.assignToFragment ?? {};
        const withOptions = fromEachItem?.withOptions ?? {};
        const perItemResolve = fromEachItem?.resolve ?? {};
        const keyPath = perItemResolve.key;

        // fromSource config — assigns from the outer `from` (parent VM) to each clone
        const fromSource = this.config.fromSource;
        const sourceAssignToFragment = fromSource?.assignToFragment;
        const sourceWithOptions = fromSource?.withOptions ?? {};

        const name = markerName ?? getMarkerName(instantiate) ?? 'templateList';

        let [startMarker, endMarker] = findMarkers(lhsTarget, name);
        if (!startMarker || !endMarker) {
            [startMarker, endMarker] = createMarkers(lhsTarget, name, method);
        }

        let state = listStateMap.get(startMarker);
        if (!state) {
            state = { keyToNodes: new Map(), keyOrder: [] };
            listStateMap.set(startMarker, state);
        }

        const itemsArray = Array.from(items);

        const { resolveValue } = await import('../resolveValues.js');
        const newKeys = itemsArray.map((item, index) => {
            if (keyPath) {
                return resolveValue(keyPath, item);
            }
            return index;
        });

        const oldKeys = new Set(state.keyOrder);
        const newKeySet = new Set(newKeys);

        // Remove items no longer present
        for (const oldKey of state.keyOrder) {
            if (!newKeySet.has(oldKey)) {
                const nodes = state.keyToNodes.get(oldKey);
                if (nodes) {
                    if (forget) {
                        for (const node of nodes) node.parentNode?.removeChild(node);
                    } else {
                        for (const node of nodes) {
                            if (node instanceof Element) node.setAttribute('hidden', '');
                        }
                    }
                    state.keyToNodes.delete(oldKey);
                }
            }
        }

        const { assignFrom } = await import('../assignFrom.js');
        const fragment = document.createDocumentFragment();
        const newKeyToNodes = new Map();

        for (let i = 0; i < itemsArray.length; i++) {
            const item = itemsArray[i];
            const key = newKeys[i];

            if (state.keyToNodes.has(key) && oldKeys.has(key)) {
                // Existing — update in place
                const existingNodes = state.keyToNodes.get(key);
                const rootEl = existingNodes.find(n => n instanceof Element);
                if (rootEl) {
                    await assignFrom(rootEl, assignToFragment, { from: item, ...withOptions });
                    if (sourceAssignToFragment && options?.from) {
                        await assignFrom(rootEl, sourceAssignToFragment, { from: options.from, ...sourceWithOptions });
                    }
                }
                newKeyToNodes.set(key, existingNodes);
                for (const node of existingNodes) {
                    if (node instanceof Element) node.removeAttribute('hidden');
                }
            } else {
                // New — clone template
                let content;
                if (instantiate instanceof HTMLTemplateElement) {
                    content = instantiate.content.cloneNode(true);
                } else if (instantiate instanceof DocumentFragment) {
                    content = instantiate.cloneNode(true);
                } else {
                    throw new Error('builtIns.manageTemplateList: instantiate must be an HTMLTemplateElement or DocumentFragment');
                }

                const clonedNodes = Array.from(content.childNodes);
                const rootEl = clonedNodes.find(n => n instanceof Element);
                if (rootEl) {
                    const tempContainer = document.createDocumentFragment();
                    tempContainer.appendChild(content);
                    await assignFrom(rootEl, assignToFragment, { from: item, ...withOptions });
                    if (sourceAssignToFragment && options?.from) {
                        await assignFrom(rootEl, sourceAssignToFragment, { from: options.from, ...sourceWithOptions });
                    }
                }

                for (const node of clonedNodes) {
                    fragment.appendChild(node);
                }
                newKeyToNodes.set(key, clonedNodes);
            }
        }

        if (fragment.childNodes.length > 0) {
            const waitOpt = resolvedParams.waitForSettled;
            if (waitOpt) {
                const { waitForSettled } = await import('../waitForSettled.js');
                const idleMs = typeof waitOpt === 'object' ? waitOpt.idleMs : 100;
                const timeout = typeof waitOpt === 'object' ? waitOpt.timeout : undefined;
                try {
                    await waitForSettled(fragment, idleMs, timeout);
                } catch (e) {
                    console.warn('builtIns.manageTemplateList:', e.message, '— inserting fragment anyway');
                }
            }
            endMarker.parentNode.insertBefore(fragment, endMarker);
        }

        state.keyToNodes = newKeyToNodes;
        state.keyOrder = newKeys;
    }
}

function getMarkerName(templateEl) {
    if (templateEl instanceof HTMLTemplateElement) {
        return templateEl.id || undefined;
    }
    return undefined;
}
