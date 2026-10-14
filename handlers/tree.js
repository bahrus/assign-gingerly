/**
 * builtIns.tree handler for assignFrom.
 *
 * Builds a (mostly static) tree of elements from a VM. Each `map` entry pairs a VM
 * key with an element specification: a tag name, or a tuple of
 * `[tag, pattern, children]`. The pattern is an assignFrom pattern applied to the
 * created element with `from` set to the key's VM value; children are static
 * structure whose patterns resolve against that same value.
 *
 * Arrays: a repeat object `{ each, of?, key?, empty? }` in place of the children
 * stamps `each` once per item (where `?.` is the item and `$parent` the array's
 * holder), reuses items' elements by `key` (default: index), and renders `empty`
 * when there are no items. Synchronous, like everything else here.
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
 * Itemscope managers: an object header `{ tag, ish }` attaches a manager (a registered
 * name, or a class that's auto-registered) to the element, without an `itemscope`
 * attribute. Each call assigns the key's value to `el.ish`, and the element's own
 * pattern and its children's patterns resolve against the manager instance, so
 * computed values are just getters. The manager receives `ctx.rebind()` (constructor
 * third argument, and in onAssigned's ctx) to re-apply its subtree after changing its
 * own state; Tree calls it itself once an async onAssigned settles.
 *
 * Not yet supported (Phase TBD): bare class headers and `$:` headers.
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
import { getValue, getValues, isEventBinding } from '../resolve/getValues.js';
import { defineIshCore } from '../handleIshProperty.js';
import { createMarkers, getNodesBetweenMarkers, MARKER_START_PREFIX, MARKER_END } from '../markerUtils.js';
const DEFAULT_MARKER_NAME = 'tree';
const WILDCARD = '*';
const DEFAULT_WILDCARD_PATTERN = { textContent: '?.' };
/**
 * Options key carrying the tree's target (an Element, ShadowRoot or other DocumentFragment)
 * down to every node, so managers resolve through the target's — possibly scoped — registry.
 */
const TREE_TARGET = Symbol('builtIns.tree target');
/** Created nodes per tree, keyed by the tree's start marker. */
const treeStates = new WeakMap();
/** Whether a pattern only has plain keys, so it can skip assignFrom's key categorization. */
const plainPatterns = new WeakMap();
/** Patterns whose ` +=` event bindings got a default dedup key (identity when there were none). */
const eventKeyedPatterns = new WeakMap();
/**
 * Give each ` +=` event binding without a `get.key` a default one, so re-applying the
 * pattern on a rerun replaces the element's listener instead of adding another (and the
 * listener's host is always the current `from`).
 */
function withEventKeys(pattern) {
    let keyed = eventKeyedPatterns.get(pattern);
    if (keyed)
        return keyed;
    keyed = pattern;
    for (const key of Object.keys(pattern)) {
        const value = pattern[key];
        if (isEventBinding(key, value) && value.get?.key === undefined) {
            if (keyed === pattern)
                keyed = { ...pattern };
            keyed[key] = { ...value, get: { ...value.get, key: `builtIns.tree:${key}` } };
        }
    }
    eventKeyedPatterns.set(pattern, keyed);
    return keyed;
}
/** `{ textContent: text }` patterns for string shorthand, one object per string (so pattern caches hit). */
const textPatterns = new Map();
/** A string in the pattern slot is shorthand for `{ textContent: string }`. */
function textPattern(text) {
    let pattern = textPatterns.get(text);
    if (!pattern) {
        pattern = { textContent: text };
        textPatterns.set(text, pattern);
    }
    return pattern;
}
function normalize(spec) {
    const [header, patternOrText, third] = Array.isArray(spec) ? spec : [spec];
    const pattern = typeof patternOrText === 'string' ? textPattern(patternOrText) : patternOrText;
    // The children slot: an array of static children, or a repeat object ({ each, … })
    let children = [];
    let repeat;
    if (Array.isArray(third)) {
        children = third;
    }
    else if (third !== undefined) {
        if (!third || typeof third !== 'object' || !('each' in third)) {
            throw new Error('builtIns.tree: the children slot must be an array of specifications or a repeat object { each, … }');
        }
        repeat = third;
    }
    if (typeof header === 'string') {
        if (header.startsWith('$:')) {
            throw new Error(`builtIns.tree: itemscope manager headers ("${header}") are not supported yet; use { tag, ish: '${header.slice(2)}' }`);
        }
        return [header, header, undefined, pattern, children, repeat];
    }
    if (typeof header === 'function') {
        throw new Error('builtIns.tree: class headers are not supported yet; use { tag, ish: Class }');
    }
    if (header && typeof header === 'object' && typeof header.tag === 'string') {
        return [header, header.tag, header.ish, pattern, children, repeat];
    }
    throw new Error('builtIns.tree: an element header must be a tag name or { tag, ish? }');
}
/** Where an element's children go: a template's content, otherwise the element itself. */
function containerOf(element) {
    return element instanceof HTMLTemplateElement ? element.content : element;
}
/**
 * Apply a pattern to an element, resolving against `from` (the key's VM value, or the
 * manager instance). Plain patterns (the common case) go straight to getValues +
 * assignGingerly; anything else goes through assignFrom.
 */
