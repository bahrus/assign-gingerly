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
 * Nested trees: a `{ map, … }` object in the children slot (a tree config minus `do`)
 * renders a tree into the element, with the element's value as its VM, synchronously.
 * (A ` =>` builtIns.tree in a pattern is also synchronous once tree.js is loaded, which
 * it is while a tree runs, but goes through the handler dispatch.)
 *
 * Itemscope managers: an object header `{ tag, ish }` attaches a manager (a name, resolved
 * through the `registry` option's itemscopeRegistry first, or a class, attached directly and
 * registered nowhere) to the element, without an `itemscope`
 * attribute. Each call assigns the key's value to `el.ish`, and the element's own
 * pattern and its children's patterns resolve against the manager instance, so
 * computed values are just getters. The manager receives `ctx.rebind()` (constructor
 * third argument, and in onAssigned's ctx) to re-apply its subtree after changing its
 * own state; Tree calls it itself once an async onAssigned settles.
 *
 * Switches: `{ switch, cases, default? }` anywhere a specification goes renders the case
 * the discriminant picks, against the same value. The same case is rebound in place; a
 * different case replaces the previous one in its slot. When nothing renders, a placeholder
 * comment keeps the slot, so the switch's siblings and parent aren't rebuilt.
 *
 * Snippets: `{ snippet: 'name' }` anywhere a specification goes renders static HTML from the
 * `snippets` option (see handlers/snippets.ts): parsed and checked once per string, cloned per
 * instance, possibly several root elements, held by one node that later calls never visit.
 *
 * Experimental `compile` option: elements are created by cloning templates compiled from
 * the map (static parts baked in) instead of createElement; see "compile: clone-and-bind" below.
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
import { getValue, getValues } from '../resolve/getValues.js';
import { withEventKeys } from './eventKeys.js';
import { chooseCase, DEFAULT_CASE, isLiteralString, isSnippet, isSwitch, mapEntries, normalize, repeatItems, WILDCARD } from './treeSpec.js';
import { cloneSnippet, parsedSnippet } from './snippets.js';
import { defineIshCore } from '../handleIshProperty.js';
import { createMarkers, getNodesBetweenMarkers, MARKER_START_PREFIX, MARKER_END, PENDING_ATTRIBUTE } from '../markerUtils.js';
import { placeNodes } from '../utils/placeNodes.js';
import { resolveRegistry } from '../utils/resolveRegistry.js';
const DEFAULT_MARKER_NAME = 'tree';
/**
 * Options key carrying the tree's target (an Element, ShadowRoot or other DocumentFragment)
 * down to every node, so managers resolve through the target's — possibly scoped — registry.
 */
const TREE_TARGET = Symbol('builtIns.tree target');
/** Options key carrying the tree's compiled variant (with `compile`) down to repeats and rebinds. */
const TREE_COMPILED = Symbol('builtIns.tree compiled');
/** Options key: adopt existing markup found between markers without state (`adopt`), carried down to nested trees. */
const TREE_ADOPT = Symbol('builtIns.tree adopt');
/** Options key: during an `adopt: 'pending'` tree's first run, what that run binds (see PendingScope). */
const TREE_PENDING = Symbol('builtIns.tree pending');
/** Compiled variants per map object (specs are treated as immutable: replace a map to change it). */
const compiledMaps = new WeakMap();
/** The compiler module, loaded by TreeHandler.prepare only for `compile` configs. */
let compiler;
let warnedNoCompiler = false;
/** The comment holding an empty switch's slot. */
const SWITCH_PLACEHOLDER = '?switch';
// ── A node's DOM nodes: its element, or a snippet's several (also through switch slots) ──
/** A snippet's nodes, when the node is (or a switch slot currently renders) a snippet. */
function snippetNodes(node) {
    for (let at = node; at; at = at.switch?.inner) {
        if (at.snippet)
            return at.snippet.nodes;
    }
    return undefined;
}
/** Append a node's DOM nodes to `out`. */
function pushNodes(node, out) {
    const nodes = snippetNodes(node);
    if (nodes)
        out.push(...nodes);
    else
        out.push(node.element);
}
/** A node's DOM nodes. */
function nodesOf(node) {
    const out = [];
    pushNodes(node, out);
    return out;
}
/** Whether all of a node's DOM nodes are still children of `parent` (not removed or moved by other code). */
function inPlace(node, parent) {
    const nodes = snippetNodes(node);
    return nodes ? nodes.every(n => n.parentNode === parent) : node.element.parentNode === parent;
}
/** Remove a node's DOM nodes. */
function removeNode(node) {
    const nodes = snippetNodes(node);
    if (nodes)
        for (const n of nodes)
            n.remove();
    else
        node.element.remove();
}
/** Created nodes per tree, keyed by the tree's start marker. */
const treeStates = new WeakMap();
/** Whether a pattern only has plain keys, so it can skip assignFrom's key categorization. */
const plainPatterns = new WeakMap();
/** Where an element's children go: a template's content, otherwise the element itself. */
function containerOf(element) {
    return element.localName === 'template' ? element.content : element;
}
/**
 * Apply a pattern to an element, resolving against `from` (the key's VM value, or the
 * manager instance). Plain patterns (the common case) go straight to getValues +
 * assignGingerly; anything else goes through assignFrom.
 */
function applyPattern(element, pattern, from, options, permissionProcessor, skipLiterals = false) {
    if (!pattern)
        return;
    pattern = withEventKeys(pattern, 'builtIns.tree');
    const fast = compileFastPattern(pattern);
    if (fast && fastPathAllowed(options, permissionProcessor) && applyFast(element, fast, from, options, skipLiterals))
        return;
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
/** Fast entries per pattern, or null when the pattern needs the general path. */
const fastPatterns = new WeakMap();
/** A primitive literal or a `?.` path → a fast value; anything else → null. */
function compileFastValue(value) {
    if (typeof value === 'string') {
        if (value.startsWith('?.'))
            return { literal: false, value, parts: splitPath(value) };
        return isLiteralString(value) ? { literal: true, value, parts: [] } : null;
    }
    if (value == null || typeof value === 'number' || typeof value === 'boolean')
        return { literal: true, value, parts: [] };
    return null;
}
/**
 * Compile a pattern into fast entries. Every key must be a plain identifier (not `ish`)
 * or a ` :=` attribute key with a plain name. Every value must be a primitive literal or
 * a `?.` path, and for attributes also an array of those. Anything else → null (general path).
 */
function compileFastPattern(pattern) {
    let entries = fastPatterns.get(pattern);
    if (entries !== undefined)
        return entries;
    entries = [];
    for (const key of Object.keys(pattern)) {
        const value = pattern[key];
        const attrMatch = ATTR_KEY.exec(key);
        if (!attrMatch && (!IDENTIFIER.test(key) || key === 'ish')) {
            entries = null;
            break;
        }
        if (attrMatch && Array.isArray(value)) {
            const items = value.map(compileFastValue);
            if (items.some(item => item === null)) {
                entries = null;
                break;
            }
            const fastItems = items;
            entries.push({ key: attrMatch[1], attr: true, literal: fastItems.every(i => i.literal), value, parts: [], items: fastItems });
            continue;
        }
        const fast = compileFastValue(value);
        if (!fast) {
            entries = null;
            break;
        }
        entries.push({ key: attrMatch ? attrMatch[1] : key, attr: !!attrMatch, ...fast });
    }
    fastPatterns.set(pattern, entries);
    return entries;
}
/** Options that change how plain keys resolve or assign rule out the fast path. */
function fastPathAllowed(options, permissionProcessor) {
    if (permissionProcessor)
        return false;
    const { pin, at, substitutions, akaMethods, withAsyncMethods, withMethods } = options;
    if (pin || at || substitutions || akaMethods || withAsyncMethods)
        return false;
    if (withMethods && (withMethods.size ?? withMethods.length))
        return false;
    return !SUBSTITUTION_VARS.some(({ optionKey }) => options[optionKey]?.length);
}
/** Pre-split `?.` paths, cached by string. */
const splitPaths = new Map();
function splitPath(path) {
    let parts = splitPaths.get(path);
    if (!parts)
        splitPaths.set(path, parts = path.split('?.').filter(p => p.length > 0));
    return parts;
}
/**
 * Resolve a `?.` path directly when nothing can change its meaning (fast-path options,
 * and no segment that's aliased or names a pipe); otherwise through getValue.
 */
function resolvePath(path, parts, from, options, element, fastAllowed, permissionProcessor) {
    const { aka, pipes } = options;
    if (!fastAllowed || ((aka || pipes) && parts.some(p => (aka && Object.hasOwn(aka, p)) || (pipes && Object.hasOwn(pipes, p))))) {
        return getValue(path, from, { ...options, from, root: element, permissionProcessor });
    }
    let value = from;
    for (const part of parts) {
        if (value == null)
            break;
        value = value[part];
    }
    return value;
}
/** Resolve any RHS path: `?.` paths through resolvePath (fast when allowed), others through getValue. */
function resolveAny(path, from, options, root, fastAllowed, permissionProcessor) {
    return path.startsWith('?.')
        ? resolvePath(path, splitPath(path), from, options, root, fastAllowed, permissionProcessor)
        : getValue(path, from, { ...options, from, root, permissionProcessor });
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
function applyFast(element, entries, from, options, skipLiterals) {
    const { aka } = options;
    if (aka) {
        for (const { key, attr } of entries) {
            if (Object.hasOwn(aka, key)) {
                const mapped = aka[key];
                if (typeof mapped !== 'string' || (!attr && (!IDENTIFIER.test(mapped) || mapped === 'ish')))
                    return false;
            }
        }
    }
    const target = element;
    const resolve = (fast) => fast.literal ? fast.value : resolvePath(fast.value, fast.parts, from, options, element, true);
    for (const entry of entries) {
        if (skipLiterals && entry.literal)
            continue;
        const key = aka && Object.hasOwn(aka, entry.key) ? aka[entry.key] : entry.key;
        if (entry.attr) {
            applyAttribute(target, key, entry.items ? entry.items.map(resolve) : resolve(entry));
            continue;
        }
        const value = resolve(entry);
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
            assignGingerly(target, { [key]: value }, { ...options, from, aka: undefined });
        }
        else if (key === 'textContent') {
            // Unchanged text is skipped: re-assigning would replace the text node for nothing
            const text = value == null ? '' : String(value);
            if (target.textContent !== text)
                target.textContent = text;
        }
        else if (!(key in target && tryAssignTo(target[key], value, target, key))) {
            target[key] = value;
        }
    }
    return true;
}
/** Shallow equality for aka maps (Tree merges config aka into a new object per call). */
function sameAka(a, b) {
    if (a === b)
        return true;
    if (!a || !b)
        return false;
    const keys = Object.keys(a);
    if (keys.length !== Object.keys(b).length)
        return false;
    for (const key of keys)
        if (a[key] !== b[key])
            return false;
    return true;
}
/** Configs for managers given as classes: attached directly, never registered. */
const classManagerConfigs = new WeakMap();
/**
 * Resolve a header's manager to its config. A class is used directly, without registering
 * it anywhere (no side effect). A name is looked up in the call's `registry` option, then
 * the tree's target's registry (a shadow root may carry a scoped one), then the element's,
 * then the global one.
 */
function resolveManagerConfig(ish, element, options) {
    if (typeof ish !== 'string') {
        let config = classManagerConfigs.get(ish);
        if (!config)
            classManagerConfigs.set(ish, config = { manager: ish });
        return config;
    }
    const registry = resolveRegistry('itemscopeRegistry', options, options[TREE_TARGET], element);
    if (!registry)
        throw new Error('builtIns.tree: no itemscope registry is available');
    const config = registry.get(ish);
    if (!config)
        throw new Error(`builtIns.tree: itemscope manager "${ish}" isn't registered`);
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
/** Place nodes as the container's first children, in order, moving only the ones out of place. */
function placeChildren(container, elements) {
    placeNodes(container, elements, container.firstChild);
}
/**
 * Stamp `each` once per item of the array at `of`, reusing items' nodes by `key`
 * (default: index), or render `empty` when there are no items. Inside items, `?.` is
 * the item and `$parent` is the object holding the array.
 */
function bindRepeat(node, repeat, from) {
    const { element, options, permissionProcessor } = node;
    const { each, of = '?.' } = repeat;
    const fastAllowed = fastPathAllowed(options, permissionProcessor);
    // With the default `of`, the node's value is the array, and the stack's top is already its holder
    const itemOptions = of === '?.' ? options : { ...options, fromStack: [...(options.fromStack ?? []), from] };
    const keyFast = itemOptions === options ? fastAllowed : fastPathAllowed(itemOptions, permissionProcessor);
    const resolve = (path, value, forItem) => forItem
        ? resolveAny(path, value, itemOptions, element, keyFast, permissionProcessor)
        : resolveAny(path, value, options, element, fastAllowed, permissionProcessor);
    // What to stamp: decided by the shared, pure repeatItems (so other renderers decide the same)
    const stamp = repeatItems(repeat, from, resolve);
    const { items, keys, empty } = stamp;
    const { container } = node;
    const [eachTemplate, emptyTemplate] = repeatTemplates(node);
    const state = node.repeat ??= { items: new Map(), empty: undefined, warned: false };
    if ('duplicate' in stamp && !state.warned) {
        console.warn(`builtIns.tree: duplicate key ${JSON.stringify(stamp.duplicate)} in a repeat; falling back to the index for duplicates`);
        state.warned = true;
    }
    const next = new Map();
    for (let index = 0; index < items.length; index++) {
        const itemKey = keys[index];
        let itemNode = state.items.get(itemKey);
        // Removed or moved by other code: rebuild
        if (itemNode && !inPlace(itemNode, container))
            itemNode = undefined;
        next.set(itemKey, syncNode(itemNode, each, items[index], itemOptions, permissionProcessor, eachTemplate));
    }
    for (const [itemKey, itemNode] of state.items) {
        if (next.get(itemKey) !== itemNode && itemNode.element.parentNode === container)
            removeNode(itemNode);
    }
    state.items = next;
    let elements = [];
    for (const itemNode of next.values())
        pushNodes(itemNode, elements);
    if (empty !== undefined) {
        const current = state.empty && inPlace(state.empty, container) ? state.empty : undefined;
        state.empty = syncNode(current, empty, from, options, permissionProcessor, emptyTemplate);
        elements = nodesOf(state.empty);
    }
    else if (state.empty) {
        removeNode(state.empty);
        state.empty = undefined;
    }
    placeChildren(container, elements);
}
/**
 * Render a nested tree (`{ map, … }` in the children slot) into the node's container, with
 * `from` as its VM: what `{ '?. =>': { do: 'builtIns.tree', ...nested } }` in the node's
 * pattern would do, without the handler dispatch. The nested tree keeps its own state
 * (between its own markers), so later calls rebind it in place.
 */
function bindNested(node, nested, from) {
    const { container, options, permissionProcessor } = node;
    new TreeHandler(nested).assign(container, {}, { ...options, from }, permissionProcessor);
}
/**
 * Apply a node's own pattern, then sync its static children, its repeat or its nested
 * tree, all against `from`.
 */
function bindContent(node, pattern, childSpecs, repeat, nested, from) {
    const { element, children, options, permissionProcessor } = node;
    // Literal keys can't have changed if this exact pattern object (and aka) was applied last time.
    // (An inline config creates new pattern objects per call, so its literals are always re-applied.)
    const { aka } = options;
    const skipLiterals = node.appliedPattern === pattern && sameAka(node.appliedAka, aka);
    applyPattern(element, pattern, from, options, permissionProcessor, skipLiterals);
    node.appliedPattern = pattern;
    node.appliedAka = aka;
    if (repeat) {
        bindRepeat(node, repeat, from);
        return;
    }
    if (nested) {
        bindNested(node, nested, from);
        return;
    }
    const { container } = node;
    let misplaced = false;
    node.children = childSpecs.map((childSpec, i) => {
        const child = syncNode(children[i], childSpec, from, options, permissionProcessor);
        if (child !== children[i])
            removeNode(children[i]);
        if (!inPlace(child, container))
            misplaced = true;
        return child;
    });
    // A rebuilt child, or a pattern that replaced the element's content (e.g. textContent)
    if (misplaced)
        container.append(...node.children.flatMap(nodesOf));
}
/** A manager's ctx.rebind(): re-apply the node's subtree against the manager instance. */
function rebindNode(node) {
    if (node.binding)
        return;
    const [, , , pattern, childSpecs, repeat, nested] = normalize(node.spec);
    node.binding = true;
    try {
        bindContent(node, pattern, childSpecs, repeat, nested, node.element.ish);
    }
    finally {
        node.binding = false;
    }
}
/** The compiled entry (template or switch) with this id, in the node's compiled variant. */
function compiledEntry(options, id) {
    const variant = options[TREE_COMPILED];
    if (!variant || id === undefined)
        return undefined;
    const { templates, switches } = variant.compiled;
    return templates[id] ?? switches[id];
}
/**
 * Render a switch: pick the case for the discriminant (resolved against `value`) and render
 * it against that same value. The same case as last time is rebound in place; another case
 * (or nothing, shown by a placeholder comment) replaces the previous one in the slot, so the
 * caller keeps the same node and sees no structural change.
 */
function syncSwitch(node, spec, value, options, permissionProcessor, compiled) {
    const root = options[TREE_TARGET];
    const fastAllowed = fastPathAllowed(options, permissionProcessor);
    // Which case: decided by the shared, pure chooseCase (so other renderers decide the same)
    const { caseKey, spec: chosen } = chooseCase(spec, value, (path, from) => resolveAny(path, from, options, root, fastAllowed, permissionProcessor));
    const state = node?.switch;
    const compiledSwitch = compiled && 'cases' in compiled && compiled.spec === spec ? compiled : undefined;
    const caseEntry = compiledSwitch && compiledEntry(options, caseKey === DEFAULT_CASE ? compiledSwitch.default : compiledSwitch.cases[caseKey]);
    const previous = state?.caseKey === caseKey ? state.inner : undefined;
    const inner = chosen == null ? undefined : syncNode(previous, chosen, value, options, permissionProcessor, caseEntry);
    const placeholder = inner ? state?.placeholder : state?.placeholder ?? document.createComment(SWITCH_PLACEHOLDER);
    // A placeholder stands in for the element: it's only placed and removed
    const element = inner?.element ?? placeholder;
    if (!node || !state) {
        return {
            tag: '', ish: undefined, element, children: [], spec, options, permissionProcessor, binding: false,
            container: element, nested: false, switch: { caseKey, inner, placeholder },
        };
    }
    // Another case (or a rebuilt one) takes the previous one's place (all of a snippet's nodes, either way).
    // The state still holds the previous case here, so nodesOf(node) is what's in the DOM now.
    const oldNodes = nodesOf(node);
    const newNodes = inner ? nodesOf(inner) : [placeholder];
    if (oldNodes[0] !== newNodes[0] && oldNodes[0].parentNode) {
        oldNodes[0].before(...newNodes);
        for (const old of oldNodes)
            if (!newNodes.includes(old))
                old.remove();
    }
    Object.assign(node, { element, container: element, spec, options, permissionProcessor });
    Object.assign(state, { caseKey, inner, placeholder });
    return node;
}
function createNode(spec, value, options, permissionProcessor, template) {
    if (isSwitch(spec))
        return syncSwitch(undefined, spec, value, options, permissionProcessor, template);
    if (isSnippet(spec))
        return createSnippet(spec, options, permissionProcessor);
    // With `compile`: clone the template, as long as it was compiled from this very spec
    if (template && 'node' in template && template.node.spec === spec) {
        const variant = options[TREE_COMPILED];
        if (variant)
            return cloneNodeFrom(template, variant, value, options, permissionProcessor);
    }
    const [, tag, ish, pattern, childSpecs, repeat, nested] = normalize(spec);
    const element = document.createElement(tag);
    const node = {
        tag, ish, element, children: [], spec, options, permissionProcessor, binding: true, container: containerOf(element),
        nested: nested !== undefined,
    };
    try {
        const from = ish === undefined ? value : attachManager(node, ish, value);
        if (repeat || nested) {
            bindContent(node, pattern, childSpecs, repeat, nested, from);
            return node;
        }
        applyPattern(element, pattern, from, options, permissionProcessor);
        node.appliedPattern = pattern;
        node.appliedAka = options.aka;
        const { container } = node;
        node.children = childSpecs.map(childSpec => {
            const child = createNode(childSpec, from, options, permissionProcessor);
            if (child.snippet)
                container.append(...child.snippet.nodes);
            else
                container.appendChild(child.element);
            return child;
        });
    }
    finally {
        node.binding = false;
    }
    return node;
}
/** A snippet's instance: its template (parsed and checked once per string) cloned, held by one node that's never bound. */
function createSnippet(spec, options, permissionProcessor) {
    const target = options[TREE_TARGET];
    const doc = target?.ownerDocument ?? document;
    const parsed = parsedSnippet(spec, options, permissionProcessor, doc);
    return snippetNode(spec, cloneSnippet(parsed, doc), options, permissionProcessor);
}
/** The node holding a snippet's nodes (cloned, or adopted from server markup). */
function snippetNode(spec, nodes, options, permissionProcessor) {
    const element = nodes.find(n => n.nodeType === Node.ELEMENT_NODE);
    return {
        tag: '', ish: undefined, element, children: [], spec, options, permissionProcessor, binding: false,
        container: element, nested: false, snippet: { source: options.snippets[spec.snippet], nodes },
    };
}
/**
 * Rebind an existing node in place, or create it when there's none or its
 * structure (tag, manager, child count) no longer matches the spec.
 */
function syncNode(node, spec, value, options, permissionProcessor, template) {
    if (isSwitch(spec))
        return syncSwitch(node?.switch ? node : undefined, spec, value, options, permissionProcessor, template);
    if (isSnippet(spec)) {
        // Static: the same source stays as it is (never visited); another one replaces it
        if (node?.snippet && node.snippet.source === options.snippets?.[spec.snippet])
            return node;
        return createSnippet(spec, options, permissionProcessor);
    }
    const [, tag, ish, pattern, childSpecs, repeat, nested] = normalize(spec);
    if (!node || node.switch || node.snippet || node.tag !== tag || node.ish !== ish || node.children.length !== childSpecs.length
        || !!node.repeat !== !!repeat || node.nested !== (nested !== undefined)) {
        return createNode(spec, value, options, permissionProcessor, template);
    }
    Object.assign(node, { spec, options, permissionProcessor });
    // adopt: 'pending', first run: nothing pending in or around this element, so it's left as the server rendered it
    const pending = options[TREE_PENDING];
    if (pending?.active && !pending.bound.has(node.element) && !node.element.closest(`[${PENDING_ATTRIBUTE}]`))
        return node;
    node.binding = true;
    try {
        let from = value;
        if (ish !== undefined) {
            const element = node.element;
            element.ish = value;
            from = element.ish;
        }
        bindContent(node, pattern, childSpecs, repeat, nested, from);
    }
    finally {
        node.binding = false;
    }
    return node;
}
// ── compile: clone-and-bind ──────────────────────────────────────────────────
//
// With `compile`, a map is compiled once (handlers/compileTree.ts) into flat templates
// with the static parts baked in. Creating a node clones its template and binds only the
// dynamic keys; everything after creation (rebinding, managers, repeats' reconciliation)
// is the ordinary TreeNode code. A template is only used while its node was compiled
// from the very spec being created, so a replaced spec falls back to createElement.
/** The compiled variant for this map, aka and permission processor, compiling on first use. */
function compiledVariantFor(map, options, sample, permissionProcessor) {
    const { aka } = options;
    const akaKey = aka ? JSON.stringify(aka) : '';
    let variants = compiledMaps.get(map);
    if (!variants)
        compiledMaps.set(map, variants = []);
    let variant = variants.find(v => v.akaKey === akaKey && v.permissionProcessor === permissionProcessor);
    if (!variant) {
        const compiled = compiler.compileTree({ map }, {
            sample,
            resolveOptions: options,
            // Only refuses (and warns, once per attribute) what the runtime check would refuse anyway
            canBake: permissionProcessor
                ? (name, text) => !permissionProcessor.checkRestrictedAttributeCall('setAttribute', [name, text]).blocked
                : undefined,
        });
        variant = { akaKey, permissionProcessor, compiled, built: new Map() };
        variants.push(variant);
    }
    return variant;
}
/** A repeat node's item and empty templates (or switches), when it was cloned from a compiled node. */
function repeatTemplates(node) {
    const repeat = node.compiled?.repeat;
    if (!repeat)
        return [];
    const { options } = node;
    return [compiledEntry(options, repeat.each), compiledEntry(options, repeat.empty)];
}
/**
 * Create a node by cloning its template: import a copy into the target's document (which
 * upgrades custom elements before returning), pair every element with its compiled node,
 * then bind in preorder.
 */
function cloneNodeFrom(template, variant, value, options, permissionProcessor) {
    const { id } = template;
    let built = variant.built.get(id);
    if (!built) {
        built = compiler.buildTemplate(template);
        variant.built.set(id, built);
    }
    const target = options[TREE_TARGET];
    const doc = target?.ownerDocument ?? document;
    const element = doc.importNode(built.content, true).firstElementChild;
    const node = pairNodes(template.node, element, options, permissionProcessor);
    bindCloned(node, value);
    return node;
}
/** Pair a clone's elements with the compiled nodes, building the TreeNodes (nothing runs yet). */
function pairNodes(compiled, element, options, permissionProcessor) {
    const { spec, tag, ish } = compiled;
    const container = containerOf(element);
    const node = {
        tag, ish, element, children: [], spec, options, permissionProcessor, binding: true, container, compiled,
        nested: compiled.nested !== undefined,
    };
    let child = container.firstElementChild;
    for (const childCompiled of compiled.children) {
        if (childCompiled.snippet !== undefined) {
            // A snippet has no element in the template: its own template is cloned in here
            const snippet = createSnippet(childCompiled.spec, options, permissionProcessor);
            for (const n of snippet.snippet.nodes)
                container.insertBefore(n, child);
            snippet.compiled = childCompiled;
            node.children.push(snippet);
            continue;
        }
        if (childCompiled.switch) {
            // A switch has no element in the template: hold its slot with a placeholder until it's bound
            const placeholder = element.ownerDocument.createComment(SWITCH_PLACEHOLDER);
            container.insertBefore(placeholder, child);
            const slot = placeholder;
            node.children.push({
                tag: '', ish: undefined, element: slot, children: [], spec: childCompiled.spec, options, permissionProcessor,
                binding: false, container: slot, nested: false, compiled: childCompiled,
                switch: { caseKey: undefined, inner: undefined, placeholder },
            });
            continue;
        }
        node.children.push(pairNodes(childCompiled, child, options, permissionProcessor));
        child = child.nextElementSibling;
    }
    return node;
}
/** Bind a freshly cloned node and its subtree, as createNode does for a created one. */
function bindCloned(node, value) {
    const { compiled, element, ish, options, permissionProcessor } = node;
    // A snippet is static: nothing to bind
    if (node.snippet)
        return;
    if (compiled.switch) {
        // Renders its case in place of the placeholder (cloned from the case's own template)
        syncSwitch(node, compiled.switch.spec, value, options, permissionProcessor, compiled.switch);
        return;
    }
    const { pattern, dynamic, repeat, nested } = compiled;
    try {
        const from = ish === undefined ? value : attachManager(node, ish, value);
        applyPattern(element, dynamic, from, options, permissionProcessor);
        // The whole pattern counts as applied: its literals were baked, so rebinds skip them
        node.appliedPattern = pattern;
        node.appliedAka = options.aka;
        if (repeat) {
            bindRepeat(node, repeat.spec, from);
            return;
        }
        if (nested) {
            bindNested(node, nested, from);
            return;
        }
        const { children, container } = node;
        for (const child of children)
            bindCloned(child, from);
        // A dynamic pattern that replaced the element's content (e.g. textContent): put the children back after it
        if (children.some(child => !inPlace(child, container))) {
            container.append(...children.flatMap(nodesOf));
        }
    }
    finally {
        node.binding = false;
    }
}
// ── adopt: existing (e.g. server-rendered) markup ────────────────────────────
//
// With `adopt`, markers found without state aren't cleared: Tree walks the spec and the
// existing elements in lockstep and builds its TreeNodes around them (attaching managers on
// the way). The ordinary bind then does the rest (patterns, events, properties; unchanged text
// isn't rewritten), so the markup becomes a normal Tree, rebinding in place. Any mismatch
// (tag, count, switch placeholder) falls back to the rebuild.
/** Markup that doesn't match the spec. */
class AdoptMismatch extends Error {
}
/**
 * The nodes that specs occupy, from `first` up to `end` (exclusive; default: the last sibling): elements,
 * and the placeholders of switches rendering nothing. Walks siblings directly: the walk's hot loop.
 */
function slotsOf(first, end = null) {
    const slots = [];
    for (let node = first; node && node !== end; node = node.nextSibling) {
        const { nodeType } = node;
        if (nodeType === 1 || (nodeType === 8 && node.data === SWITCH_PLACEHOLDER))
            slots.push(node);
    }
    return slots;
}
/** Check that a level's specs took all its slots (taking more than there are throws in adoptNode). */
function allTaken({ slots, at }, what) {
    if (at !== slots.length)
        throw new AdoptMismatch(`${slots.length} elements for ${what}`);
}
/**
 * Adopt the existing node(s) at the cursor for a spec: a TreeNode around them (and their
 * subtree), as createNode would have built, advancing the cursor past them.
 */
function adoptNode(cursor, spec, value, options, permissionProcessor) {
    const { slots } = cursor;
    if (cursor.at >= slots.length)
        throw new AdoptMismatch('fewer elements than the spec');
    if (isSnippet(spec)) {
        // Its root elements, by tag, in the next slots (and the whitespace between them); never bound
        const { tags } = parsedSnippet(spec, options, permissionProcessor, slots[cursor.at].ownerDocument);
        const first = cursor.at;
        tags.forEach((tag, k) => {
            const slot = slots[first + k];
            if (!slot)
                throw new AdoptMismatch('fewer elements than the spec');
            const found = slot.nodeType === Node.ELEMENT_NODE ? slot.localName : 'a placeholder';
            if (found !== tag)
                throw new AdoptMismatch(`<${found}> where snippet "${spec.snippet}" has <${tag}>`);
        });
        cursor.at += tags.length;
        const last = slots[cursor.at - 1];
        const nodes = [];
        for (let n = slots[first]; n; n = n.nextSibling) {
            nodes.push(n);
            if (n === last)
                break;
        }
        return snippetNode(spec, nodes, options, permissionProcessor);
    }
    const slot = slots[cursor.at];
    if (isSwitch(spec)) {
        const root = options[TREE_TARGET];
        const fastAllowed = fastPathAllowed(options, permissionProcessor);
        const { caseKey, spec: chosen } = chooseCase(spec, value, (path, from) => resolveAny(path, from, options, root, fastAllowed, permissionProcessor));
        if (chosen == null) {
            if (slot.nodeType !== Node.COMMENT_NODE || slot.data !== SWITCH_PLACEHOLDER) {
                throw new AdoptMismatch('a switch rendering nothing, but no placeholder');
            }
            cursor.at++;
            const placeholder = slot;
            const element = placeholder;
            return {
                tag: '', ish: undefined, element, children: [], spec, options, permissionProcessor, binding: false,
                container: element, nested: false, switch: { caseKey, inner: undefined, placeholder },
            };
        }
        const inner = adoptNode(cursor, chosen, value, options, permissionProcessor);
        return {
            tag: '', ish: undefined, element: inner.element, children: [], spec, options, permissionProcessor, binding: false,
            container: inner.element, nested: false, switch: { caseKey, inner, placeholder: undefined },
        };
    }
    if (slot.nodeType !== Node.ELEMENT_NODE)
        throw new AdoptMismatch('a placeholder where an element was expected');
    cursor.at++;
    const element = slot;
    const [, tag, ish, , childSpecs, repeat, nested] = normalize(spec);
    if (element.localName !== tag.toLowerCase())
        throw new AdoptMismatch(`<${element.localName}> where <${tag}> was expected`);
    const node = {
        tag, ish, element, children: [], spec, options, permissionProcessor, binding: true, container: containerOf(element),
        nested: nested !== undefined,
    };
    try {
        const from = ish === undefined ? value : attachManager(node, ish, value);
        // A nested tree adopts its own markers when it's bound (so with adopt: 'pending', its host is)
        if (nested) {
            const pending = options[TREE_PENDING];
            if (pending?.active)
                bindWithAncestors(pending, element);
            return node;
        }
        const { container } = node;
        if (repeat) {
            const { of = '?.' } = repeat;
            const fastAllowed = fastPathAllowed(options, permissionProcessor);
            const itemOptions = of === '?.' ? options : { ...options, fromStack: [...(options.fromStack ?? []), from] };
            const keyFast = itemOptions === options ? fastAllowed : fastPathAllowed(itemOptions, permissionProcessor);
            const stamp = repeatItems(repeat, from, (path, v, forItem) => forItem
                ? resolveAny(path, v, itemOptions, element, keyFast, permissionProcessor)
                : resolveAny(path, v, options, element, fastAllowed, permissionProcessor));
            const inner = { slots: slotsOf(container.firstChild), at: 0 };
            const state = { items: new Map(), empty: undefined, warned: false };
            if (stamp.empty !== undefined) {
                state.empty = adoptNode(inner, stamp.empty, from, options, permissionProcessor);
                allTaken(inner, "a repeat's empty");
            }
            else {
                stamp.items.forEach((item, i) => state.items.set(stamp.keys[i], adoptNode(inner, repeat.each, item, itemOptions, permissionProcessor)));
                allTaken(inner, `${stamp.items.length} repeat items`);
            }
            node.repeat = state;
            return node;
        }
        // Without spec children, the element's content is its own (text, microJoin): nothing to pair
        if (childSpecs.length > 0) {
            const inner = { slots: slotsOf(container.firstChild), at: 0 };
            node.children = childSpecs.map(childSpec => adoptNode(inner, childSpec, from, options, permissionProcessor));
            allTaken(inner, `<${tag}>'s ${childSpecs.length} child specs`);
        }
    }
    finally {
        node.binding = false;
    }
    return node;
}
/** Adopt the markup between a tree's markers: its TreeNodes by key, or undefined (with a note) when it doesn't match. */
function adoptTree(map, from, keepNullish, start, end, options, permissionProcessor) {
    const nodes = new Map();
    try {
        const cursor = { slots: slotsOf(start.nextSibling, end), at: 0 };
        const entries = mapEntries(map, from, keepNullish);
        for (const { key, spec, value } of entries)
            nodes.set(key, adoptNode(cursor, spec, value, options, permissionProcessor));
        allTaken(cursor, `${entries.length} map keys`);
    }
    catch (e) {
        if (!(e instanceof AdoptMismatch))
            throw e;
        console.debug(`builtIns.tree: the existing markup doesn't match the spec (${e.message}); rebuilding`);
        return undefined;
    }
    return nodes;
}
/** For `adopt: 'pending'`: the elements between the markers holding a data-pending mark, and their ancestors up to the target. */
function pendingScope(start, end, target) {
    const scope = { active: true, bound: new Set(), target };
    for (const node of getNodesBetweenMarkers(start, end)) {
        if (node.nodeType !== Node.ELEMENT_NODE)
            continue;
        if (node.hasAttribute(PENDING_ATTRIBUTE))
            bindWithAncestors(scope, node);
        for (const el of node.querySelectorAll(`[${PENDING_ATTRIBUTE}]`))
            bindWithAncestors(scope, el);
    }
    return scope;
}
/** Add an element and its ancestors to what the run binds: up to the target, or to one already added (whose ancestors are too). */
function bindWithAncestors(scope, el) {
    const { bound, target } = scope;
    for (let at = el; at && at !== target && at.nodeType === Node.ELEMENT_NODE && !bound.has(at); at = at.parentNode) {
        bound.add(at);
    }
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
/** Place elements in order right after `start`, moving only the ones that are out of place. */
function placeInOrder(parent, elements, start) {
    placeNodes(parent, elements, start.nextSibling);
}
/**
 * TreeHandler — builds a tree of elements from a VM, and rebinds it on later calls.
 */
export class TreeHandler {
    config;
    constructor(config) {
        this.config = config;
    }
    /** Load the compiler, only for `compile` configs and only once (assignFrom awaits this before assign). */
    static prepare(config) {
        if (!config.compile || compiler)
            return;
        return import('./compileTree.js').then(module => { compiler = module; });
    }
    assign(lhsTarget, _resolvedParams, options, permissionProcessor) {
        // Elements, shadow roots and other document fragments
        if (!(lhsTarget instanceof Element || lhsTarget instanceof DocumentFragment))
            return;
        const { map, markerName = DEFAULT_MARKER_NAME, keepNullish, aka, compile } = this.config;
        const adopt = this.config.adopt || options[TREE_ADOPT] || false;
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
        // compile: the first call's VM is the sample that picks microJoin shells.
        // (Without prepare() having loaded the compiler, e.g. assign() called directly, Tree just doesn't compile.)
        if (compile && !compiler && !warnedNoCompiler) {
            warnedNoCompiler = true;
            console.warn("builtIns.tree: 'compile' needs TreeHandler.prepare(config) to load the compiler first (assignFrom does this); not compiling");
        }
        const variant = compile && compiler ? compiledVariantFor(map, nestedOptions, from, permissionProcessor) : undefined;
        // Always set, so an enclosing tree's variant doesn't carry over into a nested one
        nestedOptions[TREE_COMPILED] = variant;
        nestedOptions[TREE_ADOPT] = adopt;
        const [start, end] = findChildMarkers(lhsTarget, markerName) ?? createMarkers(lhsTarget, markerName);
        let nodes = treeStates.get(start);
        let adopted = false;
        let pending;
        if (!nodes) {
            // Markers without state (cloned or server-rendered): adopt the markup if asked and it matches, else start fresh.
            // With adopt: 'pending', the scope exists before the walk, which adds nested trees' hosts to it.
            pending = adopt === 'pending' ? pendingScope(start, end, lhsTarget) : undefined;
            nestedOptions[TREE_PENDING] = pending;
            nodes = adopt ? adoptTree(map, from, keepNullish, start, end, nestedOptions, permissionProcessor) : undefined;
            adopted = !!nodes;
            if (!nodes) {
                pending = nestedOptions[TREE_PENDING] = undefined;
                for (const node of getNodesBetweenMarkers(start, end))
                    node.remove();
                nodes = new Map();
                warnUnmatchedKeys(map, from);
            }
        }
        // Always set, so an enclosing tree's scope doesn't apply here
        if (!pending)
            nestedOptions[TREE_PENDING] = undefined;
        const next = new Map();
        // Which keys render, in which order: decided by the shared, pure mapEntries
        for (const { key, spec, value, templateKey } of mapEntries(map, from, keepNullish)) {
            let node = nodes.get(key);
            // Removed or moved by other code: rebuild
            if (node && !inPlace(node, lhsTarget))
                node = undefined;
            const template = compiledEntry(nestedOptions, templateKey);
            next.set(key, syncNode(node, spec, value, nestedOptions, permissionProcessor, template));
        }
        for (const [key, node] of nodes) {
            if (next.get(key) !== node && node.element.parentNode === lhsTarget)
                removeNode(node);
        }
        const placed = [];
        for (const node of next.values())
            pushNodes(node, placed);
        placeInOrder(lhsTarget, placed, start);
        treeStates.set(start, next);
        if (pending)
            pending.active = false;
        // Adopted and bound: what a server marked as pending (data-pending) is complete now
        if (adopted) {
            for (const node of getNodesBetweenMarkers(start, end)) {
                if (node.nodeType !== Node.ELEMENT_NODE)
                    continue;
                node.removeAttribute(PENDING_ATTRIBUTE);
                for (const el of node.querySelectorAll(`[${PENDING_ATTRIBUTE}]`))
                    el.removeAttribute(PENDING_ATTRIBUTE);
            }
        }
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
