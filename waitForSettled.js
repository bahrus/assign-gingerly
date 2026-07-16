/**
 * waitForSettled.js — Waits for a DOM subtree to "settle" (mutations stop cascading).
 *
 * Observes a node for DOM mutations and debounces: each mutation resets an idle timer.
 * When no mutations have occurred for `idleMs` milliseconds, the promise resolves.
 *
 * @param {Node} root - The node to observe
 * @param {number} [idleMs=100] - Debounce window in milliseconds
 * @param {number} [timeout] - Maximum wait time in milliseconds
 * @returns {Promise<void>}
 */
export function waitForSettled(root, idleMs = 100, timeout) {
    return new Promise((resolve, reject) => {
        let timer;
        let maxTimer;

        const mo = new MutationObserver(() => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                mo.disconnect();
                if (maxTimer) clearTimeout(maxTimer);
                resolve();
            }, idleMs);
        });

        mo.observe(root, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true
        });

        timer = setTimeout(() => {
            mo.disconnect();
            if (maxTimer) clearTimeout(maxTimer);
            resolve();
        }, idleMs);

        if (timeout !== undefined) {
            maxTimer = setTimeout(() => {
                mo.disconnect();
                clearTimeout(timer);
                reject(new Error(
                    `waitForSettled: mutations did not quiesce within ${timeout}ms`
                ));
            }, timeout);
        }
    });
}
