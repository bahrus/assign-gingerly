/**
 * markerUtils.js — Shared utilities for comment marker management.
 *
 * Used by lazyLoad, microDataJoin, and future template loop handlers.
 */

export const MARKER_START_PREFIX = '?start name="';
export const MARKER_END = '?end';

/**
 * Find existing start/end comment markers (TreeWalker approach).
 */
export function findMarkers(target, name) {
    const startText = `${MARKER_START_PREFIX}${name}"`;
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

/**
 * Find existing start/end comment markers (XPath approach).
 */
export function findMarkersXPath(target, name) {
    const startText = `${MARKER_START_PREFIX}${name}"`;

    const startResult = document.evaluate(
        `.//comment()[. = "${startText}"]`,
        target,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
    );
    const startMarker = startResult.singleNodeValue;
    if (!startMarker) return [null, null];

    const endResult = document.evaluate(
        `following-sibling::comment()[. = "${MARKER_END}"][1]`,
        startMarker,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
    );
    const endMarker = endResult.singleNodeValue;

    return [startMarker, endMarker];
}

/**
 * Create start/end markers and insert them into the target.
 */
export function createMarkers(target, name, method = 'appendChild') {
    const startMarker = document.createComment(`${MARKER_START_PREFIX}${name}"`);
    const endMarker = document.createComment(MARKER_END);

    if (method === 'prepend') {
        target.prepend(endMarker);
        target.prepend(startMarker);
    } else {
        target.appendChild(startMarker);
        target.appendChild(endMarker);
    }

    return [startMarker, endMarker];
}

/**
 * Get all nodes between start and end markers.
 */
export function getNodesBetweenMarkers(start, end) {
    const nodes = [];
    let current = start.nextSibling;
    while (current && current !== end) {
        nodes.push(current);
        current = current.nextSibling;
    }
    return nodes;
}

/**
 * Find existing start/end comment markers among siblings of an anchor element.
 * Used for 'after' insertion mode.
 */
export function findMarkersSibling(anchor, name) {
    const startText = `${MARKER_START_PREFIX}${name}"`;
    let startMarker = null;
    let endMarker = null;

    let current = anchor.nextSibling;
    while (current) {
        if (current.nodeType === Node.COMMENT_NODE) {
            if (!startMarker && current.data === startText) {
                startMarker = current;
            } else if (startMarker && !endMarker && current.data === MARKER_END) {
                endMarker = current;
                break;
            }
        }
        current = current.nextSibling;
    }

    return [startMarker, endMarker];
}

/**
 * Create start/end markers as siblings after an anchor element.
 * Used for 'after' insertion mode.
 */
export function createMarkersSibling(anchor, name) {
    const startMarker = document.createComment(`${MARKER_START_PREFIX}${name}"`);
    const endMarker = document.createComment(MARKER_END);

    anchor.after(startMarker, endMarker);

    return [startMarker, endMarker];
}
