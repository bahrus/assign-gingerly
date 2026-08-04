/**
 * handlers/addEventListener.ts — Event binding handler for += operator.
 * 
 * Dynamically imported when assignGingerly/assignFrom detects an += with
 * an object RHS containing an `on` property on a DOM Element LHS.
 * 
 * Attaches an event listener that executes assign vectors on event fire.
 */

import assignGingerly from '../assignGingerly.js';
import type { AddEventListenerConfig, AssignDispatchVector } from '../types/assign-gingerly/types.js';
import type { AssignPermissions } from '../types/assign-gingerly/types.js';

/**
 * WeakMap for dedup: Element → Map<key, AbortController>
 */
const keyMap = new WeakMap<Element, Map<string, AbortController>>();

/**
 * Reserved keys that are not shorthand assign patterns.
 */
const RESERVED_KEYS = new Set([
    'on', 'get', 'fromLHS', 'fromHost', 'fromEvent', 'fromTarget',
    'toTarget', 'toHost', 'toLHS', 'withOptions', 'toTargetOptions',
    'toHostOptions', 'toLHSOptions', 'dispatch', 'nudge'
]);

/**
 * Extract shorthand keys (implicit toHost) from a vector config.
 * Any key not in RESERVED_KEYS that starts with '?.' or contains an operator is shorthand.
 */
function extractShorthand(config: Record<string, any>): Record<string, any> | null {
    const shorthand: Record<string, any> = {};
    let hasAny = false;
    for (const key of Object.keys(config)) {
        if (!RESERVED_KEYS.has(key)) {
            shorthand[key] = config[key];
            hasAny = true;
        }
    }
    return hasAny ? shorthand : null;
}

/**
 * Process a single AssignDispatchVector — execute all toTarget/toHost/toLHS assignments.
 */
function processVector(
    vector: AssignDispatchVector,
    source: any,
    target: any,
    host: any,
    lhs: Element,
    inheritedOptions: any,
    useAssignFrom: boolean,
    permissions?: AssignPermissions
): void {
    const destinations = [
        { key: 'toTarget' as const, dest: target },
        { key: 'toHost' as const, dest: host },
        { key: 'toLHS' as const, dest: lhs },
    ];

    for (const { key, dest } of destinations) {
        const pattern = vector[key];
        if (!pattern || Object.keys(pattern).length === 0) continue;
        if (useAssignFrom && source != null) {
            // Dynamic import assignFrom on demand (fire-and-forget context, already async)
            import('../assignFrom.js').then(({ assignFrom }) => {
                assignFrom(dest, pattern, { from: source, ...inheritedOptions, ...vector.withOptions }, permissions);
            });
        } else {
            assignGingerly(dest, pattern, inheritedOptions, permissions);
        }
    }

    // Handle shorthand (implicit toHost)
    const shorthand = extractShorthand(vector as Record<string, any>);
    if (shorthand) {
        if (useAssignFrom && source != null) {
            import('../assignFrom.js').then(({ assignFrom }) => {
                assignFrom(host, shorthand, { from: source, ...inheritedOptions, ...vector.withOptions }, permissions);
            });
        } else {
            assignGingerly(host, shorthand, inheritedOptions, permissions);
        }
    }
}

/**
 * Attach an event listener based on AddEventListenerConfig.
 * 
 * @param lhs - The DOM element to attach the listener to
 * @param config - The event handler configuration
 * @param target - The assignFrom target (first arg)
 * @param host - The options.from (source/view model)
 * @param inheritedOptions - Parent assignFrom options (withMethods, aka, etc.)
 */
export function attachEventListener(
    lhs: Element,
    config: AddEventListenerConfig,
    target: any,
    host: any,
    inheritedOptions: any,
    permissions?: AssignPermissions
): void {
    const { on: eventName, get: getConfig, fromLHS, fromHost, fromTarget, fromEvent, dispatch } = config;

    // Resolve get config values
    const { abortController, key, nudge, options: listenerOptions, stopPropagation, preventDefault, dispatch: getDispatch } = getConfig ?? {} as any;

    // Handle dedup via key
    let controller: AbortController;
    if (key) {
        let elMap = keyMap.get(lhs);
        if (!elMap) {
            elMap = new Map();
            keyMap.set(lhs, elMap);
        }
        // Abort previous listener with same key
        const prev = elMap.get(key);
        if (prev) prev.abort();
        // Create new controller for this key
        controller = new AbortController();
        elMap.set(key, controller);
    } else if (abortController instanceof AbortController) {
        controller = abortController;
    } else {
        controller = new AbortController();
    }

    // Attach the listener
    lhs.addEventListener(eventName, (event: Event) => {
        if (stopPropagation) event.stopPropagation();
        if (preventDefault) event.preventDefault();

        // Static assignments (no from) — top-level toTarget/toHost/toLHS + shorthand
        processVector(config, null, target, host, lhs, inheritedOptions, false, permissions);

        // fromLHS assignments
        if (fromLHS) {
            processVector(fromLHS, lhs, target, host, lhs, inheritedOptions, true, permissions);
        }

        // fromHost assignments
        if (fromHost) {
            processVector(fromHost, host, target, host, lhs, inheritedOptions, true, permissions);
        }

        // fromTarget assignments
        if (fromTarget) {
            processVector(fromTarget, target, target, host, lhs, inheritedOptions, true, permissions);
        }

        // fromEvent assignments
        if (fromEvent) {
            processVector(fromEvent, event, target, host, lhs, inheritedOptions, true, permissions);
        }

        // Dispatch custom event if configured
        const dispatchConfig = dispatch || getDispatch;
        if (dispatchConfig && dispatchConfig.type) {
            const EventCtr = (typeof dispatchConfig.eventCtr === 'function' 
                ? dispatchConfig.eventCtr 
                : CustomEvent) as typeof CustomEvent;
            const evt = new EventCtr(dispatchConfig.type, {
                detail: dispatchConfig.detail,
                bubbles: dispatchConfig.bubbles ?? true,
                cancelable: dispatchConfig.cancelable ?? false,
                composed: dispatchConfig.composed ?? true,
            });
            lhs.dispatchEvent(evt);
        }
    }, { signal: controller.signal, ...listenerOptions });

    // Nudge: remove disabled, add interaction hints
    if (nudge) {
        import('./nudge.js').then(({ nudge: nudgeFn }) => {
            nudgeFn(lhs);
        });
    }
}
