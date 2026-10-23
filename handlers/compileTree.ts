/**
 * compileTree — compiles a builtIns.tree `map` into flat templates plus binding plans.
 *
 * Pure: no DOM is needed to compile (so it can run on a server). Each map key, and each
 * repeat's `each` / `empty`, becomes one **flat** template (no template contains
 * another), described as data (`TemplateElement`). Static parts are **baked** into it:
 *
 * - a literal `textContent` (including the string shorthand, and keys aliased to it,
 *   like `_`) → text;
 * - a literal ` :=` attribute (string, number, boolean, null, or an array of those) →
 *   an attribute, unless `canBake` refuses it;
 * - with a sample VM, a `microJoin` whose values are all present → its static text plus
 *   empty element shells of the sample values' types, so the op's first run updates
 *   them in place.
 *
 * Everything else (paths, other properties, events, ops, managers, repeats) stays a
 * per-instance key in the node's `dynamic` pattern. Baked statics count as applied
 * before every dynamic key.
 *
 * Templates are built on the client with DOM calls (`buildTemplate`), so they match what
 * builtIns.tree creates, HTML-parser fix-ups (`<tbody>`, `<p>` auto-closing, SVG) and
 * all. `toHTML` serializes a template for server rendering; its `signature` lets the
 * client validate a server copy.
 *
 * Template ids: a map key's template has the key as its id; the repeat at preorder
 * index n of template T has `T>n/each` and `T>n/empty`.
 *
 * Switches: each case compiles to its own template, `S/case:<key>` and `S/default`, where S
 * is the id the switch would have had as a template (a map key, `T>n/each`, …), or `T>n`
 * for a switch among static children. A switch has no element: at that id there's a
 * `CompiledSwitch` (in `switches`) instead of a template, and as a static child it's a
 * slot that the case is placed into at bind time.
 */

import { getValue, getValues, isEventBinding, isReferenceString } from '../resolve/getValues.js';
import { planMicroJoin } from '../syncOps/microJoin.js';
import { checkSwitch, isLiteralString, isSnippet, isSwitch, mapKeyName, normalize, WILDCARD, wildcardSpecOf } from './treeSpec.js';
import type { GetValuesOptions } from '../types/assign-gingerly/types.js';
import type {
    CompiledNode, CompiledSwitch, CompiledTemplate, CompiledTree, CompileTreeOptions, ElementSpecification, Pattern,
    SwitchSpecification, TemplateElement, TreeConfig,
} from '../types/assign-gingerly/treeTypes.js';

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
/** A ` :=` key with a plain attribute name (no path): `'aria-label :='` → `aria-label`. */
const ATTR_KEY = /^([A-Za-z_:][\w:.-]*) :=$/;
/** A ` =&` key whose LHS is the element itself (or its textContent, as written for join). */
const SELF_SYNC_OP_KEY = /^(?:\?\.)?(?:textContent)? =&$/;
const TAG = /^[A-Za-z][\w.-]*$/;
/** Elements whose text isn't parsed as HTML; their text isn't baked, so toHTML never needs raw-text rules. */
const RAW_TEXT_TAGS = new Set(['script', 'style']);
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

/** A sample value for a node's `from`, or undefined when there's none (no VM, or a manager in between). */
type Sample = { value: any } | undefined;

interface CompileContext {
    templates: Record<string, CompiledTemplate>;
    switches: Record<string, CompiledSwitch>;
    aka: Record<string, string>;
    canBake: (name: string, value: string) => boolean;
    resolveOptions: GetValuesOptions;
}

export function compileTree(config: Pick<TreeConfig, 'map' | 'aka'>, options: CompileTreeOptions = {}): CompiledTree {
    const { map, aka } = config;
    const { sample, resolveOptions = {}, canBake = () => true } = options;
    // The tree's own aka applies over the options' aka, as in builtIns.tree
    const effectiveAka = { ...resolveOptions.aka, ...aka };
    const ctx: CompileContext = {
        templates: {}, switches: {}, aka: effectiveAka, canBake, resolveOptions: { ...resolveOptions, aka: effectiveAka },
    };
    const keys = Object.keys(map);
    for (const key of keys) {
        if (key === WILDCARD) {
            // The same spec object builtIns.tree uses for unmatched keys. Any key may use it, so no sample.
            compileTemplate(key, wildcardSpecOf(map), undefined, ctx);
        } else {
            const name = mapKeyName(key);
            const keySample = sample != null && typeof sample === 'object' && name in sample ? { value: sample[name] } : undefined;
            compileTemplate(key, map[key], keySample, ctx);
        }
    }
    return { keys, templates: ctx.templates, switches: ctx.switches };
}

