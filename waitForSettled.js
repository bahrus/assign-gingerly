/**
 * waitForSettled.ts — Waits for a DOM subtree to "settle" (mutations stop cascading).
 *
 * Observes a node for DOM mutations and debounces: each mutation resets an idle timer.
 * When no mutations have occurred for `idleMs` milliseconds, the promise resolves.
 *
 * Useful for waiting for async rendering (itemscope managers, enhancements, features)
 * to complete inside a DocumentFragment before committing to the live DOM.
 *
 * @example
 * import { waitForSettled } from 'assign-gingerly/waitForSettled.js';
 *
 * const fragment = document.createDocumentFragment();
 * // ... clone and assign into fragment ...
 * await waitForSettled(fragment, 100, 2000);
 * target.appendChild(fragment);
 *
 * @param root - The node to observe (typically a DocumentFragment or Element)
 * @param idleMs - Debounce window in milliseconds. Default: 100
 * @param timeout - Maximum wait time in milliseconds. If exceeded, rejects. Default: none (infinite)
 */
export function waitForSettled(root, idleMs = 100, timeout) {
    return new Promise((resolve, reject) => {
        let timer;
        let maxTimer;
        const mo = new MutationObserver(() => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                mo.disconnect();
                if (maxTimer)
                    clearTimeout(maxTimer);
                resolve();
            }, idleMs);
        });
        mo.observe(root, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true
        });
        // Initial timer — resolves if no mutations happen at all
        timer = setTimeout(() => {
            mo.disconnect();
            if (maxTimer)
                clearTimeout(maxTimer);
            resolve();
        }, idleMs);
        // Maximum timeout — rejects if mutations never quiesce
        if (timeout !== undefined) {
            maxTimer = setTimeout(() => {
                mo.disconnect();
                clearTimeout(timer);
                reject(new Error(`waitForSettled: mutations did not quiesce within ${timeout}ms`));
            }, timeout);
        }
    });
}
