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
import { applyAttribute, assignGingerly, tryAssignTo } from '../assignGingerly.js';
import { getValue, getValues, isEventBinding } from '../resolve/getValues.js';
import { DEFAULT_WILDCARD_PATTERN, isLiteralString, normalize, WILDCARD } from './treeSpec.js';
import { defineIshCore } from '../handleIshProperty.js';
import { createMarkers, getNodesBetweenMarkers, MARKER_START_PREFIX, MARKER_END } from '../markerUtils.js';
import type {
    AssignFromHandler, AssignFromOptions, ItemscopeManagerConfig, ItemscopeRegistry, PermissionProcessor,
} from '../types/assign-gingerly/types.js';
import type {
    ElementSpecification, ManagerRef, Pattern, RepeatSpecification, TreeConfig,
} from '../types/assign-gingerly/treeTypes.js';

const DEFAULT_MARKER_NAME = 'tree';

/**
 * Options key carrying the tree's target (an Element, ShadowRoot or other DocumentFragment)
 * down to every node, so managers resolve through the target's — possibly scoped — registry.
 */
const TREE_TARGET = Symbol('builtIns.tree target');

/** What a tree can render into. */
type TreeTarget = Element | DocumentFragment;

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
    /** Where children go: a template's content, otherwise the element itself (computed once) */
    container: ParentNode;
    /** Present when the node repeats (`{ each, … }` in the children slot) instead of having static children */
    repeat?: RepeatState;
    /** The pattern (and effective aka) last applied to the element; see bindContent */
    appliedPattern?: Pattern;
    appliedAka?: Record<string, string>;
}

/** A repeating node's items, by key, and its `empty` node while the array is empty. */
interface RepeatState {
    items: Map<unknown, TreeNode>;
    empty: TreeNode | undefined;
    /** Whether a duplicate-key warning has been logged for this node */
    warned: boolean;
}

/** Created nodes per tree, keyed by the tree's start marker. */
const treeStates = new WeakMap<Comment, Map<string, TreeNode>>();

/** Whether a pattern only has plain keys, so it can skip assignFrom's key categorization. */
const plainPatterns = new WeakMap<Pattern, boolean>();

/** Patterns whose ` +=` event bindings got a default dedup key (identity when there were none). */
const eventKeyedPatterns = new WeakMap<Pattern, Pattern>();

/**
 * Give each ` +=` event binding without a `get.key` a default one, so re-applying the
 * pattern on a rerun replaces the element's listener instead of adding another (and the
 * listener's host is always the current `from`).
 */
function withEventKeys(pattern: Pattern): Pattern {
    let keyed = eventKeyedPatterns.get(pattern);
    if (keyed) return keyed;
    keyed = pattern;
    for (const key of Object.keys(pattern)) {
        const value = pattern[key];
        if (isEventBinding(key, value) && value.get?.key === undefined) {
            if (keyed === pattern) keyed = { ...pattern };
            keyed[key] = { ...value, get: { ...value.get, key: `builtIns.tree:${key}` } };
        }
    }
    eventKeyedPatterns.set(pattern, keyed);
    return keyed;
}

