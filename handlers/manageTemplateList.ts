/**
 * builtIns.manageTemplateList handler for assignFrom.
 * 
 * Clones a template once per item in an iterable, distributing each item's
 * properties into its clone via assignFrom. Manages the list over time —
 * reconciling by key to add, remove, and update-in-place.
 * 
 * This handler is auto-loaded by processHandlerCommands when
 * `do: 'builtIns.manageTemplateList'` is encountered.
 * 
 * @example
 * assignFrom(document.body, {
 *     '?.querySelector?.tbody =>': {
 *         do: 'builtIns.manageTemplateList',
 *         resolve: {
 *             forEach: '?.rankings',
 *             instantiate: 'globalThis://country-ranking',
 *         },
 *         fromEachItem: {
 *             assignToFragment: { '?.querySelector?.tr?.ish': '?.' },
 *             withOptions: { withMethods: ['querySelector'], infer: true },
 *             resolve: { key: '?.rank' }
 *         }
 *     }
 * }, { from: vm, withMethods: ['querySelector'], protocols: { globalThis: k => globalThis[k] } });
 */

import type { AssignFromHandler } from '../assignFromAsync.js';
import type { ManageTemplateListResolvedParams } from '../types/assign-gingerly/types.js';
import { findMarkers, createMarkers, getNodesBetweenMarkers, MARKER_START_PREFIX, MARKER_END } from '../markerUtils.js';
import { resolveValue } from '../resolveValues.js';
import { assignFrom } from '../assignFrom.js';
import { processInferredAssignments } from '../inferredAssignments.js';

/**
 * State stored per list instance (keyed by start marker).
 * Tracks the mapping of keys to their cloned DOM nodes.
 */
interface ListState {
    /** Map of key value → array of DOM nodes for that item's clone */
    keyToNodes: Map<any, Node[]>;
    /** Ordered array of keys matching current DOM order */
    keyOrder: any[];
}

const listStateMap = new WeakMap<Node, ListState>();

/**
 * ManageTemplateListHandler — clones a template per iterable item with keyed reconciliation.
 */
export class ManageTemplateListHandler implements AssignFromHandler {
    config: any;

    constructor(config: any) {
        this.config = config;
    }

