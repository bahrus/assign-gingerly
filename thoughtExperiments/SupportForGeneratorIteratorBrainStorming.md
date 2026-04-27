# Support For Generator Iterators Brainstorming

## Vague Human Query

We've added for @each assigning:

```JavaScript
// Apply to each element in the collection
assignGingerly(div, {
  '?.querySelectorAll?.my-element?.@each?.classList?.add': 'highlighted'
}, { withMethods: ['querySelectorAll', 'add'] });
```

Suppose an element enhancement is created using assign-gingerly, that returns an event target that issues an event "mount" any time another my-element appears within the div, using something like [mount-observer](https://github.com/bahrus/mount-observer).  Can we use a generator yield type each expression?  Kind of like RxJS I guess, but I still want it to be JSON serializable, and not have to fret over the details:  Something like:

```JavaScript
// Apply to each element in the collection
assignGingerly(div, {
  '?.querySelectorAll?.my-element?.@each?.classList?.add': 'highlighted'
}, { withMethods: ['querySelectorAll', 'add'] });
```

```JavaScript
// Apply to each element in the collection
assignGingerlyAndVigilantly(div, {
  '?.mountObserve?.my-element?.@eachTime?.classList?.add': 'highlighted'
}, { withMethods: ['querySelectorAll', 'add'] });
```

First what syntax would you suggest?  Is this requirement heavy enough that we should have a separate function as above to support it, as I suggest above, do you think?  If so, what name would you give it?  Is it implementable?

How would you go about this, in other words?


---

## Agent Analysis

### Understanding the Requirement

The goal is to extend `@each` (which operates on static collections) to support **reactive/streaming** scenarios where items are added over time. This is essentially moving from:
- **Static iteration**: "apply to all items that exist now"
- **Reactive iteration**: "apply to all items that exist now AND any that appear later"

This is a powerful concept that bridges declarative configuration with reactive programming.

### Syntax Proposals

#### Option 1: `@eachTime` (Your Suggestion)
```javascript
assignGingerly(div, {
  '?.mountObserver?.my-element?.@eachTime?.classList?.add': 'highlighted'
}, { withMethods: ['mountObserver', 'add'] });
```

**Pros:**
- Clear distinction from `@each`
- Reads naturally: "each time" implies ongoing
- Consistent with existing `@each` pattern

**Cons:**
- Slightly verbose
- Might be confused with timing/scheduling

#### Option 2: `@watch` or `@observe`
```javascript
assignGingerly(div, {
  '?.mountObserver?.my-element?.@watch?.classList?.add': 'highlighted'
}, { withMethods: ['mountObserver', 'add'] });
```

**Pros:**
- Familiar from reactive frameworks (Vue, MobX)
- Implies ongoing observation
- Shorter than `@eachTime`

**Cons:**
- Less clear that it applies to each item
- Could be confused with watching a single value

#### Option 3: `@each*` or `@each+`
```javascript
assignGingerly(div, {
  '?.mountObserver?.my-element?.@each*?.classList?.add': 'highlighted'
}, { withMethods: ['mountObserver', 'add'] });
```

**Pros:**
- Visually related to `@each`
- `*` suggests "ongoing" or "repeated"
- Very concise

**Cons:**
- Less readable
- Might conflict with aliasing

#### Option 4: `@stream` or `@yield`
```javascript
assignGingerly(div, {
  '?.mountObserver?.my-element?.@stream?.classList?.add': 'highlighted'
}, { withMethods: ['mountObserver', 'add'] });
```

**Pros:**
- Accurately describes the generator/async iterator concept
- Familiar to developers who know RxJS/streams
- Clear that it's different from static `@each`

**Cons:**
- Might be too technical for some users
- Less intuitive than `@eachTime`

### Recommendation: `@eachTime`

I recommend **`@eachTime`** because:
1. **Clear intent**: Immediately conveys "each time something happens"
2. **Consistent**: Follows the `@each` pattern users already know
3. **Readable**: Code reads like natural language
4. **Unambiguous**: No confusion with other concepts

### Separate Function vs. Same Function?

**Recommendation: Same function (`assignGingerly`)**

**Rationale:**
1. **Unified API**: Users don't need to remember which function to use
2. **Composability**: Can mix static `@each` and reactive `@eachTime` in same call
3. **Simpler mental model**: One function, multiple iteration strategies
4. **Easier migration**: Changing `@each` to `@eachTime` is just a symbol change

**However**, if you want a separate function for clarity:

**Suggested names:**
- `assignGingerlyAndWatch` - Clear but verbose
- `assignReactively` - Concise, implies ongoing updates
- `assignAndObserve` - Clear intent
- `assignContinuously` - Emphasizes ongoing nature

**My preference**: Keep it in `assignGingerly` but if separate, use **`assignReactively`**

### Implementation Approach

#### Core Concept

When `@eachTime` is encountered:
1. Apply to existing items (like `@each`)
2. Subscribe to the event source
3. Apply to new items as they arrive
4. Store subscription for cleanup

#### Implementation Strategy

```typescript
interface ReactiveSubscription {
  unsubscribe: () => void;
}

// Track active subscriptions for cleanup
const subscriptions = new WeakMap<any, ReactiveSubscription[]>();

function isReactiveForEachSymbol(segment: string, aliasMap: Map<string, string>): boolean {
  if (segment === '@eachTime') return true;
  const aliasTarget = aliasMap.get(segment);
  return aliasTarget === '@eachTime';
}

function applyToEachReactively(
  eventTarget: EventTarget,
  eventName: string,
  remainingPath: string[],
  value: any,
  withMethods: Set<string>,
  aliasMap: Map<string, string>,
  options?: IAssignGingerlyOptions
): void {
  // Apply to initial items (if any)
  // This depends on how the event source provides initial state
  
  // Subscribe to future items
  const handler = (event: Event) => {
    // Extract the new item from the event
    const newItem = (event as any).detail || event.target;
    
    // Apply the remaining path to the new item
    if (remainingPath.length > 0) {
      const result = evaluatePathWithMethods(newItem, remainingPath, value, withMethods);
      
      if (result.isMethod) {
        const method = result.target[result.lastKey];
        if (typeof method === 'function') {
          if (Array.isArray(value)) {
            method.apply(result.target, value);
          } else {
            method.call(result.target, value);
          }
        }
      } else {
        result.target[result.lastKey] = value;
      }
    }
  };
  
  eventTarget.addEventListener(eventName, handler);
  
  // Store subscription for cleanup
  const subscription = {
    unsubscribe: () => eventTarget.removeEventListener(eventName, handler)
  };
  
  const subs = subscriptions.get(eventTarget) || [];
  subs.push(subscription);
  subscriptions.set(eventTarget, subs);
}
```

#### Integration Points

1. **Detection**: In path parsing, detect `@eachTime` like we detect `@each`
2. **Event Source**: The value before `@eachTime` must be an EventTarget or have an async iterator
3. **Event Name**: Need to determine what event to listen for
4. **Cleanup**: Need disposal mechanism to unsubscribe

### Key Challenges

#### Challenge 1: Event Name Discovery

**Problem**: How do we know what event to listen for?

**Options:**
1. **Convention**: Assume a standard event name (e.g., 'mount', 'add', 'item')
2. **Configuration**: Add option like `reactiveEvents: { mountObserver: 'mount' }`
3. **Protocol**: Event source implements a standard interface
4. **Metadata**: Event source has a property indicating event name

**Recommendation**: **Configuration option** for flexibility:
```typescript
assignGingerly(div, {
  '?.mountObserver?.my-element?.@eachTime?.classList?.add': 'highlighted'
}, { 
  withMethods: ['mountObserver', 'add'],
  reactiveEvents: {
    'mountObserver': 'mount'  // When using mountObserver, listen for 'mount' event
  }
});
```

#### Challenge 2: Initial Items

**Problem**: Should `@eachTime` apply to items that already exist?

**Options:**
1. **Yes, always**: Apply to existing + future (most intuitive)
2. **No, only future**: Only new items (simpler implementation)
3. **Configurable**: Let user decide

**Recommendation**: **Yes, always** - Users expect it to work like `@each` plus ongoing updates

#### Challenge 3: Cleanup/Disposal

**Problem**: Event listeners need to be removed to prevent memory leaks

**Options:**
1. **Manual**: User calls `dispose()` method
2. **Automatic**: Use WeakRef/FinalizationRegistry
3. **Lifecycle**: Integrate with existing disposal mechanisms

**Recommendation**: **Integrate with existing lifecycle** - Use the `dispose` lifecycle key:
```typescript
// When target is disposed, clean up subscriptions
if (lifecycleKeys?.dispose) {
  const originalDispose = target[lifecycleKeys.dispose];
  target[lifecycleKeys.dispose] = function() {
    // Clean up reactive subscriptions
    const subs = subscriptions.get(target);
    if (subs) {
      subs.forEach(sub => sub.unsubscribe());
      subscriptions.delete(target);
    }
    // Call original dispose
    if (originalDispose) {
      originalDispose.call(this);
    }
  };
}
```

#### Challenge 4: Async Iterators vs. EventTarget

**Problem**: Generators/async iterators work differently from EventTarget

**Options:**
1. **Support both**: Detect type and handle appropriately
2. **EventTarget only**: Simpler, covers most use cases
3. **Adapter pattern**: Provide adapters to convert between types

**Recommendation**: **Support both** with type detection:
```typescript
function isAsyncIterable(value: any): boolean {
  return value != null && typeof value[Symbol.asyncIterator] === 'function';
}

function isEventTarget(value: any): boolean {
  return value != null && typeof value.addEventListener === 'function';
}

// Then handle each appropriately
if (isEventTarget(source)) {
  // Use addEventListener
} else if (isAsyncIterable(source)) {
  // Use for await...of
  (async () => {
    for await (const item of source) {
      // Apply to item
    }
  })();
}
```

### JSON Serializability

**Good news**: The configuration remains JSON serializable!

```json
{
  "?.mountObserver?.my-element?.@eachTime?.classList?.add": "highlighted"
}
```

The reactive behavior is in the **implementation**, not the configuration. The JSON just declares **what** should happen, not **how** it's implemented.

### Proposed API

```typescript
interface IAssignGingerlyOptions {
  // ... existing options
  
  /**
   * Map of property/method names to event names for reactive iteration
   * Used with @eachTime to know which events to listen for
   */
  reactiveEvents?: Record<string, string>;
  
  /**
   * Lifecycle keys for cleanup
   * When dispose is called, reactive subscriptions are cleaned up
   */
  lifecycleKeys?: {
    dispose?: string | symbol;
    resolved?: string | symbol;
  };
}

// Usage
assignGingerly(div, {
  '?.mountObserver?.my-element?.@eachTime?.classList?.add': 'highlighted',
  '?.querySelectorAll?.div?.@each?.dataset?.id': '123'  // Mix static and reactive
}, { 
  withMethods: ['mountObserver', 'querySelectorAll', 'add'],
  reactiveEvents: {
    'mountObserver': 'mount'
  },
  lifecycleKeys: {
    dispose: 'dispose'
  }
});
```

### Implementation Complexity

**Estimate**: Medium-High

**Why:**
- Event subscription management
- Cleanup/disposal logic
- Support for multiple event source types
- Integration with existing lifecycle
- Testing reactive scenarios

**Recommendation**: 
1. Start with **EventTarget only** (simpler)
2. Add **async iterator support** later if needed
3. Ensure **cleanup is robust** (most critical part)

### Alternative: Separate Function

If you decide a separate function is clearer:

```typescript
assignReactively(div, {
  '?.mountObserver?.my-element?.classList?.add': 'highlighted'
}, {
  withMethods: ['mountObserver', 'add'],
  on: 'mount',  // Simpler: just specify the event
  applyToExisting: true  // Apply to existing items too
});
```

**Pros:**
- Simpler API (no `@eachTime` needed, it's implied)
- Clearer intent (function name says "reactive")
- Easier to add reactive-specific options

**Cons:**
- Two functions to learn
- Can't mix static and reactive in one call
- More API surface area

### Final Recommendation

1. **Syntax**: Use `@eachTime` symbol
2. **Function**: Keep in `assignGingerly` (unified API)
3. **Configuration**: Add `reactiveEvents` option
4. **Cleanup**: Integrate with lifecycle `dispose` key
5. **Start simple**: EventTarget only, add async iterators later
6. **Testing**: Create comprehensive tests for subscription/cleanup

### Example Implementation Sketch

```typescript
// In assignGingerly, after detecting @eachTime:
if (forEachIndex !== -1 && isReactiveForEachSymbol(pathParts[forEachIndex], aliasMap)) {
  const pathToSource = pathParts.slice(0, forEachIndex);
  const pathAfterForEach = pathParts.slice(forEachIndex + 1);
  
  // Navigate to the event source
  let source = target;
  if (pathToSource.length > 0) {
    const result = evaluatePathWithMethods(target, pathToSource, value, withMethodsSet);
    source = result.target;
  }
  
  // Determine event name
  const sourceName = pathToSource[pathToSource.length - 1];
  const eventName = options?.reactiveEvents?.[sourceName] || 'change';
  
  // Apply to existing items (if source provides them)
  // ... implementation depends on source type
  
  // Subscribe to future items
  applyToEachReactively(source, eventName, pathAfterForEach, value, withMethodsSet, aliasMap, options);
  
  continue;
}
```

This is definitely implementable and would be a powerful feature! The key is getting the cleanup/disposal right to avoid memory leaks.

What are your thoughts on this approach?

---

## Human Response I

Let's support EventTargets only for now, I agree, and @eachTime

This package is part of a larger set of standards proposals that includes mount-observer, linked to above.  There could have been a danger that these two packages / polyfill packages / proposal now start to have circular references -- As it is, mount-observer depends on this package, and I don't want to cause npm to explode by making the dependency mutual.

Fortunately, these packages a sharing a common types submodule, "types", inside of which you will find these types:

```TypeScript
export interface IMountObserver extends EventTarget {
    observe(observedNode: Node): Promise<void>;
    disconnect(): void;
    disconnectedSignal: AbortSignal;
    assignGingerly(config: Record<string, any> | undefined): Promise<void>;
    getNotifier(element: Element): EventTarget;
    readonly options: MountObserverOptions;
}

export interface IMountEvent extends Event {
    mountedElement: Element;
    modules: any[];
    mountConfig: MountConfig;
    mountContext: MountContext;
}
```

The name of the eventType corresponding to IMountEvent is "mount" so I think we should assume that.

I think the only method to assume from IMountObserver is "disconnect()", because the rest gets taken care of elsewhere.

The challenge will be how to test it.  I think to avoid circular dependencies, let's not add tests for this feature in this package.  I will add tests in the mount-observer package.

I think maybe as far as cleanup, @eachTime should only be usable if an abort controller's signal is passed in to the third parameter, similar to addEventListener.

Because assignGingerly is fundamentally synchronous, if we add it to assignGingerly, it necessarily  needs to add to the weight of the package.  How many lines of code would this requirement take, based on the understanding above?




---

## Agent Response to Human Feedback

Excellent clarifications! This makes the implementation much clearer and more focused.

### Key Decisions Summary:

1. ✅ **EventTarget only** - No async iterators for now
2. ✅ **@eachTime symbol** - Clear and consistent
3. ✅ **Assume 'mount' event** - Standard convention for IMountObserver
4. ✅ **AbortSignal for cleanup** - Standard web API pattern
5. ✅ **No tests in this package** - Avoid circular dependencies

### Implementation Approach with AbortSignal

Using AbortSignal is brilliant because:
- **Standard web API** - Developers already know it
- **Automatic cleanup** - When signal aborts, listeners are removed
- **No custom disposal** - Leverages built-in browser functionality
- **Composable** - Can share one signal across multiple operations

### Updated API Design

```typescript
interface IAssignGingerlyOptions {
  registry?: typeof EnhancementRegistry | EnhancementRegistry;
  bypassChecks?: boolean;
  withMethods?: string[] | Set<string>;
  aka?: Record<string, string>;
  
  /**
   * AbortSignal for cleaning up reactive subscriptions (@eachTime)
   * When the signal is aborted, all event listeners are removed
   */
  signal?: AbortSignal;
}
```

### Usage Example

```typescript
const controller = new AbortController();

assignGingerly(div, {
  '?.mountObserver?.@eachTime?.classList?.add': 'highlighted'
}, { 
  withMethods: ['add'],
  signal: controller.signal
});

// Later, cleanup all reactive subscriptions
controller.abort();
```

### Implementation Estimate

Based on the requirements, here's the code breakdown:

#### 1. Helper Functions (~15 lines)
```typescript
function isReactiveForEachSymbol(segment: string, aliasMap: Map<string, string>): boolean {
  if (segment === '@eachTime') return true;
  const aliasTarget = aliasMap.get(segment);
  return aliasTarget === '@eachTime';
}

function isEventTarget(value: any): boolean {
  return value != null && typeof value.addEventListener === 'function';
}
```

#### 2. Reactive Application Function (~40 lines)
```typescript
function applyToEachReactively(
  eventTarget: EventTarget,
  remainingPath: string[],
  value: any,
  withMethods: Set<string>,
  aliasMap: Map<string, string>,
  signal: AbortSignal | undefined,
  options?: IAssignGingerlyOptions
): void {
  if (!signal) {
    throw new Error('@eachTime requires an AbortSignal in options.signal for cleanup');
  }
  
  const handler = (event: Event) => {
    // Extract mounted element from IMountEvent
    const mountedElement = (event as any).mountedElement;
    if (!mountedElement) return;
    
    // Apply remaining path to the mounted element
    if (remainingPath.length > 0) {
      const result = evaluatePathWithMethods(mountedElement, remainingPath, value, withMethods);
      
      if (result.isMethod) {
        const method = result.target[result.lastKey];
        if (typeof method === 'function') {
          if (Array.isArray(value)) {
            method.apply(result.target, value);
          } else {
            method.call(result.target, value);
          }
        }
      } else {
        const lastKey = result.lastKey;
        const parent = result.target;
        
        if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          if (lastKey in parent && (isReadonlyProperty(parent, lastKey) || isClassInstance(parent[lastKey]))) {
            const currentValue = parent[lastKey];
            if (typeof currentValue !== 'object' || currentValue === null) {
              throw new Error(`Cannot merge object into ${isReadonlyProperty(parent, lastKey) ? 'readonly ' : ''}primitive property '${String(lastKey)}'`);
            }
            assignGingerly(currentValue, value, options);
          } else {
            parent[lastKey] = value;
          }
        } else {
          parent[lastKey] = value;
        }
      }
    }
  };
  
  // Use AbortSignal for automatic cleanup
  eventTarget.addEventListener('mount', handler, { signal });
}
```

#### 3. Integration in assignGingerly (~25 lines)
```typescript
// In the nested path handling section, after detecting @each:
if (forEachIndex !== -1) {
  const pathToForEach = pathParts.slice(0, forEachIndex);
  const pathAfterForEach = pathParts.slice(forEachIndex + 1);
  
  // Check if it's reactive (@eachTime)
  const isReactive = isReactiveForEachSymbol(pathParts[forEachIndex], aliasMap);
  
  // Navigate to the source
  let current = target;
  if (pathToForEach.length > 0) {
    if (withMethodsSet) {
      const result = evaluatePathWithMethods(target, pathToForEach, value, withMethodsSet);
      current = result.target;
    } else {
      for (const part of pathToForEach) {
        current = current[part];
      }
    }
  }
  
  if (isReactive) {
    // Reactive forEach - subscribe to events
    if (!isEventTarget(current)) {
      throw new Error('@eachTime requires an EventTarget');
    }
    applyToEachReactively(current, pathAfterForEach, value, withMethodsSet || new Set(), aliasMap, options?.signal, options);
  } else {
    // Static forEach - existing logic
    if (isIterable(current)) {
      applyToEach(current, pathAfterForEach, value, withMethodsSet || new Set(), aliasMap, options);
    }
  }
  
  continue;
}
```

#### 4. Type Definition Update (~5 lines)
```typescript
// In types/assign-gingerly/types.d.ts
export interface IAssignGingerlyOptions {
  // ... existing options
  signal?: AbortSignal;
}
```

### Total Lines of Code: ~85 lines

**Breakdown:**
- Helper functions: ~15 lines
- Reactive application: ~40 lines
- Integration logic: ~25 lines
- Type definitions: ~5 lines

**Plus:**
- Comments/documentation: ~15 lines
- **Total with comments: ~100 lines**

### Weight Impact

**Current assignGingerly.ts**: ~900 lines  
**After adding @eachTime**: ~1000 lines  
**Increase**: ~11% (100 lines)

This is reasonable for the functionality gained, especially since:
- It's opt-in (only used when `@eachTime` is present)
- No external dependencies
- Leverages standard web APIs (AbortSignal)
- Clean separation from existing code

### Implementation Notes

1. **Error Handling**: Throw clear error if `signal` is missing when `@eachTime` is used
2. **Event Name**: Hardcode 'mount' for IMountObserver (as you specified)
3. **Event Detail**: Extract `mountedElement` from IMountEvent
4. **No Circular Dependency**: Only uses types, not runtime imports
5. **Testing**: Deferred to mount-observer package

### Potential Optimizations

If you want to reduce code size further:

1. **Lazy Loading** (~50 lines saved):
   ```typescript
   // Only load reactive logic when @eachTime is encountered
   const { applyToEachReactively } = await import('./reactiveHelpers.js');
   ```
   But this adds async complexity.

2. **Shared Logic** (~10 lines saved):
   Reuse more code between `applyToEach` and `applyToEachReactively`

3. **Minimal Error Checking** (~5 lines saved):
   Trust that users provide correct inputs

**Recommendation**: Keep it simple and inline (~100 lines total). The code is straightforward and the weight increase is justified.

### Alternative: Separate Package

If 100 lines feels too heavy for assignGingerly:

**Option**: Create `assign-gingerly-reactive` package
- Extends assignGingerly with `@eachTime` support
- ~150 lines total (includes wrapper)
- Users opt-in by importing the extended version
- No weight impact on base package

```typescript
// assign-gingerly-reactive/index.ts
import { assignGingerly as base } from 'assign-gingerly';

export function assignGingerly(target, source, options) {
  // Add @eachTime support
  // Delegate to base for everything else
}
```

**Pros:**
- Zero weight impact on base package
- Clear opt-in for reactive features
- Can evolve independently

**Cons:**
- Another package to maintain
- Users need to know about it
- Slightly more complex import

### My Recommendation

**Keep it in assignGingerly** (~100 lines):
- 11% increase is reasonable
- Feature is opt-in (no cost if not used)
- Simpler for users (one package)
- Natural extension of `@each`
- Standard web APIs (no dependencies)

The implementation is clean, focused, and leverages AbortSignal perfectly. The weight increase is justified by the powerful reactive capability it enables.

### Next Steps

If you agree with this approach:
1. I can implement the ~100 lines
2. Update type definitions
3. Add documentation to README
4. You handle testing in mount-observer package

What do you think?

---

## Human Response II

The weight isn't bad at all, it is quite good, and is quite viable.  But I was thinking about the dilemma further, and I'm thinking it kind of makes sense to make support for @eachTime the exception to the rule, where the rule in this case is keep assign-gingerly synchronous. Since the assignment will happen sporadically, I'm thinking the developer will need to understand that this feature is by its very nature more asynchronous.  So most of the code could be moved out of assign-gingerly as much as possible in support of @eachTime -- say to eachTime.ts and if we conditionally encounter this directive, spawn an asynchronous fire nd forget type process that dynamically loads the library and passes the needed context.  If we did that, how much of a dent would make in reducing the 100 lines of code?
