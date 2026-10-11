/**
 * builtIns.tree handler for assignFrom.
 *
 * Builds a (mostly static) tree of elements from a VM. Each `map` entry pairs a VM
 * key with an element specification: a tag name, or a tuple of
 * `[tag, pattern, children]`. The pattern is an assignFrom pattern applied to the
 * created element with `from` set to the key's VM value; children are static
 * structure whose patterns resolve against that same value.
 *
 * No microdata is added, and existing (e.g. server-rendered) markup isn't adopted.
 * The tree's nodes sit between `<!--?start name="tree"-->` / `<!--?end-->` markers
 * appended to the target.
 *
 * Second and later calls rebind in place: since the structure is static, Tree walks
 * the spec and the nodes it created in lockstep and re-applies each pattern. A
 * subtree is only rebuilt when its structure (tag, child count) changed or its
 * element was removed from the DOM by other code. Keys whose value becomes
 * null/undefined have their element removed (unless `keepNullish`).
 *
 * Fully synchronous inside `assign()`.
 *
 * Not yet supported (Phase TBD): class headers and `$:` itemscope manager headers.
 *
 * This handler is auto-loaded by processHandlerCommands when
 * `do: 'builtIns.tree'` is encountered.
 *
 * @example
 * await assignFromAsync(document.getElementById('api-response'), {
 *     '?. =>': {
 *         do: 'builtIns.tree',
 *         map: {
 *             patch: ['img', { src: '?.small', alt: '?.alt' }],
 *         }
 *     }
 * }, { from: vm });
 */
import { assignFrom, categorizeKeys, handleSpreads, SUBSTITUTION_VARS } from '../assignFrom.js';
import { assignGingerly } from '../assignGingerly.js';
import { getValues } from '../resolve/getValues.js';
import { createMarkers, getNodesBetweenMarkers, MARKER_START_PREFIX, MARKER_END } from '../markerUtils.js';
const DEFAULT_MARKER_NAME = 'tree';
const WILDCARD = '*';
const DEFAULT_WILDCARD_PATTERN = { textContent: '?.' };
/** Created nodes per tree, keyed by the tree's start marker. */
const treeStates = new WeakMap();
/** Whether a pattern only has plain keys, so it can skip assignFrom's key categorization. */
const plainPatterns = new WeakMap();
function normalize(spec) {
    const [header, pattern, children = []] = Array.isArray(spec) ? spec : [spec];
    if (typeof header !== 'string') {
        throw new Error('builtIns.tree: class headers are not supported yet; use a tag name');
    }
    if (header.startsWith('$:')) {
        throw new Error(`builtIns.tree: itemscope manager headers ("${header}") are not supported yet; use a tag name`);
    }
    return [header, pattern, children];
}
/** Where an element's children go: a template's content, otherwise the element itself. */
function containerOf(element) {
    return element instanceof HTMLTemplateElement ? element.content : element;
}
/**
 * Apply a pattern to an element, resolving against the key's VM value.
 * Plain patterns (the common case) go straight to getValues + assignGingerly;
 * anything else goes through assignFrom.
 */
function applyPattern(element, pattern, value, options, permissionProcessor) {
    if (!pattern)
        return;
    const nodeOptions = { ...options, from: value };
    let plain = plainPatterns.get(pattern);
    if (plain === undefined) {
        const { normalPattern } = categorizeKeys(pattern);
        plain = Object.keys(normalPattern).length === Object.keys(pattern).length;
        plainPatterns.set(pattern, plain);
    }
    const { pin, at } = options;
    if (plain && !pin && !at && !SUBSTITUTION_VARS.some(({ optionKey }) => options[optionKey]?.length)) {
        const resolved = getValues(pattern, value, { ...nodeOptions, root: element, permissionProcessor });
        handleSpreads(resolved);
        assignGingerly(element, resolved, nodeOptions, permissionProcessor);
    }
    else {
        assignFrom(element, pattern, nodeOptions, permissionProcessor);
    }
}
function createNode(spec, value, options, permissionProcessor) {
    const [tag, pattern, childSpecs] = normalize(spec);
    const element = document.createElement(tag);
    applyPattern(element, pattern, value, options, permissionProcessor);
    const container = containerOf(element);
    const children = childSpecs.map(childSpec => {
        const child = createNode(childSpec, value, options, permissionProcessor);
        container.appendChild(child.element);
        return child;
    });
    return { tag, element, children };
}
/**
 * Rebind an existing node in place, or create it when there's none or its
 * structure no longer matches the spec.
 */
