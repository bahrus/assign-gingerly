/**
 * builtIns.microDataJoin handler for assignFrom.
 *
 * Renders a template array as semantic microdata-annotated DOM elements.
 * Each dynamic value gets an HTML element based on its resolved type,
 * with itemprop set to the property name.
 *
 * This handler is auto-loaded by processHandlerCommands when
 * `do: 'builtIns.microDataJoin'` is encountered.
 */
const MARKER_START_PREFIX = '?start name="';
const MARKER_END = '?end';
const MARKER_NAME = 'microDataJoin';

function findMarkers(target) {
    const startText = `${MARKER_START_PREFIX}${MARKER_NAME}"`;
    let startMarker = null;
    let endMarker = null;
    const walker = document.createTreeWalker(target, NodeFilter.SHOW_COMMENT);
    let node;
    while ((node = walker.nextNode())) {
        if (!startMarker && node.data === startText) {
            startMarker = node;
        } else if (startMarker && !endMarker && node.data === MARKER_END) {
            endMarker = node;
            break;
        }
    }
    return [startMarker, endMarker];
}

function createMarkers(target) {
    const startMarker = document.createComment(`${MARKER_START_PREFIX}${MARKER_NAME}"`);
    const endMarker = document.createComment(MARKER_END);
    target.appendChild(startMarker);
    target.appendChild(endMarker);
    return [startMarker, endMarker];
}

function getNodesBetweenMarkers(start, end) {
    const nodes = [];
    let current = start.nextSibling;
    while (current && current !== end) {
        nodes.push(current);
        current = current.nextSibling;
    }
    return nodes;
}

function formatForDisplay(value) {
    if (value instanceof Date) {
        return value.toLocaleDateString();
    }
    if (typeof value === 'number') {
        return value.toLocaleString();
    }
    if (typeof value === 'boolean') {
        return '';
    }
    return String(value ?? '');
}

function formatForAttribute(value) {
    if (value instanceof Date) {
        return value.toISOString();
    }
    return String(value);
}

function createElementForValue(prop, value) {
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
        return el;
    }
    const el = document.createElement('span');
    el.setAttribute('itemprop', prop);
    el.textContent = String(value ?? '');
    return el;
}

function updateElement(el, prop, value) {
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

function processTemplate(template) {
    const result = [];
    for (const item of template) {
        if (Array.isArray(item)) {
            const hasNull = item.some(el =>
                el && typeof el === 'object' && 'prop' in el && el.val == null
            );
            if (hasNull) continue;
            result.push(...processTemplate(item));
        } else if (item == null) {
            continue;
        } else {
            result.push(item);
        }
    }
    return result;
}

export class MicroDataJoinHandler {
    config;
    constructor(config) {
        this.config = config;
    }
    async assign(lhsTarget, resolvedParams) {
        const { template } = resolvedParams;
        if (!template || !Array.isArray(template)) {
            throw new Error('builtIns.microDataJoin: resolve.template must be an array');
        }
        if (!(lhsTarget instanceof Element)) {
            throw new Error('builtIns.microDataJoin: lhsTarget must be a DOM Element');
        }
        if (!lhsTarget.hasAttribute('itemscope')) {
            lhsTarget.setAttribute('itemscope', '');
        }
        const processed = processTemplate(template);
        let [startMarker, endMarker] = findMarkers(lhsTarget);
        const isUpdate = startMarker !== null && endMarker !== null;
        if (!isUpdate) {
            [startMarker, endMarker] = createMarkers(lhsTarget);
        }
        if (isUpdate) {
            const existingNodes = getNodesBetweenMarkers(startMarker, endMarker);
            let nodeIdx = 0;
            for (const segment of processed) {
                if (typeof segment === 'string') {
                    const node = existingNodes[nodeIdx];
                    if (node && node.nodeType === Node.TEXT_NODE) {
                        if (node.textContent !== segment) {
                            node.textContent = segment;
                        }
                    }
                    nodeIdx++;
                } else {
                    const node = existingNodes[nodeIdx];
                    if (node && node instanceof Element && node.getAttribute('itemprop') === segment.prop) {
                        updateElement(node, segment.prop, segment.val);
                    }
                    nodeIdx++;
                }
            }
        } else {
            const fragment = document.createDocumentFragment();
            for (const segment of processed) {
                if (typeof segment === 'string') {
                    fragment.appendChild(document.createTextNode(segment));
                } else {
                    const el = createElementForValue(segment.prop, segment.val);
                    fragment.appendChild(el);
                }
            }
            endMarker.parentNode.insertBefore(fragment, endMarker);
        }
    }
}
