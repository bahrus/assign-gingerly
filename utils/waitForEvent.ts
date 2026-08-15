/**
 * Wait for an event to be fired on an EventTarget
 * @param et - The EventTarget to listen on
 * @param eventName - The event name to wait for (resolves the promise)
 * @param failureEventName - Optional event name that rejects the promise
 * @param timeout - Optional timeout in milliseconds (rejects if exceeded)
 * @returns Promise that resolves with the event
 */
export function waitForEvent<TEvent extends Event = Event>(
  et: EventTarget,
  eventName: string,
  failureEventName?: string,
  timeout?: number
): Promise<TEvent> {
  return new Promise((resolve, reject) => {
    let timeoutId: number | undefined;
    
    const cleanup = () => {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    };
    
    et.addEventListener(
      eventName,
      (e) => {
        cleanup();
        resolve(e as TEvent);
      },
      { once: true }
    );
    
    if (failureEventName !== undefined) {
      et.addEventListener(
        failureEventName,
        (e) => {
          cleanup();
          reject(e as TEvent);
        },
        { once: true }
      );
    }
    
    if (timeout !== undefined && timeout > 0) {
      timeoutId = setTimeout(() => {
        reject(new Error(`Timeout waiting for event '${eventName}' after ${timeout}ms`));
      }, timeout) as unknown as number;
    }
  });
}
