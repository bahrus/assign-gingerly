/**
 * microJoin — synchronous compute op for the ` =&` operator.
 *
 * Renders a template array into the LHS element as semantic, microdata-annotated
 * content: literal strings become text, and each `{ prop, val, text? }` segment
 * becomes an element chosen by the resolved value's type, with `itemprop=prop`:
 *
 * - `Date`   → `<time itemprop datetime="ISO">` (text: toLocaleDateString())
 * - number   → `<data itemprop value="n">` (text: toLocaleString())
 * - boolean  → `<data itemprop value="true|false">` (no text)
 * - anything else → `<span itemprop>` (text: String(val))
 *
 * `text`, when given, overrides the display text (e.g. formatted through pipes),
 * while `val` still decides the element and its machine-readable attribute.
 *
 * Nullish handling mirrors `join`: top-level null/undefined items (and segments
 * whose `val` is nullish) are omitted; a nested sub-array is all-or-nothing — it's
 * dropped entirely if any item in it is nullish or is a segment with a nullish `val`.
 *
 * The op owns the element's whole content (no comment markers). The first call
 * renders it; later calls with the same structure update the existing text nodes and
 * elements in place, and a changed structure re-renders. The element gets an empty
 * `itemscope` attribute if it has none, so the itemprops belong to it.
 *
 * Writes into `ctx.lhsTarget` and returns undefined (nothing is assigned back).
 *
 * @example
 * assignFrom(p, {
 *     '?. =&': { microJoin: ['Launched ', { prop: 'date', val: '?.launchDate' }, ' by ', { prop: 'name', val: '?.name' }] }
 * }, { from: vm });
 */

import type { SyncOpContext } from '../types/assign-gingerly/types.js';

interface MicroSegment {
    prop: string;
    val: any;
    text?: any;
}

type Item = string | MicroSegment;

/** What a segment renders as. */
interface Shape {
    tag: 'time' | 'data' | 'span';
    attr?: 'datetime' | 'value';
    attrValue?: string;
    text: string;
}

function isSegment(item: any): item is MicroSegment {
    return !!item && typeof item === 'object' && !Array.isArray(item) && 'prop' in item;
}

/** Whether an item counts as missing for all-or-nothing groups. */
function isMissing(item: any): boolean {
    return item == null || (isSegment(item) && item.val == null);
}

/** Flatten the template: drop missing top-level items and any sub-array containing one. */
function flatten(template: any[], out: Item[] = []): Item[] {
    for (const item of template) {
        if (Array.isArray(item)) {
            if (item.some(isMissing)) continue;
            flatten(item, out);
        } else if (!isMissing(item)) {
            out.push(isSegment(item) ? item : String(item));
        }
    }
    return out;
}

/**
 * Cached default-locale formatters. Their output matches toLocaleString() /
 * toLocaleDateString() with no arguments, but some engines (notably Chromium) build a
 * new formatter on every toLocale* call, which dominates the op's cost.
 */
let numberFormat: Intl.NumberFormat | undefined;
let dateFormat: Intl.DateTimeFormat | undefined;
const formatNumber = (n: number) => (numberFormat ??= new Intl.NumberFormat()).format(n);
const formatDate = (d: Date) => (dateFormat ??= new Intl.DateTimeFormat()).format(d);

function shapeOf({ val, text }: MicroSegment): Shape {
    let shape: Shape;
    if (val instanceof Date) {
        shape = { tag: 'time', attr: 'datetime', attrValue: val.toISOString(), text: formatDate(val) };
    } else if (typeof val === 'number') {
        shape = { tag: 'data', attr: 'value', attrValue: String(val), text: formatNumber(val) };
    } else if (typeof val === 'boolean') {
        shape = { tag: 'data', attr: 'value', attrValue: String(val), text: '' };
    } else {
        shape = { tag: 'span', text: String(val) };
    }
    if (text !== undefined) shape.text = text == null ? '' : String(text);
    return shape;
}

/** Whether the element's current children match the items' structure (so they can be updated in place). */
function sameStructure(element: Element, items: Item[], shapes: (Shape | undefined)[]): boolean {
    const { childNodes } = element;
    if (childNodes.length !== items.length) return false;
    for (let i = 0; i < items.length; i++) {
        const node = childNodes[i];
        const item = items[i];
        if (typeof item === 'string') {
            if (node.nodeType !== Node.TEXT_NODE) return false;
        } else {
            const el = node as Element;
            if (node.nodeType !== Node.ELEMENT_NODE || el.localName !== shapes[i]!.tag || el.getAttribute('itemprop') !== item.prop) {
                return false;
            }
        }
    }
    return true;
}

export function microJoin(args: any, _extra: Record<string, any>, ctx: SyncOpContext): undefined {
    const element = ctx?.lhsTarget;
    if (!(typeof Element !== 'undefined' && element instanceof Element)) {
        throw new Error("microJoin: the ' =&' left-hand side must resolve to an element (e.g. '?. =&')");
    }
    if (!Array.isArray(args)) {
        throw new Error('microJoin: expects an array of strings and { prop, val, text? } segments');
    }
    const items = flatten(args);
    const shapes = items.map(item => (typeof item === 'string' ? undefined : shapeOf(item)));

    if (!element.hasAttribute('itemscope')) element.setAttribute('itemscope', '');

    if (sameStructure(element, items, shapes)) {
        // Update in place
        const { childNodes } = element;
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (typeof item === 'string') {
                const node = childNodes[i] as Text;
                if (node.data !== item) node.data = item;
            } else {
                const el = childNodes[i] as Element;
                const { attr, attrValue, text } = shapes[i]!;
                if (attr && el.getAttribute(attr) !== attrValue) el.setAttribute(attr, attrValue!);
                if (el.textContent !== text) el.textContent = text;
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
        } else {
            const { tag, attr, attrValue, text } = shapes[i]!;
            const el = document.createElement(tag);
            el.setAttribute('itemprop', item.prop);
            if (attr) el.setAttribute(attr, attrValue!);
            if (text) el.textContent = text;
            fragment.append(el);
        }
    }
    element.replaceChildren(fragment);
    return undefined;
}
