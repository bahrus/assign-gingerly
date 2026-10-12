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
import { getValues } from '../resolve/getValues.js';
import { defineIshCore } from '../handleIshProperty.js';
import { createMarkers, getNodesBetweenMarkers, MARKER_START_PREFIX, MARKER_END } from '../markerUtils.js';
import type {
    AssignFromHandler, AssignFromOptions, ItemscopeManager, ItemscopeManagerConfig, ItemscopeRegistry, PermissionProcessor,
} from '../types/assign-gingerly/types.js';
import type { ElementHeader, ElementSpecification, Pattern, TreeConfig } from '../types/assign-gingerly/treeTypes.js';

const DEFAULT_MARKER_NAME = 'tree';
const WILDCARD = '*';
const DEFAULT_WILDCARD_PATTERN: Pattern = { textContent: '?.' };

/** A manager reference from an object header: a registered name or a class. */
type ManagerRef = string | ItemscopeManager;

/** A created element, paired with the structure it was created from and its static children. */
interface TreeNode {
    tag: string;
    /** The header's manager, if any — part of the structure, like the tag */
    ish: ManagerRef | undefined;
    element: Element;
    children: TreeNode[];
    /** The latest spec and options, so a manager's rebind() re-applies what the last call applied */
    spec: ElementSpecification;
    options: AssignFromOptions;
    permissionProcessor?: PermissionProcessor;
    /** True while Tree itself binds this node, so a rebind() triggered meanwhile is a no-op */
    binding: boolean;
}

type NormalizedSpec = [
    header: string | ElementHeader,
    tag: string,
    ish: ManagerRef | undefined,
    pattern: Pattern | undefined,
    children: ElementSpecification[],
];

/** Created nodes per tree, keyed by the tree's start marker. */
const treeStates = new WeakMap<Comment, Map<string, TreeNode>>();

/** Whether a pattern only has plain keys, so it can skip assignFrom's key categorization. */
const plainPatterns = new WeakMap<Pattern, boolean>();

function normalize(spec: ElementSpecification): NormalizedSpec {
    const [header, pattern, children = []] = Array.isArray(spec) ? spec : [spec];
    if (typeof header === 'string') {
        if (header.startsWith('$:')) {
            throw new Error(`builtIns.tree: itemscope manager headers ("${header}") are not supported yet; use { tag, ish: '${header.slice(2)}' }`);
        }
        return [header, header, undefined, pattern, children];
    }
    if (typeof header === 'function') {
        throw new Error('builtIns.tree: class headers are not supported yet; use { tag, ish: Class }');
    }
    if (header && typeof header === 'object' && typeof header.tag === 'string') {
        return [header, header.tag, header.ish, pattern, children];
    }
    throw new Error('builtIns.tree: an element header must be a tag name or { tag, ish? }');
}

/** Where an element's children go: a template's content, otherwise the element itself. */
function containerOf(element: Element): ParentNode {
    return element instanceof HTMLTemplateElement ? element.content : element;
}

/**
 * Apply a pattern to an element, resolving against `from` (the key's VM value, or the
 * manager instance). Plain patterns (the common case) go straight to getValues +
 * assignGingerly; anything else goes through assignFrom.
 */
function applyPattern(
    element: Element,
    pattern: Pattern | undefined,
    from: any,
    options: AssignFromOptions,
    permissionProcessor?: PermissionProcessor
): void {
    if (!pattern) return;
    const nodeOptions = { ...options, from };
    let plain = plainPatterns.get(pattern);
    if (plain === undefined) {
        const { normalPattern } = categorizeKeys(pattern);
        plain = Object.keys(normalPattern).length === Object.keys(pattern).length;
        plainPatterns.set(pattern, plain);
    }
    const { pin, at } = options;
    if (plain && !pin && !at && !SUBSTITUTION_VARS.some(({ optionKey }) => (options as any)[optionKey]?.length)) {
        const resolved = getValues(pattern, from, { ...nodeOptions, root: element, permissionProcessor } as any);
        handleSpreads(resolved);
        assignGingerly(element, resolved, nodeOptions, permissionProcessor);
    } else {
        assignFrom(element, pattern, nodeOptions, permissionProcessor);
    }
}

