/**
 * builtIns.microDataJoin handler for assignFrom.
 * 
 * Renders a template array as semantic microdata-annotated DOM elements.
 * Each dynamic value gets an HTML element based on its resolved type,
 * with itemprop set to the property name.
 * 
 * Type → Element mapping:
 * - string → <span itemprop=name>value</span>
 * - number → <data itemprop=name value=raw>formatted</data>
 * - boolean → <data itemprop=name value=true/false></data>
 * - Date → <time itemprop=name datetime=iso>formatted</time>
 * - null/undefined → omitted (or sub-array dropped if in optional segment)
 * 
 * Uses comment markers for idempotent updates — first call creates elements,
 * subsequent calls update existing elements in place.
 * 
 * This handler is auto-loaded by processHandlerCommands when
 * `do: 'builtIns.microDataJoin'` is encountered.
 * 
 * @example
 * assignFrom(oSection, {
 *     '?.querySelector?.div =>': {
 *         do: 'builtIns.microDataJoin',
 *         resolve: {
 *             template: [
 *                 { prop: 'firstName', val: '?.firstName' },
 *                 ' ',
 *                 { prop: 'lastName', val: '?.lastName' }
 *             ]
 *         }
 *     }
 * }, { from: vm, withMethods: ['querySelector'] });
 */

import type { AssignFromHandler } from '../assignFromAsync.js';

const MARKER_START_PREFIX = '?start name="';
const MARKER_END = '?end';
const MARKER_NAME = 'microDataJoin';

interface TemplateSegment {
    prop: string;
    val: any;
    format?: string;
}

/**
 * Find existing start/end comment markers in a target element.
 */
function findMarkers(target: Element): [Comment | null, Comment | null] {
    const startText = `${MARKER_START_PREFIX}${MARKER_NAME}"`;
    let startMarker: Comment | null = null;
    let endMarker: Comment | null = null;

    const walker = document.createTreeWalker(target, NodeFilter.SHOW_COMMENT);
    let node: Comment | null;
    while ((node = walker.nextNode() as Comment | null)) {
        if (!startMarker && node.data === startText) {
            startMarker = node;
        } else if (startMarker && !endMarker && node.data === MARKER_END) {
            endMarker = node;
            break;
        }
    }
    return [startMarker, endMarker];
}

/**
 * Create start/end markers in the target.
 */
function createMarkers(target: Element): [Comment, Comment] {
    const startMarker = document.createComment(`${MARKER_START_PREFIX}${MARKER_NAME}"`);
    const endMarker = document.createComment(MARKER_END);
    target.appendChild(startMarker);
    target.appendChild(endMarker);
    return [startMarker, endMarker];
}

/**
 * Get all nodes between start and end markers.
 */
function getNodesBetweenMarkers(start: Comment, end: Comment): Node[] {
    const nodes: Node[] = [];
    let current: Node | null = start.nextSibling;
    while (current && current !== end) {
        nodes.push(current);
        current = current.nextSibling;
    }
    return nodes;
}

/**
 * Format a value for display (textContent) using locale.
 */
function formatForDisplay(value: any): string {
    if (value instanceof Date) {
        return value.toLocaleDateString();
    }
    if (typeof value === 'number') {
        return value.toLocaleString();
    }
    if (typeof value === 'boolean') {
        return '';  // booleans show nothing by default
    }
    return String(value ?? '');
}

/**
 * Format a value for the machine-readable attribute (value or datetime).
 */
function formatForAttribute(value: any): string {
    if (value instanceof Date) {
        return value.toISOString();
    }
    return String(value);
}

/**
 * Create the appropriate DOM element for a resolved value.
 */
function createElementForValue(prop: string, value: any): Element {
    if (value instanceof Date) {
        const el = document.createElement('time');
        el.setAttribute('itemprop', prop);
        el.setAttribute('datetime', formatForAttribute(value));
        el.textContent = formatForDisplay(value);
        return el;
    }
    if (typeof value === 'number') {
        const el = document.createElement('data');
        el.setAttribute('itemprop', prop);
        el.setAttribute('value', formatForAttribute(value));
        el.textContent = formatForDisplay(value);
        return el;
    }
    if (typeof value === 'boolean') {
        const el = document.createElement('data');
        el.setAttribute('itemprop', prop);
        el.setAttribute('value', String(value));
        // empty textContent for booleans
        return el;
    }
    // Default: string → span
    const el = document.createElement('span');
    el.setAttribute('itemprop', prop);
    el.textContent = String(value ?? '');
    return el;
}