/** Where an element's children go: a template's content, otherwise the element itself. */
function containerOf(element: Element): ParentNode {
    return element.localName === 'template' ? (element as HTMLTemplateElement).content : element;
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
    permissionProcessor?: PermissionProcessor,
    skipLiterals = false
): void {
    if (!pattern) return;
    pattern = withEventKeys(pattern);
    const fast = compileFastPattern(pattern);
    if (fast && fastPathAllowed(options, permissionProcessor) && applyFast(element, fast, from, options, skipLiterals)) return;
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

// ── Fast path for plain patterns ─────────────────────────────────────────────
//
// Most Tree patterns are a few plain properties set to literals or `?.` paths
// (`{ className: 'card', textContent: '?.name' }`). Going through getValues +
// assignGingerly for those costs more than the assignments themselves (alias/method
// maps rebuilt per call, key copying, option spreads). The fast path resolves and
// assigns them directly, with the same semantics, and falls back to the general
// path for anything else.

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
/** A ` :=` key with a plain attribute name (no path): `'aria-label :='` → `aria-label`. */
const ATTR_KEY = /^([A-Za-z_:][\w:.-]*) :=$/;

/** A fast value: a literal, or a `?.` path (pre-split). */
interface FastValue {
    literal: boolean;
    value: any;
    parts: string[];
}

/** One entry of a fast pattern: a plain property, or (`attr`) a ` :=` attribute. */
interface FastEntry extends FastValue {
    key: string;
    attr: boolean;
    /** For an attribute set from an array (space-joined tokens) */
    items?: FastValue[];
}

/** Fast entries per pattern, or null when the pattern needs the general path. */
const fastPatterns = new WeakMap<Pattern, FastEntry[] | null>();

/** A primitive literal or a `?.` path → a fast value; anything else → null. */
function compileFastValue(value: any): FastValue | null {
    if (typeof value === 'string') {
        if (value.startsWith('?.')) return { literal: false, value, parts: splitPath(value) };
        return isLiteralString(value) ? { literal: true, value, parts: [] } : null;
    }
    if (value == null || typeof value === 'number' || typeof value === 'boolean') return { literal: true, value, parts: [] };
    return null;
}

/**
 * Compile a pattern into fast entries. Every key must be a plain identifier (not `ish`)
 * or a ` :=` attribute key with a plain name. Every value must be a primitive literal or
 * a `?.` path, and for attributes also an array of those. Anything else → null (general path).
 */
function compileFastPattern(pattern: Pattern): FastEntry[] | null {
    let entries = fastPatterns.get(pattern);
    if (entries !== undefined) return entries;
    entries = [];
    for (const key of Object.keys(pattern)) {
        const value = pattern[key];
        const attrMatch = ATTR_KEY.exec(key);
        if (!attrMatch && (!IDENTIFIER.test(key) || key === 'ish')) { entries = null; break; }
        if (attrMatch && Array.isArray(value)) {
            const items = value.map(compileFastValue);
            if (items.some(item => item === null)) { entries = null; break; }
            const fastItems = items as FastValue[];
            entries.push({ key: attrMatch[1], attr: true, literal: fastItems.every(i => i.literal), value, parts: [], items: fastItems });
            continue;
        }
        const fast = compileFastValue(value);
        if (!fast) { entries = null; break; }
        entries.push({ key: attrMatch ? attrMatch[1] : key, attr: !!attrMatch, ...fast });
    }
    fastPatterns.set(pattern, entries);
    return entries;
}

/** Options that change how plain keys resolve or assign rule out the fast path. */
function fastPathAllowed(options: AssignFromOptions, permissionProcessor?: PermissionProcessor): boolean {
    if (permissionProcessor) return false;
    const { pin, at, substitutions, akaMethods, withAsyncMethods, withMethods } = options as any;
    if (pin || at || substitutions || akaMethods || withAsyncMethods) return false;
    if (withMethods && (withMethods.size ?? withMethods.length)) return false;
    return !SUBSTITUTION_VARS.some(({ optionKey }) => (options as any)[optionKey]?.length);
}

/** Pre-split `?.` paths, cached by string. */
const splitPaths = new Map<string, string[]>();

function splitPath(path: string): string[] {
    let parts = splitPaths.get(path);
    if (!parts) splitPaths.set(path, parts = path.split('?.').filter(p => p.length > 0));
    return parts;
}

/**
 * Resolve a `?.` path directly when nothing can change its meaning (fast-path options,
 * and no segment that's aliased or names a pipe); otherwise through getValue.
 */
function resolvePath(
    path: string,
    parts: string[],
    from: any,
    options: AssignFromOptions,
    element: Element,
    fastAllowed: boolean,
    permissionProcessor?: PermissionProcessor
): any {
    const { aka, pipes } = options as any;
    if (!fastAllowed || ((aka || pipes) && parts.some(p => (aka && Object.hasOwn(aka, p)) || (pipes && Object.hasOwn(pipes, p))))) {
        return getValue(path, from, { ...options, from, root: element, permissionProcessor } as any);
    }
    let value = from;
    for (const part of parts) {
        if (value == null) break;
        value = value[part];
    }
    return value;
}

/**
 * Resolve and assign fast entries, mirroring getValues + assignGingerly:
 * - aliases apply to keys (and attribute names);
 * - a path segment that's aliased or names a pipe resolves through getValue;
 * - attributes go through applyAttribute (the same function ` :=` uses);
 * - plain-object property values merge through assignGingerly;
 * - otherwise `tryAssignTo`, or a plain assignment.
 * Returns false (before assigning anything) when an alias maps a property key to
 * something that isn't a plain property.
 */
function applyFast(element: Element, entries: FastEntry[], from: any, options: AssignFromOptions, skipLiterals: boolean): boolean {
    const { aka } = options as any;
    if (aka) {
        for (const { key, attr } of entries) {
            if (Object.hasOwn(aka, key)) {
                const mapped = aka[key];
                if (typeof mapped !== 'string' || (!attr && (!IDENTIFIER.test(mapped) || mapped === 'ish'))) return false;
            }
        }
    }
    const target = element as any;
    const resolve = (fast: FastValue) => fast.literal ? fast.value : resolvePath(fast.value, fast.parts, from, options, element, true);
    for (const entry of entries) {
        if (skipLiterals && entry.literal) continue;
        const key: string = aka && Object.hasOwn(aka, entry.key) ? aka[entry.key] : entry.key;
        if (entry.attr) {
            applyAttribute(target, key, entry.items ? entry.items.map(resolve) : resolve(entry));
            continue;
        }
        const value = resolve(entry);
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            assignGingerly(target, { [key]: value }, { ...options, from, aka: undefined } as any);
        } else if (key === 'textContent') {
            // Unchanged text is skipped: re-assigning would replace the text node for nothing
            const text = value == null ? '' : String(value);
            if (target.textContent !== text) target.textContent = text;
        } else if (!(key in target && tryAssignTo(target[key], value, target, key))) {
            target[key] = value;
        }
    }
    return true;
}