function compileTemplate(id: string, spec: ElementSpecification, sample: Sample, ctx: CompileContext): void {
    // A snippet is its own template already (parsed once from its HTML, at runtime): no template here
    if (isSnippet(spec)) return;
    if (isSwitch(spec)) {
        ctx.switches[id] = compileSwitch(id, spec, sample, ctx);
        return;
    }
    const [element, node] = compileNode(spec, sample, id, { index: 0 }, ctx);
    ctx.templates[id] = { id, element, node, signature: signatureOf(element, node) };
}

function compileNode(
    spec: ElementSpecification, sample: Sample, templateId: string, counter: { index: number }, ctx: CompileContext
): [TemplateElement, CompiledNode] {
    const index = counter.index++;
    const [, tag, ish, pattern, childSpecs, repeat, nested] = normalize(spec);
    if (!TAG.test(tag)) throw new Error(`compileTree: invalid tag name "${tag}"`);
    // A manager's subtree resolves against the manager instance, which a sample can't predict
    const nodeSample = ish === undefined ? sample : undefined;
    const element: TemplateElement = { tag, attrs: [], content: [] };
    const node: CompiledNode = { spec, tag, children: [] };
    if (ish !== undefined) node.ish = ish;
    if (pattern) {
        node.pattern = pattern;
        const ownsContent = !repeat && !nested && childSpecs.length === 0;
        const dynamic = bakePattern(pattern, element, nodeSample, ownsContent, ctx);
        if (dynamic) node.dynamic = dynamic;
    }
    // A nested tree renders at bind time (into the element, between its own markers)
    if (nested) {
        node.nested = nested;
        return [element, node];
    }
    if (repeat) {
        const base = `${templateId}>${index}`;
        const { each, empty } = repeat;
        compileTemplate(`${base}/each`, each, firstItem(repeat.of, nodeSample, ctx), ctx);
        node.repeat = { spec: repeat, each: `${base}/each` };
        if (empty !== undefined) {
            // `empty` renders against the repeat's own value
            compileTemplate(`${base}/empty`, empty, nodeSample, ctx);
            node.repeat.empty = `${base}/empty`;
        }
        return [element, node];
    }
    for (const childSpec of childSpecs) {
        if (isSnippet(childSpec)) {
            // No element in this template: the snippet's own template is cloned in when this one is
            node.children.push({ spec: childSpec, tag: '', children: [], snippet: childSpec.snippet });
            continue;
        }
        if (isSwitch(childSpec)) {
            // No element in this template: a slot, with each case in its own template
            const compiledSwitch = compileSwitch(`${templateId}>${counter.index++}`, childSpec, nodeSample, ctx);
            node.children.push({ spec: childSpec, tag: '', children: [], switch: compiledSwitch });
            continue;
        }
        const [childElement, childNode] = compileNode(childSpec, nodeSample, templateId, counter, ctx);
        element.content.push(childElement);
        node.children.push(childNode);
    }
    return [element, node];
}

/**
 * Compile each case of a switch as its own template (a nested switch: its own CompiledSwitch).
 * Cases render against the switch's value, so they share its sample: microJoin shells are
 * only baked for the case whose values the sample has, and a wrong guess is safe.
 */
function compileSwitch(base: string, spec: SwitchSpecification, sample: Sample, ctx: CompileContext): CompiledSwitch {
    checkSwitch(spec);
    const { cases, default: fallback } = spec;
    const compiled: CompiledSwitch = { spec, cases: {} };
    for (const key of Object.keys(cases)) {
        const caseSpec = cases[key];
        if (caseSpec == null) continue;
        compileTemplate(`${base}/case:${key}`, caseSpec, sample, ctx);
        compiled.cases[key] = `${base}/case:${key}`;
    }
    if (fallback != null) {
        compileTemplate(`${base}/default`, fallback, sample, ctx);
        compiled.default = `${base}/default`;
    }
    return compiled;
}

/** The sample for a repeat's items: the first item of the sample's array at `of`. */
function firstItem(of = '?.', sample: Sample, ctx: CompileContext): Sample {
    if (!sample || !of.startsWith('?.')) return undefined;
    try {
        const list = of === '?.' ? sample.value : getValue(of, sample.value, ctx.resolveOptions);
        if (list == null || typeof list[Symbol.iterator] !== 'function') return undefined;
        for (const item of list) return { value: item };
    } catch {
        // Unresolvable at compile time: no sample
    }
    return undefined;
}

/**
 * Bake a pattern's static keys into the element. Returns the keys left for per-instance
 * application: the pattern itself when nothing was baked (so caches keyed by it still
 * hit), undefined when everything was.
 */
