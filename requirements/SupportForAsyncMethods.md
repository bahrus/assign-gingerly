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

  


---

## Kiro's Comments

The idea is clear — some methods in a chain return Promises (e.g., `fetch`, `whenFeatureReady`, custom async APIs), and you want the path evaluation to `await` those before continuing to the next segment.

### How it would work

Given:

```javascript
assignGingerly(el, {
    '?.whenFeatureReady?.photoTaker?.takePicture': 'smile'
}, { 
    withMethods: ['takePicture'],
    withAsyncMethods: ['whenFeatureReady']
});
```

The path evaluation would:
1. Access `el.whenFeatureReady` — it's in `withAsyncMethods`, so call it: `el.whenFeatureReady('photoTaker')`
2. The result is a Promise — `await` it to get the resolved value (the feature instance)
3. Continue the chain: call `instance.takePicture('smile')` (it's in `withMethods`)

### Key design questions

#### 1. Does this make `assignGingerly` async?

Currently `assignGingerly` is synchronous and returns the target. If any path contains an async method, the entire operation for that key becomes async. Two options:

**(A) assignGingerly stays synchronous, async paths are fire-and-forget** — the function returns immediately, and the async chain completes in the background. No way for the caller to know when it's done (unless they use a signal or callback).

**(B) assignGingerly returns a Promise when async methods are involved** — this changes the return type. Could be `target | Promise<target>`.

I'd lean toward **(A)** for backward compatibility. `assignGingerly` has always been synchronous. Making it conditionally async would break existing code that chains off the return value. The async path is "fire and forget" — it completes eventually, and if the caller needs to know when, they can use `whenFeatureReady` or similar mechanisms separately.

#### 2. How does it interact with `evaluatePathWithMethods`?

The current `evaluatePathWithMethods` is synchronous — it walks the path and returns `{ target, lastKey, isMethod }`. With async methods, we'd need an async variant:

```typescript
async function evaluatePathWithAsyncMethods(
    target: any,
    pathParts: string[],
    value: any,
    withMethods: Set<string>,
    withAsyncMethods: Set<string>
): Promise<{ target: any; lastKey: string; isMethod: boolean; isAsyncMethod: boolean }> {
    let current = target;
    // ... same loop, but when hitting an asyncMethod:
    // current = await method.call(current, arg);
}
```

The sync `evaluatePathWithMethods` stays unchanged for paths without async methods. The async variant is only used when `withAsyncMethods` is provided and the path contains one of those method names.

#### 3. Interaction with `@each` and `@eachTime`

If an async method appears before `@each`, we'd need to await it before iterating. If it appears after `@each`, each iteration would spawn its own async chain. This could get complex — worth deferring nested async+iteration to a future phase?

#### 4. The `whenFeatureReady` connection

This is clearly the motivating use case — you want to be able to do:

```javascript
assignGingerly(el, {
    '?.whenFeatureReady?.photoTaker?.someProp': 'hello'
}, { withAsyncMethods: ['whenFeatureReady'] });
```

Which would: call `el.whenFeatureReady('photoTaker')`, await the result, then set `result.someProp = 'hello'`. This is elegant — it lets you declaratively assign into async features without manual `await` boilerplate.

#### 5. Error handling

If the async method rejects, what happens? Options:
- Silent failure (fire-and-forget, errors go to unhandled rejection)
- Console.error (visible but non-blocking)
- Store the error somewhere accessible

I'd suggest: let the rejection propagate naturally as an unhandled Promise rejection. The browser/Node will report it. If the caller wants to handle errors, they should use `whenFeatureReady` directly with try/catch rather than going through assignGingerly.

#### 6. Implementation sketch

```typescript
// In assignGingerly, after detecting withAsyncMethods in options:
if (withAsyncMethodsSet && pathContainsAsyncMethod(pathParts, withAsyncMethodsSet)) {
    // Fire-and-forget async evaluation
    (async () => {
        const result = await evaluatePathWithAsyncMethods(
            target, pathParts, value, withMethodsSet || new Set(), withAsyncMethodsSet
        );
        if (result.isMethod || result.isAsyncMethod) {
            const method = result.target[result.lastKey];
            if (typeof method === 'function') {
                const returnVal = Array.isArray(value) 
                    ? method.apply(result.target, value) 
                    : method.call(result.target, value);
                if (result.isAsyncMethod) await returnVal;
            }
        } else {
            result.target[result.lastKey] = value;
        }
    })();
    continue; // skip to next key in the source object
}
```

### Summary

The proposal is straightforward and the use case (declarative assignment into async features) is compelling. Main decisions:

1. **Fire-and-forget** (assignGingerly stays synchronous) — I recommend this.
2. **Separate async path evaluator** — keeps the sync path untouched and fast.
3. **Defer `@each` + async interaction** to a future phase.
4. **Natural error propagation** via unhandled rejection.

Ready to implement if you agree with the fire-and-forget approach. Or if you'd prefer assignGingerly to optionally return a Promise, let me know.

---

## Human Response:

#### 1. Does this make `assignGingerly` async?

I agree, keep it synchronous, async paths are fire-and-forget.  The use cases are more on the side of synchronous, and making things async is considered "virus like", so wanting to keep it that way to err on the side of most use cases.

#### 2. How does it interact with `evaluatePathWithMethods`?

Sounds like a plan.  We can load a separate module asynchronous to evaluePathWithAsyncMethods, since it's conditional, and is asynchronous.

#### 3. Interaction with `@each` and `@eachTime`

Let's defer, but add a comment that isn't implemented, until a compelling use case presents itself.

#### 4. The `whenFeatureReady` connection

Yes, to that.

#### 5. Error handling

I agree with your suggestion.