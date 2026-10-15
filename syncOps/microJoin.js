/**
 * microJoin — synchronous compute op for the ` =&` operator.
 *
 * Renders a template array into the LHS element as semantic content. It accepts
 * everything `join` accepts, plus `{ prop, val, text? }` segments:
 *
 * - a literal string → text
 * - a reference string (`'?.name'`, `'$parent?.x'`, `'!!?.flag'`, a protocol…) → an
 *   element for its resolved value, **without** `itemprop`
 * - a `{ prop, val, text? }` segment → an element for `val`, **with** `itemprop=prop`
 *
 * The element is chosen by the resolved value's type:
 * - `Date`   → `<time datetime="ISO">` (text: locale date)
 * - number   → `<data value="n">` (text: locale number)
 * - boolean  → `<data value="true|false">` (no text)
 * - anything else → `<span>` (text: String(value))
 *
 * A segment's `text`, when given, overrides the display text (e.g. formatted through
 * pipes), while `val` still decides the element and its machine-readable attribute.
 *
 * Nullish handling mirrors `join`: top-level nullish items (literals, references, or
 * segments whose `val` is nullish) are omitted; a nested sub-array is all-or-nothing —
 * dropped if any item directly in it is missing (deeper sub-arrays are optional on
 * their own).
 *
 * The op owns the element's whole content (no comment markers). The first call
 * renders it; later calls with the same structure update text and elements in place,
 * and a changed structure re-renders. If any segment carries an `itemprop`, the
 * element gets an empty `itemscope` attribute (if it has none), so they belong to it.
 *
 * The LHS must resolve to an element (`'?. =&'`), or be an element's `textContent`
 * (`'?.textContent =&'`, as with `join`) — in which case it renders into that element.
 * Returns undefined (nothing is assigned back).
 *
 * @example
 * assignFrom(p, {
 *     '?. =&': { microJoin: ['Launched ', { prop: 'date', val: '?.launchDate' }, ' by ', '?.name'] }
 * }, { from: vm });
 */
import { isReferenceString } from '../resolve/getValues.js';
function isSegment(item) {
    return !!item && typeof item === 'object' && !Array.isArray(item) && 'prop' in item;
}
/**
 * Turn one (raw, resolved) pair into an item, or null when it's missing.
 * Without raw args (an op called directly), every string is treated as a literal.
 */
function toItem(raw, value, protocols) {
    if (isSegment(value))
        return value.val == null ? null : value;
    if (value == null)
        return null;
    if (typeof raw === 'string' && isReferenceString(raw, protocols))
        return { val: value };
    return String(value);
}
/**
 * Flatten (raw, resolved) into items. In a group (`strict`), any missing item makes the
 * group fail (returns false); nested groups are optional on their own. `state.missing`
 * records whether anything was left out.
 */
function flatten(raw, resolved, protocols, out, strict, state) {
    for (let i = 0; i < resolved.length; i++) {
        const value = resolved[i];
        const rawItem = raw[i];
        if (Array.isArray(value)) {
            const group = [];
            if (flatten(Array.isArray(rawItem) ? rawItem : value, value, protocols, group, true, state)) {
                out.push(...group);
            }
            else {
                state.missing = true;
            }
            continue;
        }
        const item = toItem(rawItem, value, protocols);
        if (item === null) {
            if (strict)
                return false;
            state.missing = true;
            continue;
        }
        out.push(item);
    }
    return true;
}
/**
 * Merge adjacent text items and drop empty ones, so the items match the text nodes an
 * HTML parser (or a baked template) would produce.
 */
function mergeText(items) {
    const merged = [];
    for (const item of items) {
        if (typeof item === 'string') {
            if (item === '')
                continue;
            const last = merged.length - 1;
            if (last >= 0 && typeof merged[last] === 'string') {
                merged[last] += item;
                continue;
            }
        }
        merged.push(item);
    }
    return merged;
}
/**
 * The rendering plan for resolved args: text and element items (adjacent text merged),
 * each element item's shape, and whether every item was present (nothing nullish, no
 * optional group dropped). Pure: used by the op itself and, with a sample VM, by
 * compileTree to bake element shells.
 */