function bakePattern(pattern: Pattern, element: TemplateElement, sample: Sample, ownsContent: boolean, ctx: CompileContext): Pattern | undefined {
    const dynamic: Pattern = {};
    let kept = 0;
    const keys = Object.keys(pattern);
    for (const key of keys) {
        const value = pattern[key];
        if (!bakeKey(key, value, element, sample, ownsContent, ctx)) {
            dynamic[key] = value;
            kept++;
        }
    }
    if (kept === 0) return undefined;
    return kept === keys.length ? pattern : dynamic;
}

/** What a pattern key does to an element, as far as rendering it is concerned (see classifyPatternKey). */
export type PatternKeyKind =
    | { kind: 'text' }                        // textContent (also through aka, e.g. _), literal or bound
    | { kind: 'attribute'; name: string }     // 'name :=' with a plain attribute name
    | { kind: 'syncOp' }                      // a ' =&' on the element itself (microJoin, join)
    | { kind: 'property'; name: string }      // a plain property (after aka), other than textContent / ish
    | { kind: 'ish' }                         // the itemscope manager's value
    | { kind: 'event' }                       // ' +=' with an { on, … } config
    | { kind: 'other' };                      // anything else: paths, operators, handlers, spreads, aliased attributes

/**
 * Classify a pattern key, as compileTree does when deciding what to bake. Exported so that
 * other renderers (e.g. a server-side stringifier) split keys the same way. Whether a value
 * is literal is separate: see isLiteral.
 */
export function classifyPatternKey(key: string, value: any, aka: Record<string, string> = {}): PatternKeyKind {
    if (IDENTIFIER.test(key)) {
        const name = aka[key] ?? key;
        if (name === 'textContent') return { kind: 'text' };
        if (name === 'ish') return { kind: 'ish' };
        return IDENTIFIER.test(name) ? { kind: 'property', name } : { kind: 'other' };
    }
    const attrMatch = ATTR_KEY.exec(key);
    // An aliased attribute name resolves at runtime
    if (attrMatch) return aka[attrMatch[1]] === undefined ? { kind: 'attribute', name: attrMatch[1] } : { kind: 'other' };
    if (isEventBinding(key, value)) return { kind: 'event' };
    if (SELF_SYNC_OP_KEY.test(key)) return { kind: 'syncOp' };
    return { kind: 'other' };
}

/** Bake one key if it's static. Returns whether the key is fully baked (so it's dropped per instance). */
function bakeKey(key: string, value: any, element: TemplateElement, sample: Sample, ownsContent: boolean, ctx: CompileContext): boolean {
    const { aka, canBake } = ctx;
    const classified = classifyPatternKey(key, value, aka);
    if (classified.kind === 'text') {
        if (!isLiteral(value) || RAW_TEXT_TAGS.has(element.tag)) return false;
        const text = value == null ? '' : String(value);
        // Children (if any) are added after the pattern, so this replaces only earlier baked text
        element.content = text ? [text] : [];
        return true;
    }
    if (classified.kind === 'attribute') {
        const { name } = classified;
        // on* is refused at runtime (with an error)
        if (/^on/i.test(name)) return false;
        const items = Array.isArray(value) ? value : [value];
        if (!items.every(isLiteral)) return false;
        const text = attributeText(value);
        if (text === undefined) return false;
        const attrName = name.toLowerCase();
        if (text !== null && !canBake(attrName, text)) return false;
        setAttr(element, attrName, text);
        return true;
    }
    if (classified.kind === 'syncOp') bakeMicroJoin(value, element, sample, ownsContent, ctx);
    // A microJoin key stays per instance either way: it fills in the baked shells
    return false;
}

/** A primitive literal: a non-reference string, number, bigint, boolean or nullish. */
export function isLiteral(value: any): boolean {
    if (typeof value === 'string') return isLiteralString(value);
    return value == null || typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean';
}