    async assign(lhsTarget: any, resolvedParams: ManageTemplateListResolvedParams, options?: any): Promise<void> {
        //return;
        const {
            forEach: items,
            instantiate,
            method = 'appendChild',
            forget = false,
            markerName,
            yieldEvery,
        } = resolvedParams;

        if (!(lhsTarget instanceof Element)) {
            throw new Error('builtIns.manageTemplateList: lhsTarget must be a DOM Element');
        }

        if (!items || typeof items[Symbol.iterator] !== 'function') {
            return; // Nothing to iterate
        }

        const fromEachItem = this.config.fromEachItem;
        const configs = fromEachItem?.configs; // Array form for multi-element templates
        const assignToFragment = fromEachItem?.assignToFragment ?? {};
        const withOptions = fromEachItem?.withOptions ?? {};
        const perItemResolve = fromEachItem?.resolve ?? {};
        const keyPath = perItemResolve.key; // e.g., '?.rank'

        // fromSource config — assigns from the outer `from` (parent VM) to each clone
        const fromSource = this.config.fromSource;
        const sourceAssignToFragment = fromSource?.assignToFragment;
        const sourceWithOptions = fromSource?.withOptions ?? {};

        // Detect fast path: no assignToFragment patterns, just infer (only for non-configs mode)
        const hasAssignPatterns = !configs && Object.keys(assignToFragment).length > 0;
        const inferredConfig = !configs && withOptions.infer;
        const useFastPath = !configs && !hasAssignPatterns && inferredConfig && !sourceAssignToFragment;

        const name = markerName ?? getMarkerName(instantiate) ?? 'templateList';

        // Find or create markers
        let [startMarker, endMarker] = findMarkers(lhsTarget, name);
        if (!startMarker || !endMarker) {
            [startMarker, endMarker] = createMarkers(lhsTarget, name, method);
        }

        // Get or create list state
        let state = listStateMap.get(startMarker);
        if (!state) {
            state = { keyToNodes: new Map(), keyOrder: [] };
            listStateMap.set(startMarker, state);
        }

        // Convert iterable to array
        const itemsArray = Array.from(items);

        // Fast path: use processInferredAssignments directly when possible
        const processInferred = useFastPath ? processInferredAssignments : null;
        const newKeys: any[] = itemsArray.map((item, index) => {
            if (keyPath) {
                return resolveValue(keyPath, item);
            }
            return index; // Positional fallback when no key specified
        });

        // Determine what changed
        const oldKeys = new Set(state.keyOrder);
        const newKeySet = new Set(newKeys);

        // Keys to remove
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

        // Process items — clone new ones, update existing
        const fragment = document.createDocumentFragment();
        const newKeyToNodes = new Map<any, Node[]>();

        for (let i = 0; i < itemsArray.length; i++) {
            const item = itemsArray[i];
            const key = newKeys[i];

            if (state.keyToNodes.has(key) && oldKeys.has(key)) {
                // Existing item — update in place
                const existingNodes = state.keyToNodes.get(key)!;
                const shouldYield = yieldEvery && i > 0 && i % yieldEvery === 0;
                if (shouldYield) await new Promise(r => setTimeout(r, 0));

                if (configs) {
                    // Multi-element: zip configs with element nodes
                    const elements = existingNodes.filter(n => n instanceof Element) as Element[];
                    const len = Math.min(elements.length, configs.length);
                    for (let j = 0; j < len; j++) {
                        const cfg = configs[j];
                        assignFrom(elements[j], cfg.assignToFragment ?? {}, { from: item, ...cfg.withOptions });
                    }
                } else {
                    const rootEl = existingNodes.find(n => n instanceof Element) as Element | undefined;
                    if (rootEl) {
                        if (processInferred) {
                            processInferred(rootEl, item, inferredConfig === true ? { byItemprop: true } : inferredConfig);
                        } else {
                            assignFrom(rootEl, assignToFragment, { from: item, ...withOptions });
                        }
                        if (sourceAssignToFragment && options?.from) {
                            assignFrom(rootEl, sourceAssignToFragment, { from: options.from, ...sourceWithOptions });
                        }
                    }
                }
                newKeyToNodes.set(key, existingNodes);
                for (const node of existingNodes) {
                    if (node instanceof Element) node.removeAttribute('hidden');
                }
            } else {
                // New item — clone template
                let content: DocumentFragment;
                if (instantiate instanceof HTMLTemplateElement) {
                    content = (instantiate.remoteContent ||instantiate.content).cloneNode(true) as DocumentFragment;
                } else if (instantiate instanceof DocumentFragment) {
                    content = instantiate.cloneNode(true) as DocumentFragment;
                } else {
                    throw new Error('builtIns.manageTemplateList: instantiate must be an HTMLTemplateElement or DocumentFragment');
                }

                const clonedNodes = Array.from(content.childNodes);

                // Apply per-item assignments to the cloned fragment
                const shouldYield = yieldEvery && i > 0 && i % yieldEvery === 0;
                if (shouldYield) await new Promise(r => setTimeout(r, 0));

                if (configs) {
                    // Multi-element: zip configs with element nodes
                    const elements = clonedNodes.filter(n => n instanceof Element) as Element[];
                    const len = Math.min(elements.length, configs.length);
                    for (let j = 0; j < len; j++) {
                        const cfg = configs[j];
                        assignFrom(elements[j], cfg.assignToFragment ?? {}, { from: item, ...cfg.withOptions });
                    }
                } else {
                    const rootEl = clonedNodes.find(n => n instanceof Element) as Element | undefined;
                    if (rootEl) {
                        const tempContainer = document.createDocumentFragment();
                        tempContainer.appendChild(content);

                        if (processInferred) {
                            processInferred(rootEl, item, inferredConfig === true ? { byItemprop: true } : inferredConfig);
                        } else {
                            assignFrom(rootEl, assignToFragment, { from: item, ...withOptions });
                        }

                        if (sourceAssignToFragment && options?.from) {
                            assignFrom(rootEl, sourceAssignToFragment, { from: options.from, ...sourceWithOptions });
                        }
                    }
                }

                for (const node of clonedNodes) {
                    fragment.appendChild(node);
                }
                newKeyToNodes.set(key, clonedNodes);
            }
        }

        // Wait for async rendering in the fragment to settle before committing
        if (fragment.childNodes.length > 0) {
            const waitOpt = resolvedParams.waitForSettled;
            if (waitOpt) {
                const { waitForSettled } = await import('../waitForSettled.js');
                const idleMs = typeof waitOpt === 'object' ? waitOpt.idleMs : 100;
                const timeout = typeof waitOpt === 'object' ? waitOpt.timeout : undefined;
                try {
                    await waitForSettled(fragment, idleMs, timeout);
                } catch (e) {
                    console.warn('builtIns.manageTemplateList:', (e as Error).message, '— inserting fragment anyway');
                }
            }

            // Insert new fragment before end marker
            endMarker.parentNode!.insertBefore(fragment, endMarker);
        }

        // Update state
        state.keyToNodes = newKeyToNodes;
        state.keyOrder = newKeys;
    }
}

/**
 * Get marker name from a template element.
 */
function getMarkerName(templateEl: any): string | undefined {
    if (templateEl instanceof HTMLTemplateElement) {
        return templateEl.id || undefined;
    }
    return undefined;
}
