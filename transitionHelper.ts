/**
 * transitionHelper.ts — Shared view transition coordination utility.
 * 
 * Provides transition state management, the startViewTransition wrapper with
 * cancel/re-entry protection, and one-time CSS style injection.
 * 
 * Used by lazyLoad, lazyLoadSwitch, and available for external consumers
 * like be-switched.
 * 
 * @example
 * import { withTransition, ensureHideStyle } from 'assign-gingerly/transitionHelper.js';
 * 
 * ensureHideStyle(rootNode);  // inject default .ag-hide style once
 * 
 * withTransition(markerNode, 'show', true, () => {
 *     element.classList.remove('ag-hide');
 * });
 */

/**
 * Transition state for a given DOM marker node.
 */
export interface TransitionState {
    active?: ViewTransition;
    showPending: boolean;
    hidePending: boolean;
}

/**
 * Module-level state map: marker node → transition state.
 * WeakMap ensures cleanup when markers are GC'd.
 */
const stateMap = new WeakMap<Node, TransitionState>();

/**
 * Get or create transition state for a marker node.
 */
export function getTransitionState(markerNode: Node): TransitionState {
    let state = stateMap.get(markerNode);
    if (!state) {
        state = { showPending: false, hidePending: false };
        stateMap.set(markerNode, state);
    }
    return state;
}

/**
 * Execute a DOM mutation with optional view transition coordination.
 * 
 * When `transitional` is true and `document.startViewTransition` is available:
 * - Cancels any in-flight transition for this marker
 * - Prevents re-entry (duplicate show/hide while one is pending)
 * - Wraps the mutation in `document.startViewTransition`
 * 
 * When `transitional` is false or the API is unavailable:
 * - Executes the mutation directly (no animation)
 * 
 * @param markerNode - The DOM node used as state key (typically the start comment marker)
 * @param direction - 'show' or 'hide' — determines which pending flag to check
 * @param transitional - Whether to use view transitions
 * @param domMutation - The function that performs the actual DOM changes
 */
export function withTransition(
    markerNode: Node,
    direction: 'show' | 'hide',
    transitional: boolean,
    domMutation: () => void
): void {
    if (!transitional || typeof document === 'undefined' || !document.startViewTransition) {
        domMutation();
        return;
    }

    const state = getTransitionState(markerNode);

    if (direction === 'show') {
        state.hidePending = false;
        if (state.showPending) return;
        state.showPending = true;
        state.active?.skipTransition();
        state.active = document.startViewTransition(domMutation);
        state.active.finished.finally(() => { state.showPending = false; });
    } else {
        state.showPending = false;
        if (state.hidePending) return;
        state.hidePending = true;
        state.active?.skipTransition();
        state.active = document.startViewTransition(domMutation);
        state.active.finished.finally(() => { state.hidePending = false; });
    }
}

/**
 * Track which (rootNode, className) combos already have styles injected.
 */
const styleInjected = new WeakMap<object, Set<string>>();

/**
 * Default CSS class name for hidden elements during transitions.
 */
export const DEFAULT_HIDE_CLASS = 'ag-hide';

/**
 * Default CSS rule for the hide class.
 */
const DEFAULT_HIDE_CSS = `display: none`;

/**
 * Ensure the hide class style is injected into the rootNode (once per rootNode + className combo).
 * 
 * @param rootNode - The Document, ShadowRoot, or element root to inject into
 * @param hideClass - CSS class name (default: 'ag-hide')
 * @param hideCss - CSS properties for the hide class (default: 'display: none')
 */
export function ensureHideStyle(
    rootNode: any,
    hideClass: string = DEFAULT_HIDE_CLASS,
    hideCss: string = DEFAULT_HIDE_CSS
): void {
    // Determine the injection target (shadowRoot or document.head)
    let target = rootNode;
    if (target.host === undefined && typeof document !== 'undefined') {
        target = document.head;
    }

    let injectedClasses = styleInjected.get(target);
    if (!injectedClasses) {
        injectedClasses = new Set();
        styleInjected.set(target, injectedClasses);
    }

    if (injectedClasses.has(hideClass)) return;
    injectedClasses.add(hideClass);

    const style = document.createElement('style');
    style.textContent = `.${hideClass} { ${hideCss} }`;
    target.appendChild(style);
}