/** An attribute's text, as ` :=` computes it (null = absent; undefined = not an attribute value). */
export function attributeText(value: any): string | null | undefined {
    if (value === true) return '';
    if (value === false || value == null) return null;
    if (Array.isArray(value)) {
        const tokens = value.filter(item => item != null && item !== false).map(String);
        return tokens.length > 0 ? tokens.join(' ') : null;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return String(value);
    return undefined;
}

/** Set (or with null, remove) a baked attribute; a later key wins, as at runtime. */
function setAttr(element: TemplateElement, name: string, text: string | null): void {
    const { attrs } = element;
    const i = attrs.findIndex(([n]) => n === name);
    if (text === null) {
        if (i >= 0) attrs.splice(i, 1);
    } else if (i >= 0) {
        attrs[i][1] = text;
    } else {
        attrs.push([name, text]);
    }
}

/**
 * With a sample, bake a microJoin's static text and element shells. Not baked when the
 * element has other content (spec children or a repeat), any value is missing in the
 * sample, a reference isn't a plain `?.` path (or `!` / `!!` of one), or it can't be
 * resolved at compile time. A wrong guess is safe: microJoin re-renders on a mismatch.
 */
function bakeMicroJoin(config: any, element: TemplateElement, sample: Sample, ownsContent: boolean, ctx: CompileContext): void {
    if (!sample || !ownsContent || !config || typeof config !== 'object' || Array.isArray(config)) return;
    const configKeys = Object.keys(config);
    if (configKeys.length !== 1 || configKeys[0] !== 'microJoin') return;
    const { microJoin: rawArgs } = config;
    if (!Array.isArray(rawArgs) || !plainReferencesOnly(rawArgs)) return;
    let plan;
    try {
        const { microJoin: args } = getValues(config, sample.value, ctx.resolveOptions);
        if (!Array.isArray(args)) return;
        plan = planMicroJoin(args, rawArgs);
    } catch {
        return;
    }
    const { items, shapes, complete } = plan;
    if (!complete) return;
    const { canBake } = ctx;
    const content: (TemplateElement | string)[] = [];
    let hasProp = false;
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (typeof item === 'string') {
            content.push(item);
            continue;
        }
        const shell: TemplateElement = { tag: shapes[i]!.tag, attrs: [], content: [] };
        if (item.prop !== undefined) {
            const prop = String(item.prop);
            if (!canBake('itemprop', prop)) return;
            shell.attrs.push(['itemprop', prop]);
            hasProp = true;
        }
        content.push(shell);
    }
    if (hasProp && !element.attrs.some(([name]) => name === 'itemscope')) {
        if (!canBake('itemscope', '')) return;
        element.attrs.push(['itemscope', '']);
    }
    element.content = content;
}

/** Whether every reference string (at any depth) is a plain `?.` path, optionally negated. */
function plainReferencesOnly(value: any): boolean {
    if (typeof value === 'string') {
        return !(isReferenceString(value) || value.includes('://')) || /^!{0,2}\?\./.test(value);
    }
    if (Array.isArray(value)) return value.every(plainReferencesOnly);
    if (value && typeof value === 'object') return Object.values(value).every(plainReferencesOnly);
    return true;
}

// ── Serialization and signatures ─────────────────────────────────────────────

const escapeText = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (text: string) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

/** Serialize a template element as HTML (for server rendering). */
export function toHTML({ tag, attrs, content }: TemplateElement): string {
    let html = `<${tag}`;
    for (const [name, value] of attrs) html += value === '' ? ` ${name}` : ` ${name}="${escapeAttr(value)}"`;
    html += '>';
    if (VOID_TAGS.has(tag)) return html;
    for (const item of content) html += typeof item === 'string' ? escapeText(item) : toHTML(item);
    return `${html}</${tag}>`;
}

/** The node tree's shape: tags, managers, repeat references and nested trees. */
function shapeOf({ tag, ish, children, repeat, nested, switch: compiledSwitch, snippet }: CompiledNode): string {
    if (snippet !== undefined) return `{snippet:${snippet}}`;
    if (compiledSwitch) return `{switch:${Object.values(compiledSwitch.cases).join('|')}|${compiledSwitch.default ?? ''}}`;
    let shape = tag;
    if (ish !== undefined) shape += `:${typeof ish === 'string' ? ish : ish.is ?? ish.name}`;
    if (repeat) return `${shape}{${repeat.each}|${repeat.empty ?? ''}}`;
    if (nested) return `${shape}{tree}`;
    return children.length > 0 ? `${shape}(${children.map(shapeOf).join(',')})` : shape;
}

/** 32-bit FNV-1a of the template's markup and node shape, as 8 hex digits. */
function signatureOf(element: TemplateElement, node: CompiledNode): string {
    const input = `${toHTML(element)}|${shapeOf(node)}`;
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
}

// ── Client side ──────────────────────────────────────────────────────────────

/**
 * Build a compiled template as a `<template>` element, with DOM calls (no HTML parsing),
 * so its content matches what builtIns.tree creates. Elements are created in the
 * template's inert document, so custom elements aren't upgraded until instances are
 * imported (`document.importNode`).
 */
export function buildTemplate({ element }: CompiledTemplate, doc: Document = document): HTMLTemplateElement {
    const template = doc.createElement('template');
    const { content } = template;
    content.append(buildElement(element, content.ownerDocument));
    return template;
}

function buildElement({ tag, attrs, content }: TemplateElement, doc: Document): Element {
    const element = doc.createElement(tag);
    for (const [name, value] of attrs) element.setAttribute(name, value);
    const container = element.localName === 'template' ? (element as HTMLTemplateElement).content : element;
    for (const item of content) container.append(typeof item === 'string' ? item : buildElement(item, doc));
    return element;
}
