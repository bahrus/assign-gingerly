# Support for Async Methods

## Human Ask

The assignGingerly options option satisfies this type:

```TypeScript
/**
 * Interface for the options passed to assignGingerly
 */
export interface IAssignGingerlyOptions {
  registry?: typeof EnhancementRegistry | EnhancementRegistry;
  bypassChecks?: boolean;
  withMethods?: string[] | Set<string>;
  aka?: Record<string, string>;
  
  /**
   * AbortSignal for cleaning up reactive subscriptions (@eachTime)
   * Required when using @eachTime symbol for reactive iteration
   * When the signal is aborted, all event listeners are automatically removed
   */
  signal?: AbortSignal;
}

```

This proposal is to add another property:

```TypeScript
export interface IAssignGingerlyOptions {
    withAsyncMethods?: string[] | Set<string>
}
```

It does exactly what withMethods does (working together), the difference beween, in the case of asyncMethods, the method is done in a spawned async "thread" that awaits for the method to finish, and continues the chain/

  