function syncNode(node, spec, value, options, permissionProcessor) {
    const [tag, pattern, childSpecs] = normalize(spec);
    if (!node || node.tag !== tag || node.children.length !== childSpecs.length) {
        return createNode(spec, value, options, permissionProcessor);
    }
    const { element, children } = node;
    applyPattern(element, pattern, value, options, permissionProcessor);
    const container = containerOf(element);
    let misplaced = false;
    node.children = childSpecs.map((childSpec, i) => {
        const child = syncNode(children[i], childSpec, value, options, permissionProcessor);
        if (child !== children[i])
            children[i].element.remove();
        if (child.element.parentNode !== container)
            misplaced = true;
        return child;
    });
    // A rebuilt child, or a pattern that replaced the element's content (e.g. textContent)
    if (misplaced)
        container.append(...node.children.map(c => c.element));
    return node;
}
/** Find the tree's markers among the target's direct children. */
function findChildMarkers(target, name) {
    const startText = `${MARKER_START_PREFIX}${name}"`;
    let start;
    for (const node of target.childNodes) {
        if (node.nodeType !== Node.COMMENT_NODE)
            continue;
        const { data } = node;
        if (!start) {
            if (data === startText)
                start = node;
        }
        else if (data === MARKER_END) {
            return [start, node];
        }
    }
    return undefined;
}
/** Map entries in order, followed by `'*'` entries for the VM keys the map doesn't name. */
function getEntries(map, from) {
    const entries = [];
    for (const key of Object.keys(map)) {
        if (key !== WILDCARD)
            entries.push([key, map[key]]);
    }
    const wildcard = map[WILDCARD];
    if (wildcard === undefined || from === null || typeof from !== 'object')
        return entries;
    const [tag, pattern = DEFAULT_WILDCARD_PATTERN, children] = normalize(wildcard);
    for (const key of Object.keys(from)) {
        if (!(key in map))
            entries.push([key, [tag, pattern, children]]);
    }
    return entries;
}
/** Place elements in order right after `start`, moving only the ones that are out of place. */
function placeInOrder(parent, elements, start) {
    let cursor = start.nextSibling;
    for (const element of elements) {
        if (element === cursor) {
            cursor = cursor.nextSibling;
        }
        else {
            parent.insertBefore(element, cursor);
        }
    }
}
/**
 * TreeHandler — builds a tree of elements from a VM, and rebinds it on later calls.
 */
export class TreeHandler {
    config;
    constructor(config) {
        this.config = config;
    }
    assign(lhsTarget, _resolvedParams, options, permissionProcessor) {
        if (!(lhsTarget instanceof Element))
            return;
        const { map, markerName = DEFAULT_MARKER_NAME, keepNullish } = this.config;
        if (!map || typeof map !== 'object') {
            throw new Error('builtIns.tree: a "map" of VM keys to element specifications is required');
        }
        const { from } = options;
        const [start, end] = findChildMarkers(lhsTarget, markerName) ?? createMarkers(lhsTarget, markerName);
        let nodes = treeStates.get(start);
        if (!nodes) {
            // Markers without state (cloned or server-rendered): Tree doesn't adopt markup, so start fresh
            for (const node of getNodesBetweenMarkers(start, end))
                node.remove();
            nodes = new Map();
            warnUnmatchedKeys(map, from);
        }
        const next = new Map();
        for (const [key, spec] of getEntries(map, from)) {
            const value = from?.[key];
            if (value == null && !keepNullish)
                continue;
            let node = nodes.get(key);
            // Removed or moved by other code: rebuild
            if (node && node.element.parentNode !== lhsTarget)
                node = undefined;
            next.set(key, syncNode(node, spec, value, options, permissionProcessor));
        }
        for (const [key, node] of nodes) {
            if (next.get(key) !== node && node.element.parentNode === lhsTarget)
                node.element.remove();
        }
        placeInOrder(lhsTarget, [...next.values()].map(n => n.element), start);
        treeStates.set(start, next);
    }
}
/** On a tree's first render, warn about map keys the VM doesn't have (likely typos). */
function warnUnmatchedKeys(map, from) {
    if (from === null || typeof from !== 'object')
        return;
    for (const key of Object.keys(map)) {
        if (key !== WILDCARD && !(key in from)) {
            console.warn(`builtIns.tree: map key "${key}" isn't in the view model (typo?)`);
        }
    }
}