function applyPattern(element, pattern, from, options, permissionProcessor) {
    if (!pattern)
        return;
    pattern = withEventKeys(pattern);
    const nodeOptions = { ...options, from };
    let plain = plainPatterns.get(pattern);
    if (plain === undefined) {
        const { normalPattern } = categorizeKeys(pattern);
        plain = Object.keys(normalPattern).length === Object.keys(pattern).length;
        plainPatterns.set(pattern, plain);
    }
    const { pin, at } = options;
    if (plain && !pin && !at && !SUBSTITUTION_VARS.some(({ optionKey }) => options[optionKey]?.length)) {
        const resolved = getValues(pattern, from, { ...nodeOptions, root: element, permissionProcessor });
        handleSpreads(resolved);
        assignGingerly(element, resolved, nodeOptions, permissionProcessor);
    }
    else {
        assignFrom(element, pattern, nodeOptions, permissionProcessor);
    }
}
/**
 * Resolve a header's manager to its registered config. A class is registered under
 * `is ?? name` if needed; a name must already be registered.
 */
function resolveManagerConfig(ish, element, options) {
    // The tree's target first (a shadow root may carry a scoped registry), then the element, then the global one
    const treeTarget = options[TREE_TARGET];
    const registry = treeTarget?.customElementRegistry?.itemscopeRegistry
        ?? element.customElementRegistry?.itemscopeRegistry
        ?? (typeof customElements !== 'undefined' ? customElements.itemscopeRegistry : undefined);
    if (!registry)
        throw new Error('builtIns.tree: no itemscope registry is available');
    if (typeof ish === 'string') {
        const config = registry.get(ish);
        if (!config)
            throw new Error(`builtIns.tree: itemscope manager "${ish}" isn't registered`);
        return config;
    }
    const name = ish.is ?? ish.name;
    if (!name)
        throw new Error('builtIns.tree: a manager class needs a name; declare static is = \'...\'');
    const existing = registry.get(name);
    if (existing) {
        if (existing.manager !== ish) {
            throw new Error(`builtIns.tree: itemscope name "${name}" is already registered to a different class`);
        }
        return existing;
    }
    const config = { manager: ish };
    registry.define(name, config);
    return config;
}
/**
 * Attach the header's manager to a new node's element and assign the first value.
 * Returns the manager instance, which becomes `from` for the node's subtree.
 */
function attachManager(node, ish, value) {
    const { element, options } = node;
    const config = resolveManagerConfig(ish, element, options);
    const rebind = () => rebindNode(node);
    defineIshCore(element, config, options, assignGingerly, { ctx: { rebind }, onSettled: rebind });
    element.ish = value;
    return element.ish;
}
/** Place elements as the container's first children, in order, moving only the ones out of place. */
function placeChildren(container, elements) {
    let cursor = container.firstChild;
    for (const element of elements) {
        if (element === cursor) {
            cursor = cursor.nextSibling;
        }
        else {
            container.insertBefore(element, cursor);
        }
    }
}
/**
 * Stamp `each` once per item of the array at `of`, reusing items' nodes by `key`
 * (default: index), or render `empty` when there are no items. Inside items, `?.` is
 * the item and `$parent` is the object holding the array.
 */
function bindRepeat(node, repeat, from) {
    const { element, options, permissionProcessor } = node;
    const { each, of = '?.', key, empty } = repeat;
    const resolveOptions = { ...options, from, root: element, permissionProcessor };
    const list = getValue(of, from, resolveOptions);
    const items = list != null && typeof list[Symbol.iterator] === 'function' ? Array.from(list) : [];
    // With the default `of`, the node's value is the array, and the stack's top is already its holder
    const itemOptions = of === '?.' ? options : { ...options, fromStack: [...(options.fromStack ?? []), from] };
    const container = containerOf(element);
    const state = node.repeat ??= { items: new Map(), empty: undefined, warned: false };
    const next = new Map();
    items.forEach((item, index) => {
        let itemKey = key === undefined ? index : getValue(key, item, { ...itemOptions, from: item, root: element, permissionProcessor });
        if (next.has(itemKey)) {
            if (!state.warned) {
                console.warn(`builtIns.tree: duplicate key ${JSON.stringify(itemKey)} in a repeat; falling back to the index for duplicates`);
                state.warned = true;
            }
            itemKey = Symbol.for(`builtIns.tree:index:${index}`);
        }
        let itemNode = state.items.get(itemKey);
        // Removed or moved by other code: rebuild
        if (itemNode && itemNode.element.parentNode !== container)
            itemNode = undefined;
        next.set(itemKey, syncNode(itemNode, each, item, itemOptions, permissionProcessor));
    });
    for (const [itemKey, itemNode] of state.items) {
        if (next.get(itemKey) !== itemNode && itemNode.element.parentNode === container)
            itemNode.element.remove();
    }
    state.items = next;
    let elements = [...next.values()].map(n => n.element);
    if (items.length === 0 && empty !== undefined) {
        const current = state.empty?.element.parentNode === container ? state.empty : undefined;
        state.empty = syncNode(current, empty, from, options, permissionProcessor);
        elements = [state.empty.element];
    }
    else if (state.empty) {
        state.empty.element.remove();
        state.empty = undefined;
    }
    placeChildren(container, elements);
}
/**
 * Apply a node's own pattern, then sync its static children or its repeat, all against `from`.
 */
