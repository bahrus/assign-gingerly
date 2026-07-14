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
export function findMarkers(target: Element | Node, name: string): [Comment | null, Comment | null] {
    const startText = `${MARKER_START_PREFIX}${name}"`;
    let startMarker: Comment | null = null;
    let endMarker: Comment | null = null;

    const walker = document.createTreeWalker(target as Node, NodeFilter.SHOW_COMMENT);
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
 * Find existing start/end comment markers using XPath (alternative approach).
 * May be faster in large DOMs due to engine-level indexing.
 * 
 * @param target - The element to search within
 * @param name - The marker name to find
 * @returns [startMarker, endMarker] or [null, null] if not found
 */
export function findMarkersXPath(target: Element | Node, name: string): [Comment | null, Comment | null] {
    const startText = `${MARKER_START_PREFIX}${name}"`;

    const startResult = document.evaluate(
        `.//comment()[. = "${startText}"]`,
        target,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
    );
    const startMarker = startResult.singleNodeValue as Comment | null;
    if (!startMarker) return [null, null];

    // Find the next sibling comment that is the end marker
    const endResult = document.evaluate(
        `following-sibling::comment()[. = "${MARKER_END}"][1]`,
        startMarker,
        null,
        XPathResult.FIRST_ORDERED_NODE_TYPE,
        null
    );
    const endMarker = endResult.singleNodeValue as Comment | null;

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
export function createMarkers(target: Element, name: string, method: string = 'appendChild'): [Comment, Comment] {
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
 * 
 * @param start - The start comment marker
 * @param end - The end comment marker
 * @returns Array of nodes between the markers (exclusive of markers themselves)
 */
export function getNodesBetweenMarkers(start: Comment, end: Comment): Node[] {
    const nodes: Node[] = [];
    let current: Node | null = start.nextSibling;
    while (current && current !== end) {
        nodes.push(current);
        current = current.nextSibling;
    }
    return nodes;
}