/**
 * Resolve a header's manager to its registered config. A class is registered under
 * `is ?? itemscope ?? name` if needed; a name must already be registered.
 */
function resolveManagerConfig(ish: ManagerRef, element: Element): ItemscopeManagerConfig {
    const registry: ItemscopeRegistry | undefined = (element as any).customElementRegistry?.itemscopeRegistry
        ?? (typeof customElements !== 'undefined' ? customElements.itemscopeRegistry : undefined);
    if (!registry) throw new Error('builtIns.tree: no itemscope registry is available');
    if (typeof ish === 'string') {
        const config = registry.get(ish);
        if (!config) throw new Error(`builtIns.tree: itemscope manager "${ish}" isn't registered`);
        return config;
    }
    const name = ish.is ?? ish.itemscope ?? ish.name;
    if (!name) throw new Error('builtIns.tree: a manager class needs a name; declare static is = \'...\'');
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
function attachManager(node: TreeNode, ish: ManagerRef, value: any): any {
    const { element, options } = node;
    const config = resolveManagerConfig(ish, element);
    const rebind = () => rebindNode(node);
    defineIshCore(element as HTMLElement, config, options, assignGingerly, { ctx: { rebind }, onSettled: rebind });
    (element as any).ish = value;
    return (element as any).ish;
}

/** Apply a node's own pattern and sync its children, all against `from`. */
function bindContent(node: TreeNode, pattern: Pattern | undefined, childSpecs: ElementSpecification[], from: any): void {
    const { element, children, options, permissionProcessor } = node;
    applyPattern(element, pattern, from, options, permissionProcessor);
    const container = containerOf(element);
    let misplaced = false;
    node.children = childSpecs.map((childSpec, i) => {
        const child = syncNode(children[i], childSpec, from, options, permissionProcessor);
        if (child !== children[i]) children[i].element.remove();
        if (child.element.parentNode !== container) misplaced = true;
        return child;
    });
    // A rebuilt child, or a pattern that replaced the element's content (e.g. textContent)
    if (misplaced) container.append(...node.children.map(c => c.element));
}

/** A manager's ctx.rebind(): re-apply the node's subtree against the manager instance. */
function rebindNode(node: TreeNode): void {
    if (node.binding) return;
    const [, , , pattern, childSpecs] = normalize(node.spec);
    node.binding = true;
    try {
        bindContent(node, pattern, childSpecs, (node.element as any).ish);
    } finally {
        node.binding = false;
    }
}

function createNode(
    spec: ElementSpecification,
    value: any,
    options: AssignFromOptions,
    permissionProcessor?: PermissionProcessor
): TreeNode {
    const [, tag, ish, pattern, childSpecs] = normalize(spec);
    const element = document.createElement(tag);
    const node: TreeNode = { tag, ish, element, children: [], spec, options, permissionProcessor, binding: true };
    try {
        const from = ish === undefined ? value : attachManager(node, ish, value);
        applyPattern(element, pattern, from, options, permissionProcessor);
        const container = containerOf(element);
        node.children = childSpecs.map(childSpec => {
            const child = createNode(childSpec, from, options, permissionProcessor);
            container.appendChild(child.element);
            return child;
        });
    } finally {
        node.binding = false;
    }
    return node;
}

/**
 * Rebind an existing node in place, or create it when there's none or its
 * structure (tag, manager, child count) no longer matches the spec.
 */
function syncNode(
    node: TreeNode | undefined,
    spec: ElementSpecification,
    value: any,
    options: AssignFromOptions,
    permissionProcessor?: PermissionProcessor
): TreeNode {
    const [, tag, ish, pattern, childSpecs] = normalize(spec);
    if (!node || node.tag !== tag || node.ish !== ish || node.children.length !== childSpecs.length) {
        return createNode(spec, value, options, permissionProcessor);
    }
    Object.assign(node, { spec, options, permissionProcessor });
    node.binding = true;
    try {
        let from = value;
        if (ish !== undefined) {
            const element = node.element as any;
            element.ish = value;
            from = element.ish;
        }
        bindContent(node, pattern, childSpecs, from);
    } finally {
        node.binding = false;
    }
    return node;
}

/** Find the tree's markers among the target's direct children. */
function findChildMarkers(target: Element, name: string): [Comment, Comment] | undefined {
    const startText = `${MARKER_START_PREFIX}${name}"`;
    let start: Comment | undefined;
    for (const node of target.childNodes) {
        if (node.nodeType !== Node.COMMENT_NODE) continue;
        const { data } = node as Comment;
        if (!start) {
            if (data === startText) start = node as Comment;
        } else if (data === MARKER_END) {
            return [start, node as Comment];
        }
    }
    return undefined;
}

/** Map entries in order, followed by `'*'` entries for the VM keys the map doesn't name. */
function getEntries(map: Record<string, ElementSpecification>, from: any): [string, ElementSpecification][] {
    const entries: [string, ElementSpecification][] = [];
    for (const key of Object.keys(map)) {
        if (key !== WILDCARD) entries.push([key, map[key]]);
    }
    const wildcard = map[WILDCARD];
    if (wildcard === undefined || from === null || typeof from !== 'object') return entries;
    const [header, , , pattern = DEFAULT_WILDCARD_PATTERN, children] = normalize(wildcard);
    for (const key of Object.keys(from)) {
        if (!(key in map)) entries.push([key, [header, pattern, children]]);
    }
    return entries;
}

/** Place elements in order right after `start`, moving only the ones that are out of place. */
function placeInOrder(parent: Element, elements: Element[], start: Comment): void {
    let cursor = start.nextSibling;
    for (const element of elements) {
        if (element === cursor) {
            cursor = cursor.nextSibling;
        } else {
            parent.insertBefore(element, cursor);
        }
    }
}

/**
 * TreeHandler — builds a tree of elements from a VM, and rebinds it on later calls.
 */
export class TreeHandler implements AssignFromHandler {
    config: TreeConfig;

    constructor(config: TreeConfig) {
        this.config = config;
    }

    assign(lhsTarget: any, _resolvedParams: Record<string, any>, options: AssignFromOptions, permissionProcessor?: PermissionProcessor): void {
        if (!(lhsTarget instanceof Element)) return;
        const { map, markerName = DEFAULT_MARKER_NAME, keepNullish } = this.config;
        if (!map || typeof map !== 'object') {
            throw new Error('builtIns.tree: a "map" of VM keys to element specifications is required');
        }
        const { from, fromStack } = options;
        // Each key's pattern resolves against the key's value, one level down: the VM becomes `$parent`
        const nestedOptions = { ...options, fromStack: [...(fromStack ?? []), from] };

        const [start, end] = findChildMarkers(lhsTarget, markerName) ?? createMarkers(lhsTarget, markerName);
        let nodes = treeStates.get(start);
        if (!nodes) {
            // Markers without state (cloned or server-rendered): Tree doesn't adopt markup, so start fresh
            for (const node of getNodesBetweenMarkers(start, end)) (node as ChildNode).remove();
            nodes = new Map();
            warnUnmatchedKeys(map, from);
        }

        const next = new Map<string, TreeNode>();
        for (const [key, spec] of getEntries(map, from)) {
            const value = from?.[key];
            if (value == null && !keepNullish) continue;
            let node = nodes.get(key);
            // Removed or moved by other code: rebuild
            if (node && node.element.parentNode !== lhsTarget) node = undefined;
            next.set(key, syncNode(node, spec, value, nestedOptions, permissionProcessor));
        }
        for (const [key, node] of nodes) {
            if (next.get(key) !== node && node.element.parentNode === lhsTarget) node.element.remove();
        }
        placeInOrder(lhsTarget, [...next.values()].map(n => n.element), start);
        treeStates.set(start, next);
    }
}

/** On a tree's first render, warn about map keys the VM doesn't have (likely typos). */
function warnUnmatchedKeys(map: Record<string, ElementSpecification>, from: any): void {
    if (from === null || typeof from !== 'object') return;
    for (const key of Object.keys(map)) {
        if (key !== WILDCARD && !(key in from)) {
            console.warn(`builtIns.tree: map key "${key}" isn't in the view model (typo?)`);
        }
    }
}