/** Shallow equality for aka maps (Tree merges config aka into a new object per call). */
function sameAka(a: Record<string, string> | undefined, b: Record<string, string> | undefined): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    const keys = Object.keys(a);
    if (keys.length !== Object.keys(b).length) return false;
    for (const key of keys) if (a[key] !== b[key]) return false;
    return true;
}

/**
 * Resolve a header's manager to its registered config. A class is registered under
 * `is ?? name` if needed; a name must already be registered.
 */
function resolveManagerConfig(ish: ManagerRef, element: Element, options: AssignFromOptions): ItemscopeManagerConfig {
    // The tree's target first (a shadow root may carry a scoped registry), then the element, then the global one
    const treeTarget = (options as any)[TREE_TARGET];
    const registry: ItemscopeRegistry | undefined = treeTarget?.customElementRegistry?.itemscopeRegistry
        ?? (element as any).customElementRegistry?.itemscopeRegistry
        ?? (typeof customElements !== 'undefined' ? customElements.itemscopeRegistry : undefined);
    if (!registry) throw new Error('builtIns.tree: no itemscope registry is available');
    if (typeof ish === 'string') {
        const config = registry.get(ish);
        if (!config) throw new Error(`builtIns.tree: itemscope manager "${ish}" isn't registered`);
        return config;
    }
    const name = ish.is ?? ish.name;
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
    const config = resolveManagerConfig(ish, element, options);
    const rebind = () => rebindNode(node);
    defineIshCore(element as HTMLElement, config, options, assignGingerly, { ctx: { rebind }, onSettled: rebind });
    (element as any).ish = value;
    return (element as any).ish;
}

/** Place elements as the container's first children, in order, moving only the ones out of place. */
function placeChildren(container: ParentNode, elements: Element[]): void {
    let cursor = container.firstChild;
    for (const element of elements) {
        if (element === cursor) {
            cursor = cursor.nextSibling;
        } else {
            container.insertBefore(element, cursor);
        }
    }
}

/**
 * Stamp `each` once per item of the array at `of`, reusing items' nodes by `key`
 * (default: index), or render `empty` when there are no items. Inside items, `?.` is
 * the item and `$parent` is the object holding the array.
 */
