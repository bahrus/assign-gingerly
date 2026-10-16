/**
 * Place `nodes` in order inside `parent`, starting at `first` (the first node of their
 * region), moving as few as possible. Shared by builtIns.tree and manageTemplateList.
 *
 * - Nodes already in order are skipped (the common, unchanged case costs one walk).
 * - On the first mismatch, the longest run of the remaining nodes that are already in
 *   relative order (a longest increasing subsequence of their current positions) stays
 *   put, and only the others move — so swapping two items is 2 moves, not one per item
 *   in between. Consecutive nodes that move (or are new) go in together through one
 *   fragment, so creating a whole list is a single insertion.
 * - Other nodes in the region end up after `nodes`: when one sits before or between
 *   them (e.g. added by other code), placement falls back to moving each out-of-place
 *   node in front of a cursor.
 */
export function placeNodes(parent: ParentNode, nodes: Node[], first: ChildNode | null): void {
    const { length } = nodes;
    let cursor = first;
    let start = 0;
    // Fast path: everything (or a leading run) already in place
    while (start < length && nodes[start] === cursor) {
        cursor = cursor.nextSibling;
        start++;
    }
    if (start === length) return;

    // Where the remaining nodes are now: their indices, in DOM order
    const indexOf = new Map<Node, number>();
    for (let i = start; i < length; i++) indexOf.set(nodes[i], i);
    const domOrder: number[] = [];
    let after: ChildNode | null = cursor;
    let otherSeen = false;
    let interleaved = false;
    for (let node = cursor; node; node = node.nextSibling) {
        const i = indexOf.get(node);
        if (i === undefined) {
            otherSeen = true;
            continue;
        }
        if (otherSeen) interleaved = true;
        domOrder.push(i);
        after = node.nextSibling;
    }
    if (interleaved) {
        for (let i = start; i < length; i++) {
            const node = nodes[i];
            if (node === cursor) {
                cursor = cursor.nextSibling;
            } else {
                parent.insertBefore(node, cursor);
            }
        }
        return;
    }

    // Keep the longest already-ordered run. The rest are inserted before their successor,
    // consecutive ones together through one fragment (e.g. all-new items: one insertion).
    const stay = longestIncreasing(domOrder);
    const doc = (parent as Node).ownerDocument ?? document;
    let next = after;
    let run: Node[] = []; // collected back to front
    const flush = () => {
        if (run.length === 0) return;
        if (run.length === 1) {
            parent.insertBefore(run[0], next);
        } else {
            const fragment = doc.createDocumentFragment();
            for (let k = run.length - 1; k >= 0; k--) fragment.appendChild(run[k]);
            parent.insertBefore(fragment, next);
        }
        next = run[run.length - 1] as ChildNode;
        run = [];
    };
    for (let i = length - 1; i >= start; i--) {
        const node = nodes[i];
        if (stay.has(i)) {
            flush();
            next = node as ChildNode;
        } else {
            run.push(node);
        }
    }
    flush();
}

/** The values of a longest strictly increasing subsequence of `values` (O(n log n)). */
function longestIncreasing(values: number[]): Set<number> {
    const tails: number[] = [];
    const previous = new Array<number>(values.length);
    for (let j = 0; j < values.length; j++) {
        const value = values[j];
        let lo = 0;
        let hi = tails.length;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (values[tails[mid]] < value) lo = mid + 1; else hi = mid;
        }
        previous[j] = lo > 0 ? tails[lo - 1] : -1;
        tails[lo] = j;
    }
    const result = new Set<number>();
    for (let j = tails.length > 0 ? tails[tails.length - 1] : -1; j >= 0; j = previous[j]) result.add(values[j]);
    return result;
}
