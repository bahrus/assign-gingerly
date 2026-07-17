# getValues as Synchronous Resolve Values

---

## Human Ask

This is first in a series of requests to rename assignFrom to assignFromAsync and define a synchronous assignFrom, in baby steps.

I think the word "resolve" is closely associated with promises and thus with async await.  So I'm inclined to want another name for the synchronous version.  I think getValues is close if not the best name.

We should share as much code as possible.

The interface defined in resolveValues:

```TS
/**
 * Options for resolveValues
 */
export interface ResolveValuesOptions {
  /**
   * Method names that should be called instead of accessed as properties.
   * When a path segment matches, it's called as a method with the next segment as argument.
   */
  withMethods?: string[] | Set<string>;
  
  /**
   * Alias mappings for path segments.
   * Substituted before path resolution, matching complete tokens between `?.` delimiters.
   */
  aka?: Record<string, string>;

  /**
   * Protocol handlers for resolving protocol-prefixed values (e.g., 'globalThis://key').
   * Each handler receives the key portion and returns the resolved value (sync or async).
   * 
   * If a value contains '://' but the protocol isn't in this map, the value passes through unchanged.
   * If a '?.' appears after the protocol key, the remaining path is resolved against the handler's result.
   * 
   * @example
   * protocols: {
   *     globalThis: (key) => globalThis[key],
   *     localStorage: (key) => JSON.parse(localStorage.getItem(key) || 'null')
   * }
   */
  protocols?: Record<string, (key: string) => any | Promise<any>>;
}
```

should be moved to types/assign-gingerly/types.d.ts.

Can you add to the steering guidance that all types should go there?

So should IAssignGingerlyOptions in assignGingerly.

Really, I think ResolveValuesOptions should extend IAssignGingerlyOptions, and redundancies removed.

I think we need another interface, GetValuesOptions:  

```TS
/**
 * Options for resolveValues
 */
export interface GetValuesOptions extends IAssignGingerlyOptions{
  

  /**
   * Protocol handlers for resolving protocol-prefixed values (e.g., 'globalThis://key').
   * Each handler receives the key portion and returns the resolved value (sync or async).
   * 
   * If a value contains '://' but the protocol isn't in this map, the value passes through unchanged.
   * If a '?.' appears after the protocol key, the remaining path is resolved against the handler's result.
   * 
   * @example
   * protocols: {
   *     globalThis: (key) => globalThis[key],
   *     localStorage: (key) => JSON.parse(localStorage.getItem(key) || 'null')
   * }
   */
  protocols?: Record<string, (key: string) => any;
}
```

Many of the functions found in resolveValues should be moved to getValues, since getValues is more time-sensitive.

It looks like since function resolveValue is still synchronous, it should be moved to getValues and renamed getValue.