function bindRepeat(node: TreeNode, repeat: RepeatSpecification, from: any): void {
    const { element, options, permissionProcessor } = node;
    const { each, of = '?.', key, empty } = repeat;
    const fastAllowed = fastPathAllowed(options, permissionProcessor);
    const list = of.startsWith('?.')
        ? resolvePath(of, splitPath(of), from, options, element, fastAllowed, permissionProcessor)
        : getValue(of, from, { ...options, from, root: element, permissionProcessor } as any);
    const items: any[] = list != null && typeof list[Symbol.iterator] === 'function' ? Array.from(list) : [];
    // With the default `of`, the node's value is the array, and the stack's top is already its holder
    const itemOptions = of === '?.' ? options : { ...options, fromStack: [...(options.fromStack ?? []), from] };

    const keyParts = key !== undefined && key.startsWith('?.') ? splitPath(key) : undefined;
    const keyFast = itemOptions === options ? fastAllowed : fastPathAllowed(itemOptions, permissionProcessor);
    const { container } = node;
    const state = node.repeat ??= { items: new Map(), empty: undefined, warned: false };
    const next = new Map<unknown, TreeNode>();
    items.forEach((item, index) => {
        let itemKey: unknown = key === undefined ? index
            : keyParts ? resolvePath(key, keyParts, item, itemOptions, element, keyFast, permissionProcessor)
            : getValue(key, item, { ...itemOptions, from: item, root: element, permissionProcessor } as any);
        if (next.has(itemKey)) {
            if (!state.warned) {
                console.warn(`builtIns.tree: duplicate key ${JSON.stringify(itemKey)} in a repeat; falling back to the index for duplicates`);
                state.warned = true;
            }
            itemKey = Symbol.for(`builtIns.tree:index:${index}`);
        }
        let itemNode = state.items.get(itemKey);
        // Removed or moved by other code: rebuild
        if (itemNode && itemNode.element.parentNode !== container) itemNode = undefined;
        next.set(itemKey, syncNode(itemNode, each, item, itemOptions, permissionProcessor));
    });
    for (const [itemKey, itemNode] of state.items) {
        if (next.get(itemKey) !== itemNode && itemNode.element.parentNode === container) itemNode.element.remove();
    }
    state.items = next;

    let elements = [...next.values()].map(n => n.element);
    if (items.length === 0 && empty !== undefined) {
        const current = state.empty?.element.parentNode === container ? state.empty : undefined;
        state.empty = syncNode(current, empty, from, options, permissionProcessor);
        elements = [state.empty.element];
    } else if (state.empty) {
        state.empty.element.remove();
        state.empty = undefined;
    }
    placeChildren(container, elements);
}

/**
 * Apply a node's own pattern, then sync its static children or its repeat, all against `from`.
 */
function bindContent(
    node: TreeNode,
    pattern: Pattern | undefined,
    childSpecs: ElementSpecification[],
    repeat: RepeatSpecification | undefined,
    from: any
): void {
    const { element, children, options, permissionProcessor } = node;
    // Literal keys can't have changed if this exact pattern object (and aka) was applied last time.
    // (An inline config creates new pattern objects per call, so its literals are always re-applied.)
    const { aka } = options as any;
    const skipLiterals = node.appliedPattern === pattern && sameAka(node.appliedAka, aka);
    applyPattern(element, pattern, from, options, permissionProcessor, skipLiterals);
    node.appliedPattern = pattern;
    node.appliedAka = aka;
    if (repeat) {
        bindRepeat(node, repeat, from);
        return;
    }
    const { container } = node;
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
    const [, , , pattern, childSpecs, repeat] = normalize(node.spec);
    node.binding = true;
    try {
        bindContent(node, pattern, childSpecs, repeat, (node.element as any).ish);
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
    const [, tag, ish, pattern, childSpecs, repeat] = normalize(spec);
    const element = document.createElement(tag);
    const node: TreeNode = {
        tag, ish, element, children: [], spec, options, permissionProcessor, binding: true, container: containerOf(element),
    };
    try {
        const from = ish === undefined ? value : attachManager(node, ish, value);
        if (repeat) {
            bindContent(node, pattern, childSpecs, repeat, from);
            return node;
        }
        applyPattern(element, pattern, from, options, permissionProcessor);
        node.appliedPattern = pattern;
        node.appliedAka = (options as any).aka;
        const { container } = node;
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
            const element = node.element as any;
            element.ish = value;
            from = element.ish;
        }
        bindContent(node, pattern, childSpecs, repeat, from);
    } finally {
        node.binding = false;
    }
    return node;
}

/** Find the tree's markers among the target's direct children. */
function findChildMarkers(target: TreeTarget, name: string): [Comment, Comment] | undefined {
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
    const [header, , , pattern = DEFAULT_WILDCARD_PATTERN, children, repeat] = normalize(wildcard);
    for (const key of Object.keys(from)) {
        if (!(key in map)) entries.push([key, [header, pattern, repeat ?? children]]);
    }
    return entries;
}

/** Place elements in order right after `start`, moving only the ones that are out of place. */
function placeInOrder(parent: TreeTarget, elements: Element[], start: Comment): void {
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
        // Elements, shadow roots and other document fragments
        if (!(lhsTarget instanceof Element || lhsTarget instanceof DocumentFragment)) return;
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
        } as AssignFromOptions;

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
