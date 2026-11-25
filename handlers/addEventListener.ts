/**
 * handlers/addEventListener.ts — Event binding handler for += operator.
 * 
 * Dynamically imported when assignGingerly/assignFrom detects an += with
 * an object RHS containing an `on` property on a DOM Element LHS.
 * 
 * Attaches an event listener that executes assign vectors on event fire.
 */

import assignGingerly from '../assignGingerly.js';
import { getValue } from '../resolve/getValues.js';
import type { AddEventListenerConfig, AssignDispatchVector, DispatchEventConfig, PermissionProcessor } from '../types/assign-gingerly/types.js';

/**
 * WeakMap for dedup: Element → Map<key, AbortController>
 */
const keyMap = new WeakMap<Element, Map<string, AbortController>>();

/**
 * Reserved keys that are not shorthand assign patterns.
 */
const RESERVED_KEYS = new Set([
    'on', 'call', 'get', 'fromLHS', 'fromHost', 'fromEvent', 'fromTarget',
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
    permissionProcessor?: PermissionProcessor
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
                assignFrom(dest, pattern, { ...inheritedOptions, ...vector.withOptions, from: source }, permissionProcessor);
            });
        } else {
            assignGingerly(dest, pattern, inheritedOptions, permissionProcessor);
        }
    }

    // Handle shorthand (implicit toHost)
    const shorthand = extractShorthand(vector as Record<string, any>);
    if (shorthand) {
        if (useAssignFrom && source != null) {
            import('../assignFrom.js').then(({ assignFrom }) => {
                assignFrom(host, shorthand, { ...inheritedOptions, ...vector.withOptions, from: source }, permissionProcessor);
            });
        } else {
            assignGingerly(host, shorthand, inheritedOptions, permissionProcessor);
        }
    }
}

/**
 * What to dispatch at: `dispatch.at` resolved against the host (a path), or as is (an EventTarget).
 * Without `at`, the element with the listener.
 */
function resolveDispatchTarget(
    at: DispatchEventConfig['at'],
    lhs: Element,
    target: any,
    host: any,
    inheritedOptions: any,
    permissionProcessor?: PermissionProcessor
): any {
    if (at === undefined) return lhs;
    if (typeof at !== 'string') return at;
    return getValue(at, host, { ...inheritedOptions, root: target, permissionProcessor });
}

/**
 * The constructor for `dispatch.eventCtr`: a constructor, or the name of one (for JSON).
 */
function resolveEventCtr(eventCtr: DispatchEventConfig['eventCtr']): new (type: string, init?: CustomEventInit) => Event {
    if (typeof eventCtr === 'function') return eventCtr;
    if (eventCtr === 'Event') return Event;
    if (eventCtr != null && eventCtr !== 'CustomEvent') {
        console.warn(`addEventListener: dispatch "eventCtr" (${String(eventCtr)}) is not 'Event', 'CustomEvent' or a constructor; using CustomEvent.`);
    }
    return CustomEvent;
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
    permissionProcessor?: PermissionProcessor
): void {
    const { on: eventName, call, get: getConfig, fromLHS, fromHost, fromTarget, fromEvent, dispatch } = config;

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

        // Resolved before anything runs: an assignment may move or remove what the path starts from
        const dispatchConfig: DispatchEventConfig | undefined = dispatch || getDispatch;
        const dispatchTarget = dispatchConfig?.type
            ? resolveDispatchTarget(dispatchConfig.at, lhs, target, host, inheritedOptions, permissionProcessor)
            : undefined;

        // call: invoke a host method with the event (respecting restricted methods)
        if (call && !permissionProcessor?.checkRestrictedMethod(call)) {
            const method = host?.[call];
            if (typeof method !== 'function') {
                throw new Error(`addEventListener: call "${call}" is not a method on the host`);
            }
            method.call(host, event);
        }

        // Static assignments (no from) — top-level toTarget/toHost/toLHS + shorthand
        processVector(config, null, target, host, lhs, inheritedOptions, false, permissionProcessor);

        // fromLHS assignments
        if (fromLHS) {
            processVector(fromLHS, lhs, target, host, lhs, inheritedOptions, true, permissionProcessor);
        }

        // fromHost assignments
        if (fromHost) {
            processVector(fromHost, host, target, host, lhs, inheritedOptions, true, permissionProcessor);
        }

        // fromTarget assignments
        if (fromTarget) {
            processVector(fromTarget, target, target, host, lhs, inheritedOptions, true, permissionProcessor);
        }

        // fromEvent assignments
        if (fromEvent) {
            processVector(fromEvent, event, target, host, lhs, inheritedOptions, true, permissionProcessor);
        }

        // Dispatch the event, if configured
        if (dispatchConfig?.type) {
            const { type, at, eventCtr, detail, bubbles, cancelable, composed } = dispatchConfig;
            if (dispatchTarget instanceof EventTarget) {
                const EventCtr = resolveEventCtr(eventCtr);
                dispatchTarget.dispatchEvent(new EventCtr(type, {
                    detail,
                    bubbles: bubbles ?? true,
                    cancelable: cancelable ?? false,
                    composed: composed ?? true,
                }));
            } else {
                console.warn(`addEventListener: dispatch "at" (${String(at)}) is not an EventTarget; "${type}" was not dispatched.`);
            }
        }
    }, { signal: controller.signal, ...listenerOptions });

    // Nudge: remove disabled, add interaction hints
    if (nudge) {
        import('./nudge.js').then(({ nudge: nudgeFn }) => {
            nudgeFn(lhs);
        });
    }
}