/**
 * Update an existing element with a new value (in-place update).
 */
function updateElement(el: Element, prop: string, value: any): void {
    if (value instanceof Date) {
        el.setAttribute('datetime', formatForAttribute(value));
        el.textContent = formatForDisplay(value);
    } else if (typeof value === 'number') {
        el.setAttribute('value', formatForAttribute(value));
        el.textContent = formatForDisplay(value);
    } else if (typeof value === 'boolean') {
        el.setAttribute('value', String(value));
    } else {
        el.textContent = String(value ?? '');
    }
}

/**
 * Process the template array, handling optional (nested) segments.
 * Returns a flat array of items to render, with null sub-arrays dropped.
 */
function processTemplate(template: any[]): (string | TemplateSegment)[] {
    const result: (string | TemplateSegment)[] = [];
    for (const item of template) {
        if (Array.isArray(item)) {
            // All-or-nothing: if any {prop,val} segment has val === null/undefined, drop entire sub-array
            const hasNull = item.some(el =>
                el && typeof el === 'object' && 'prop' in el && el.val == null
            );
            if (hasNull) continue;
            // Sub-array passes — flatten
            result.push(...processTemplate(item));
        } else if (item == null) {
            continue;
        } else {
            result.push(item);
        }
    }
    return result;
}

/**
 * MicroDataJoinHandler — renders template arrays as semantic microdata DOM.
 */
export class MicroDataJoinHandler implements AssignFromHandler {
    config: any;

    constructor(config: any) {
        this.config = config;
    }

    async assign(lhsTarget: any, resolvedParams: Record<string, any>): Promise<void> {
        const { template } = resolvedParams;

        if (!template || !Array.isArray(template)) {
            throw new Error('builtIns.microDataJoin: resolve.template must be an array');
        }

        if (!(lhsTarget instanceof Element)) {
            throw new Error('builtIns.microDataJoin: lhsTarget must be a DOM Element');
        }

        // Add itemscope to target if not present
        if (!lhsTarget.hasAttribute('itemscope')) {
            lhsTarget.setAttribute('itemscope', '');
        }

        // Process template (handle optional segments)
        const processed = processTemplate(template);

        // Find or create markers
        let [startMarker, endMarker] = findMarkers(lhsTarget);
        const isUpdate = startMarker !== null && endMarker !== null;

        if (!isUpdate) {
            [startMarker, endMarker] = createMarkers(lhsTarget);
        }

        if (isUpdate) {
            // Update existing nodes in place
            const existingNodes = getNodesBetweenMarkers(startMarker!, endMarker!);
            let nodeIdx = 0;

            for (const segment of processed) {
                if (typeof segment === 'string') {
                    // Literal text — update or skip text node
                    const node = existingNodes[nodeIdx];
                    if (node && node.nodeType === Node.TEXT_NODE) {
                        if (node.textContent !== segment) {
                            node.textContent = segment;
                        }
                    }
                    nodeIdx++;
                } else {
                    // {prop, val} — update element
                    const node = existingNodes[nodeIdx];
                    if (node && node instanceof Element && node.getAttribute('itemprop') === segment.prop) {
                        updateElement(node, segment.prop, segment.val);
                    }
                    nodeIdx++;
                }
            }
        } else {
            // First render — create all nodes
            const fragment = document.createDocumentFragment();

            for (const segment of processed) {
                if (typeof segment === 'string') {
                    fragment.appendChild(document.createTextNode(segment));
                } else {
                    // {prop, val} object
                    const el = createElementForValue(segment.prop, segment.val);
                    fragment.appendChild(el);
                }
            }

            endMarker!.parentNode!.insertBefore(fragment, endMarker!);
        }
    }
}
