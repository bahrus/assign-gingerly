/**
 * Wait for an event to be fired on an EventTarget
 * @param et - The EventTarget to listen on
 * @param eventName - The event name to wait for (resolves the promise)
 * @param failureEventName - Optional event name that rejects the promise
 * @returns Promise that resolves with the event
 */
export function waitForEvent(et, eventName, failureEventName) {
    return new Promise((resolve, reject) => {
        et.addEventListener(eventName, (e) => {
            resolve(e);
        }, { once: true });
        if (failureEventName !== undefined) {
            et.addEventListener(failureEventName, (e) => {
                reject(e);
            }, { once: true });
        }
    });
}