function bindContent(node, pattern, childSpecs, repeat, from) {
    const { element, children, options, permissionProcessor } = node;
    applyPattern(element, pattern, from, options, permissionProcessor);
    if (repeat) {
        bindRepeat(node, repeat, from);
        return;
    }
    const container = containerOf(element);
    let misplaced = false;
    node.children = childSpecs.map((childSpec, i) => {
        const child = syncNode(children[i], childSpec, from, options, permissionProcessor);
        if (child !== children[i])
            children[i].element.remove();
        if (child.element.parentNode !== container)
            misplaced = true;
        return child;
    });
    // A rebuilt child, or a pattern that replaced the element's content (e.g. textContent)
    if (misplaced)
        container.append(...node.children.map(c => c.element));
}
/** A manager's ctx.rebind(): re-apply the node's subtree against the manager instance. */
function rebindNode(node) {
    if (node.binding)
        return;
    const [, , , pattern, childSpecs, repeat] = normalize(node.spec);
    node.binding = true;
    try {
        bindContent(node, pattern, childSpecs, repeat, node.element.ish);
    }
    finally {
        node.binding = false;
    }
}
function createNode(spec, value, options, permissionProcessor) {
    const [, tag, ish, pattern, childSpecs, repeat] = normalize(spec);
    const element = document.createElement(tag);
    const node = { tag, ish, element, children: [], spec, options, permissionProcessor, binding: true };
    try {
        const from = ish === undefined ? value : attachManager(node, ish, value);
        if (repeat) {
            bindContent(node, pattern, childSpecs, repeat, from);
            return node;
        }
        applyPattern(element, pattern, from, options, permissionProcessor);
        const container = containerOf(element);
        node.children = childSpecs.map(childSpec => {
            const child = createNode(childSpec, from, options, permissionProcessor);
            container.appendChild(child.element);
            return child;
        });
    }
    finally {
        node.binding = false;
    }
    return node;
}
/**
 * Rebind an existing node in place, or create it when there's none or its
 * structure (tag, manager, child count) no longer matches the spec.
 */
function syncNode(node, spec, value, options, permissionProcessor) {
    const [, tag, ish, pattern, childSpecs, repeat] = normalize(spec);
    if (!node || node.tag !== tag || node.ish !== ish || node.children.length !== childSpecs.length
        || !!node.repeat !== !!repeat) {
        return createNode(spec, value, options, permissionProcessor);
    }
    Object.assign(node, { spec, options, permissionProcessor });
    node.binding = true;
    try {
        let from = value;
        if (ish !== undefined) {
            const element = node.element;
            element.ish = value;
            from = element.ish;
        }
        bindContent(node, pattern, childSpecs, repeat, from);
    }
    finally {
        node.binding = false;
    }
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
    const [header, , , pattern = DEFAULT_WILDCARD_PATTERN, children, repeat] = normalize(wildcard);
    for (const key of Object.keys(from)) {
        if (!(key in map))
            entries.push([key, [header, pattern, repeat ?? children]]);
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
        // Elements, shadow roots and other document fragments
        if (!(lhsTarget instanceof Element || lhsTarget instanceof DocumentFragment))
            return;
        const { map, markerName = DEFAULT_MARKER_NAME, keepNullish, aka } = this.config;
        if (!map || typeof map !== 'object') {
            throw new Error('builtIns.tree: a "map" of VM keys to element specifications is required');
        }
        const { from, fromStack } = options;
        // Each key's pattern resolves against the key's value, one level down: the VM becomes `$parent`.
        // The config's own aka applies to this tree's patterns only, over any aka in the options.
        const nestedOptions = {
            ...options,
            fromStack: [...(fromStack ?? []), from],
            ...(aka && { aka: { ...options.aka, ...aka } }),
            [TREE_TARGET]: lhsTarget,
        };
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
            next.set(key, syncNode(node, spec, value, nestedOptions, permissionProcessor));
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
