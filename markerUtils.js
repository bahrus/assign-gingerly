/**
 * markerUtils.ts — Shared utilities for comment marker management.
 *
 * Used by lazyLoad, microDataJoin, and future template loop handlers.
 * Provides finding, creating, and traversing comment marker pairs.
 *
 * Markers are HTML comment nodes with specific content:
 * - Start: <!--?start name="markerName"-->
 * - End:   <!--?end-->
 */
export const MARKER_START_PREFIX = '?start name="';
export const MARKER_END = '?end';
/**
 * Find existing start/end comment markers in a target element (TreeWalker approach).
 * Searches the subtree of `target` for matching comment nodes.
 *
 * @param target - The element to search within
 * @param name - The marker name to find
 * @returns [startMarker, endMarker] or [null, null] if not found
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
        }
        else if (startMarker && !endMarker && node.data === MARKER_END) {
            endMarker = node;
            break;
        }
    }
    return [startMarker, endMarker];
}
/**
 * Find existing start/end comment markers using XPath (alternative approach).
 * May be faster in large DOMs due to engine-level indexing.
 *
 * @param target - The element to search within
 * @param name - The marker name to find
 * @returns [startMarker, endMarker] or [null, null] if not found
 */
export function findMarkersXPath(target, name) {
    const startText = `${MARKER_START_PREFIX}${name}"`;
    const startResult = document.evaluate(`.//comment()[. = "${startText}"]`, target, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    const startMarker = startResult.singleNodeValue;
    if (!startMarker)
        return [null, null];
    // Find the next sibling comment that is the end marker
    const endResult = document.evaluate(`following-sibling::comment()[. = "${MARKER_END}"][1]`, startMarker, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
    const endMarker = endResult.singleNodeValue;
    return [startMarker, endMarker];
}
/**
 * Create start/end markers and insert them into the target.
 *
 * @param target - The element to insert markers into
 * @param name - The marker name
 * @param method - 'appendChild' (default) or 'prepend'
 * @returns [startMarker, endMarker]
 */
export function createMarkers(target, name, method = 'appendChild') {
    const startMarker = document.createComment(`${MARKER_START_PREFIX}${name}"`);
    const endMarker = document.createComment(MARKER_END);
    if (method === 'prepend') {
        target.prepend(endMarker);
        target.prepend(startMarker);
    }
    else {
        target.appendChild(startMarker);
        target.appendChild(endMarker);
    }
    return [startMarker, endMarker];
}
/**
 * Get all nodes between start and end markers.
 *
 * @param start - The start comment marker
 * @param end - The end comment marker
 * @returns Array of nodes between the markers (exclusive of markers themselves)
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
 * Used for 'after' insertion mode where markers are siblings, not children.
 *
 * @param anchor - The element after which markers were inserted
 * @param name - The marker name to find
 * @returns [startMarker, endMarker] or [null, null] if not found
 */
export function findMarkersSibling(anchor, name) {
    const startText = `${MARKER_START_PREFIX}${name}"`;
    let startMarker = null;
    let endMarker = null;
    let current = anchor.nextSibling;
    while (current) {
        if (current.nodeType === Node.COMMENT_NODE) {
            const comment = current;
            if (!startMarker && comment.data === startText) {
                startMarker = comment;
            }
            else if (startMarker && !endMarker && comment.data === MARKER_END) {
                endMarker = comment;
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
 *
 * @param anchor - The element to insert markers after
 * @param name - The marker name
 * @returns [startMarker, endMarker]
 */
export function createMarkersSibling(anchor, name) {
    const startMarker = document.createComment(`${MARKER_START_PREFIX}${name}"`);
    const endMarker = document.createComment(MARKER_END);
    // Insert after the anchor: anchor → startMarker → endMarker
    anchor.after(startMarker, endMarker);
    return [startMarker, endMarker];
}
