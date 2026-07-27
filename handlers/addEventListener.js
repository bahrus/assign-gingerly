/**
 * handlers/addEventListener.js — Event binding handler for += operator.
 * 
 * Dynamically imported when assignGingerly/assignFrom detects an += with
 * an object RHS containing an `on` property on a DOM Element LHS.
 */

import assignGingerly from '../assignGingerly.js';

const keyMap = new WeakMap();

const RESERVED_KEYS = new Set([
    'on', 'get', 'fromLHS', 'fromHost', 'fromEvent', 'fromTarget',
    'toTarget', 'toHost', 'toLHS', 'withOptions', 'toTargetOptions',
    'toHostOptions', 'toLHSOptions', 'dispatch', 'nudge'
]);

function extractShorthand(config) {
    const shorthand = {};
    let hasAny = false;
    for (const key of Object.keys(config)) {
        if (!RESERVED_KEYS.has(key)) {
            shorthand[key] = config[key];
            hasAny = true;
        }
    }
    return hasAny ? shorthand : null;
}

function processVector(vector, source, target, host, lhs, inheritedOptions, useAssignFrom) {
    const destinations = [
        { key: 'toTarget', dest: target },
        { key: 'toHost', dest: host },
        { key: 'toLHS', dest: lhs },
    ];

    for (const { key, dest } of destinations) {
        const pattern = vector[key];
        if (!pattern || Object.keys(pattern).length === 0) continue;
        if (useAssignFrom && source != null) {
            import('../assignFrom.js').then(({ assignFrom }) => {
                assignFrom(dest, pattern, { from: source, ...inheritedOptions, ...vector.withOptions });
            });
        } else {
            assignGingerly(dest, pattern, inheritedOptions);
        }
    }

    const shorthand = extractShorthand(vector);
    if (shorthand) {
        if (useAssignFrom && source != null) {
            import('../assignFrom.js').then(({ assignFrom }) => {
                assignFrom(host, shorthand, { from: source, ...inheritedOptions, ...vector.withOptions });
            });
        } else {
            assignGingerly(host, shorthand, inheritedOptions);
        }
    }
}

export function attachEventListener(lhs, config, target, host, inheritedOptions) {
    const { on: eventName, get: getConfig } = config;

    const abortController = getConfig?.abortController;
    const key = getConfig?.key;
    const nudge = getConfig?.nudge;
    const listenerOptions = getConfig?.options;
    const stopPropagation = getConfig?.stopPropagation;
    const preventDefault = getConfig?.preventDefault;

    let controller;
    if (key) {
        let elMap = keyMap.get(lhs);
        if (!elMap) {
            elMap = new Map();
            keyMap.set(lhs, elMap);
        }
        const prev = elMap.get(key);
        if (prev) prev.abort();
        controller = new AbortController();
        elMap.set(key, controller);
    } else if (abortController instanceof AbortController) {
        controller = abortController;
    } else {
        controller = new AbortController();
    }

    lhs.addEventListener(eventName, (event) => {
        if (stopPropagation) event.stopPropagation();
        if (preventDefault) event.preventDefault();

        processVector(config, null, target, host, lhs, inheritedOptions, false);

        if (config.fromLHS) {
            processVector(config.fromLHS, lhs, target, host, lhs, inheritedOptions, true);
        }
        if (config.fromHost) {
            processVector(config.fromHost, host, target, host, lhs, inheritedOptions, true);
        }
        if (config.fromTarget) {
            processVector(config.fromTarget, target, target, host, lhs, inheritedOptions, true);
        }
        if (config.fromEvent) {
            processVector(config.fromEvent, event, target, host, lhs, inheritedOptions, true);
        }

        const dispatchConfig = config.dispatch || getConfig?.dispatch;
        if (dispatchConfig && dispatchConfig.type) {
            const EventCtr = (typeof dispatchConfig.eventCtr === 'function'
                ? dispatchConfig.eventCtr
                : CustomEvent);
            const evt = new EventCtr(dispatchConfig.type, {
                detail: dispatchConfig.detail,
                bubbles: dispatchConfig.bubbles ?? true,
                cancelable: dispatchConfig.cancelable ?? false,
                composed: dispatchConfig.composed ?? true,
            });
            lhs.dispatchEvent(evt);
        }
    }, { signal: controller.signal, ...listenerOptions });

    if (nudge) {
        import('./nudge.js').then(({ nudge: nudgeFn }) => {
            nudgeFn(lhs);
        });
    }
}
