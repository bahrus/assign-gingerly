/**
 * eachTime.ts - Reactive forEach implementation for @eachTime symbol
 * This module is dynamically loaded only when @eachTime is encountered
 * Provides event-driven iteration over elements as they mount
 */

import type { IAssignGingerlyOptions } from './types/assign-gingerly/types.js';

/**
 * Check if a value is an EventTarget
 */
function isEventTarget(value: any): boolean {
  return value != null && typeof value.addEventListener === 'function';
}

/**
 * Handle reactive forEach (@eachTime) by setting up event listeners
 * 
 * @param target - The root object to start navigation from
 * @param pathParts - Complete path parts array including @eachTime
 * @param forEachIndex - Index of @eachTime in pathParts
 * @param value - Value to assign to each mounted element
 * @param withMethods - Set of method names to call instead of assign
 * @param aliasMap - Map of aliases for token substitution
 * @param options - Options including required AbortSignal
 */
export async function handleEachTime(
  target: any,
  pathParts: string[],
  forEachIndex: number,
  value: any,
  withMethods: Set<string> | undefined,
  aliasMap: Map<string, string>,
  options?: IAssignGingerlyOptions
): Promise<void> {
  // Validate signal - required for cleanup
  if (!options?.signal) {
    throw new Error('@eachTime requires an AbortSignal in options.signal for cleanup');
  }
  
  // Split path into before and after @eachTime
  const pathToEventSource = pathParts.slice(0, forEachIndex);
  const pathAfterForEach = pathParts.slice(forEachIndex + 1);
  
  // Navigate to the event source
  let eventSource = target;
  if (pathToEventSource.length > 0) {
    // Import evaluatePathWithMethods for navigation
    const { evaluatePathWithMethods } = await import('./assignGingerly.js');
    
    if (withMethods && withMethods.size > 0) {
      const result = evaluatePathWithMethods(target, pathToEventSource, value, withMethods);
      eventSource = result.target;
    } else {
      // Simple property navigation
      for (const part of pathToEventSource) {
        eventSource = eventSource[part];
      }
    }
  }
  
  // Validate event source is an EventTarget
  if (!isEventTarget(eventSource)) {
    throw new Error('@eachTime requires an EventTarget (e.g., IMountObserver)');
  }
  
  // Setup event listener for 'mount' events
  const handler = (event: Event) => {
    // Extract mounted element from IMountEvent
    const mountedElement = (event as any).mountedElement;
    if (!mountedElement) return;
    
    // Apply remaining path to mounted element (async to avoid blocking)
    (async () => {
      try {
        // Import needed functions from assignGingerly
        const { 
          evaluatePathWithMethods, 
          assignGingerly, 
          isReadonlyProperty
        } = await import('./assignGingerly.js');
        
        if (pathAfterForEach.length > 0) {
          const result = evaluatePathWithMethods(
            mountedElement, 
            pathAfterForEach, 
            value, 
            withMethods || new Set()
          );
          
          if (result.isMethod) {
            // Last segment is a method - call it
            const method = result.target[result.lastKey];
            if (typeof method === 'function') {
              if (result.isZeroArg) {
                // Trailing | marker - call with no arguments, ignoring the value
                method.call(result.target);
              } else if (Array.isArray(value)) {
                method.apply(result.target, value);
              } else {
                method.call(result.target, value);
              }
            }
          } else {
            // Normal assignment
            const lastKey = result.lastKey;
            const parent = result.target;
            
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
              // Check if property exists and is readonly
              if (lastKey in parent && isReadonlyProperty(parent, lastKey)) {
                const currentValue = parent[lastKey];
                if (typeof currentValue !== 'object' || currentValue === null) {
                  throw new Error(
                    `Cannot merge object into readonly primitive property '${String(lastKey)}'`
                  );
                }
                // Recursively apply assignGingerly
                assignGingerly(currentValue, value, options);
              } else {
                // Property is writable - replace it
                parent[lastKey] = value;
              }
            } else {
              // Primitive value - direct assignment
              parent[lastKey] = value;
            }
          }
        }
      } catch (error) {
        console.error('Error applying @eachTime to mounted element:', error);
      }
    })();
  };
  
  // Register listener with AbortSignal for automatic cleanup
  // Hardcode 'mount' event for IMountObserver
  eventSource.addEventListener('mount', handler, { signal: options.signal });
}