export function planMicroJoin(args, rawArgs, protocols) {
    const raw = Array.isArray(rawArgs) ? rawArgs : args;
    const flat = [];
    const state = { missing: false };
    flatten(raw, args, protocols, flat, false, state);
    const items = mergeText(flat);
    const shapes = items.map(item => (typeof item === 'string' ? undefined : shapeOf(item)));
    return { items, shapes, complete: !state.missing };
}
/**
 * Cached default-locale formatters. Their output matches toLocaleString() /
 * toLocaleDateString() with no arguments, but some engines (notably Chromium) build a
 * new formatter on every toLocale* call, which dominates the op's cost.
 */
let numberFormat;
let dateFormat;
const formatNumber = (n) => (numberFormat ??= new Intl.NumberFormat()).format(n);
const formatDate = (d) => (dateFormat ??= new Intl.DateTimeFormat()).format(d);
function shapeOf({ val, text }) {
    let shape;
    if (val instanceof Date) {
        shape = { tag: 'time', attr: 'datetime', attrValue: val.toISOString(), text: formatDate(val) };
    }
    else if (typeof val === 'number') {
        shape = { tag: 'data', attr: 'value', attrValue: String(val), text: formatNumber(val) };
    }
    else if (typeof val === 'boolean') {
        shape = { tag: 'data', attr: 'value', attrValue: String(val), text: '' };
    }
    else {
        shape = { tag: 'span', text: String(val) };
    }
    if (text !== undefined)
        shape.text = text == null ? '' : String(text);
    return shape;
}
/** Whether the element's current children match the items' structure (so they can be updated in place). */
function sameStructure(element, items, shapes) {
    const { childNodes } = element;
    if (childNodes.length !== items.length)
        return false;
    for (let i = 0; i < items.length; i++) {
        const node = childNodes[i];
        const item = items[i];
        if (typeof item === 'string') {
            if (node.nodeType !== Node.TEXT_NODE)
                return false;
        }
        else {
            const el = node;
            if (node.nodeType !== Node.ELEMENT_NODE || el.localName !== shapes[i].tag
                || el.getAttribute('itemprop') !== (item.prop ?? null)) {
                return false;
            }
        }
    }
    return true;
}
/** The element to render into: the LHS itself, or the element owning an LHS `textContent`. */
function targetElement(ctx) {
    const isElement = (x) => typeof Element !== 'undefined' && x instanceof Element;
    if (isElement(ctx?.lhsTarget))
        return ctx.lhsTarget;
    if (ctx?.lhsKey === 'textContent' && isElement(ctx.lhsParent))
        return ctx.lhsParent;
    return undefined;
}
export function microJoin(args, _extra, ctx) {
    const element = targetElement(ctx);
    if (!element) {
        throw new Error("microJoin: the ' =&' left-hand side must resolve to an element ('?. =&') or an element's textContent");
    }
    if (!Array.isArray(args)) {
        throw new Error('microJoin: expects an array of strings, references and { prop, val, text? } segments');
    }
    const { items, shapes } = planMicroJoin(args, ctx?.rawArgs, ctx?.protocols);
    if (!element.hasAttribute('itemscope') && items.some(item => typeof item !== 'string' && item.prop !== undefined)) {
        element.setAttribute('itemscope', '');
    }
    if (sameStructure(element, items, shapes)) {
        // Update in place
        const { childNodes } = element;
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (typeof item === 'string') {
                const node = childNodes[i];
                if (node.data !== item)
                    node.data = item;
            }
            else {
                const el = childNodes[i];
                const { attr, attrValue, text } = shapes[i];
                if (attr && el.getAttribute(attr) !== attrValue)
                    el.setAttribute(attr, attrValue);
                if (el.textContent !== text)
                    el.textContent = text;
            }
        }
        return undefined;
    }
    // (Re-)render
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (typeof item === 'string') {
            fragment.append(item);
        }
        else {
            const { tag, attr, attrValue, text } = shapes[i];
            const el = document.createElement(tag);
            if (item.prop !== undefined)
                el.setAttribute('itemprop', item.prop);
            if (attr)
                el.setAttribute(attr, attrValue);
            if (text)
                el.textContent = text;
            fragment.append(el);
        }
    }
    element.replaceChildren(fragment);
    return undefined;
}
