# Support for Asynchronous Spawning, Part I

---

## Human Ask

"Pass props down, pass events up" is an old mantra of web components / custom elements, which I believe still covers a large pattern of web developement across frameworks.  Method calls are relatively rare.  Granted in our example, PhotoTaker may very well support a "takePhoto()" method, but even here, this could be done via passing a property value instead.

So hopefully this idea doesn't seem too wild.

## Sketch of the proposal:

1.  Allow spawn and fallbackSpawn to specify an asynchronous / promise returning function.

2.  If the spawn is asynchronous, initialize an empty object {} while waiting if nothing is in storage yet, and store that in storage and return that.  

3.  In a separate asynchronous process, import the constructor, and replace the spawn property with the actual constructor once done.  

4.  Keep returning the (modified) object as long as the spawn is still an asynchronous function rather than a constructor.

5.  If the spawn is a constructor, but the thing in object isn't an instance of it, instantiate the class and pass in the initVals that is in storage, and replace what is in storage with the instance.





---

## Kiro's Comments

This is clever. You're essentially saying: "the getter always returns *something* synchronously — initially a plain object that accumulates properties via assignGingerly merges, and eventually the real instance that absorbs those accumulated properties." The consumer never sees a Promise, never awaits, never knows the difference. The object reference stays stable.

Let me walk through the lifecycle to make sure I understand:

### Timeline

```
T0: assignFeatures(ClubMember, { photoTaker: { spawn: () => import('./photo-taker.js').then(m => m.PhotoTakerImpl) } })
T1: const el = document.createElement('club-member');
T2: assignGingerly(el, { photoTaker: { someProp: 'hello' } })
    → getter fires
    → spawn is a function (not a constructor), so:
      - create {} as placeholder, store in featureStorage
      - kick off the async resolution (spawn().then(...))
      - return the {} placeholder
    → assignGingerly merges { someProp: 'hello' } into the {} placeholder
T3: el.photoTaker.someProp  // 'hello' — it's on the placeholder object
T4: async resolution completes — spawn is now PhotoTakerImpl (a constructor)
    → but we don't instantiate yet (step 4 says keep returning the object)
T5: el.photoTaker
    → getter fires
    → spawn is now a constructor
    → thing in storage is {} (not an instance of PhotoTakerImpl)
    → instantiate: new PhotoTakerImpl(el, ctx, storedObject)
    → storedObject becomes initVals — the accumulated { someProp: 'hello' }
    → replace storage with the real instance
    → return the real instance
T6: el.photoTaker.someProp  // 'hello' — now on the real instance (via initVals)
```

### Questions and observations

#### 1. Object reference stability

At T2, assignGingerly returns a reference to the placeholder `{}`. If the consumer holds onto that reference:

```javascript
const photo = el.photoTaker; // placeholder {}
// ... later, after async resolves ...
el.photoTaker; // now the real instance (different object!)
photo === el.photoTaker; // false!
```

Is this acceptable? The reference changes between T4 and T5. Code that cached `el.photoTaker` before resolution holds a stale reference. This is probably fine for the "pass props down" pattern (you always go through `el.photoTaker.someProp`), but worth documenting.

#### 2. When does the swap happen?

Step 4 says "keep returning the (modified) object as long as the spawn is still an asynchronous function." Step 5 says "if the spawn is a constructor, but the thing in storage isn't an instance of it, instantiate."

So the swap from placeholder → real instance happens on the **next getter access after the async resolution completes**. The getter is the trigger. If nobody accesses the property after resolution, the placeholder stays indefinitely. That's fine — lazy all the way.

#### 3. Where does the resolved constructor get stored?

The async function resolves to a constructor. Where does it go? Options:

- **(A)** Mutate the `injection` object in the registry: `injection.spawn = ResolvedClass`. Then the getter checks `typeof injection.spawn` — if it's a function with a prototype (constructor), proceed to instantiate.
- **(B)** Store the resolved constructor in a separate map (e.g., on the `featureStorage` entry alongside the placeholder).

I'd lean toward **(A)** — mutate `injection.spawn` in place. It's simple, and the registry is already keyed by constructor + feature key. The getter already reads `injection.spawn`, so it naturally picks up the resolved value on next access.

#### 4. How to distinguish "async function" from "constructor"

Both are `typeof === 'function'`. The distinction:

- A constructor has a `.prototype` with a non-trivial shape (or at minimum, `spawn.prototype !== undefined` and it's not an arrow function).
- An async function (or arrow function returning a Promise) has no meaningful `.prototype`.

The simplest heuristic: check if `spawn.prototype` exists and is not `undefined`. Arrow functions and async functions don't have `.prototype`. Class constructors and `function` declarations do.

```javascript
function isConstructor(fn) {
    return typeof fn === 'function' && fn.prototype !== undefined;
}
```

This isn't bulletproof (a regular function also has `.prototype`), but for this use case it's sufficient — developers will pass either a class or an `() => import(...)` arrow function.

Alternatively, you could require a wrapper: `{ spawn: { async: () => import(...) } }` vs `{ spawn: PhotoTakerImpl }`. More explicit, no heuristic needed. But less ergonomic.

#### 5. Error handling

What if the async import fails (network error, module not found)?

- Should the placeholder stay forever (silent failure)?
- Should subsequent getter accesses throw?
- Should there be a rejection handler that marks the feature as failed?

I'd suggest: catch the rejection, store an error state, and throw on next getter access with a descriptive message. The placeholder object remains accessible (it has accumulated properties), but the feature is marked as "failed to load."

#### 6. The initVals handoff

At step 5, the placeholder object (which has accumulated properties from assignGingerly merges) becomes the `initVals` passed to the constructor. The constructor is responsible for absorbing them (e.g., `Object.assign(this, initVals)`).

This is elegant — it's the same `initVals` pattern we already have from Part II. The only difference is that `initVals` here is a "live" object that was mutated over time, rather than a snapshot captured at upgrade time.

#### 7. Proposed implementation sketch

```typescript
// In the getter:
if (!storage.has(key)) {
    // ... resolve injection, optIn, SpawnClass as before ...

    if (isConstructor(SpawnClass)) {
        // Synchronous path (existing behavior)
        const instance = new SpawnClass(this, ctx, initVals);
        // ... validate, store, return ...
    } else {
        // Async path: SpawnClass is a function that returns Promise<Constructor>
        const placeholder = initVals && typeof initVals === 'object' ? initVals : {};
        storage.set(key, placeholder);

        // Kick off async resolution
        SpawnClass().then((ResolvedClass: any) => {
            // Mutate the injection so the getter picks it up on next access
            injection.spawn = ResolvedClass;
        }).catch((err: any) => {
            // Store error state for the getter to throw on next access
            storage.set(key, { __featureError: err });
        });

        return placeholder;
    }
} else {
    const stored = storage.get(key);

    // Check for error state
    if (stored && stored.__featureError) {
        throw new Error(`assignFeatures: async spawn for "${key}" failed: ${stored.__featureError.message}`);
    }

    // Check if spawn has been resolved and stored value needs upgrading
    const SpawnClass = injection.spawn || optIn.fallbackSpawn;
    if (isConstructor(SpawnClass) && !(stored instanceof SpawnClass)) {
        // Swap: instantiate with the placeholder as initVals
        const instance = new SpawnClass(this, ctx, stored);
        if (optIn.validateShape && !optIn.validateShape(instance)) {
            throw new Error(`assignFeatures: spawned instance for "${key}" failed shape validation`);
        }
        storage.set(key, instance);
        return instance;
    }

    return stored;
}
```

#### 8. One concern: the "already stored" fast path

The current getter has a fast path: if `storage.has(key)` and it's not a raw sentinel, return it immediately. With async spawn, we need to check on *every* access whether the stored value needs upgrading (placeholder → real instance). This adds a small cost to every getter call even after the instance is fully resolved.

Once the real instance is stored, `stored instanceof SpawnClass` will be `true`, so the check short-circuits quickly. The overhead is one `instanceof` check per access — negligible.

### Summary

The proposal is sound. It preserves the synchronous getter contract, uses the existing initVals mechanism for the handoff, and the "pass props down" pattern works transparently during the async loading window. The main things to nail down:

1. Constructor detection heuristic (I suggest `fn.prototype !== undefined`).
2. Error handling strategy (I suggest throw-on-next-access).
3. Document the reference instability (placeholder !== final instance).
4. Decide whether to mutate `injection.spawn` in place or use a separate resolved-class store.

Ready to implement when you confirm the approach.

---

## Human Response I

The Timeline:

Corrected below (if possible to implement):

```
T0: assignFeatures(ClubMember, { photoTaker: { spawn: () => import('./photo-taker.js').then(m => m.PhotoTakerImpl) } })
T1: const el = document.createElement('club-member');
T2: assignGingerly(el, { photoTaker: { someProp: 'hello' } })
    → getter fires
    → spawn is a function (not a constructor), so:
      - create {} as placeholder, store in featureStorage
      - kick off the async resolution (spawn().then(...))
      - return the {} placeholder
    → assignGingerly merges { someProp: 'hello' } into the {} placeholder
T3: el.photoTaker.someProp  // 'hello' — it's on the placeholder object
T4: async resolution completes — spawn is now PhotoTakerImpl (a constructor)
    → but we don't instantiate yet (step 4 says keep returning the object)
T5: without waiting for getter to fire:
    → thing in storage is {} (not an instance of PhotoTakerImpl)
    → instantiate: new PhotoTakerImpl(el, ctx, storedObject)
    → storedObject becomes initVals — the accumulated { someProp: 'hello' }
    → replace storage with the real instance
T6: el.photoTaker
    → getter fires
    → spawn is now a constructor
    → thing in storage is now an instance of the constructor
    → return the real instance from storage
T6: el.photoTaker.someProp  // 'hello' — now on the real instance (via initVals)
```

#### 1. Object reference stability

You raise a really good point.  The same point could be raised with what we've already implemented, where properties get passed to the field of the unknown element during hydration / framework passing, prior to the custom element upgrading.

Nevertheless, we might be able, with a future implementation, instead of returning {}, return an event target, so developers could do:

```JavaScript
let photo = el.photoTaker;
if(photo.isPlaceHolderObject){
    photo.addEventListener(e => {
        photo = e.upgradedProp;
    })
}
```


#### 2. When does the swap happen?

See updated timeline

#### 3. Where does the resolved constructor get stored?

We're on the same page:  A.

#### 4. How to distinguish "async function" from "constructor"

I did a search for this:

```JavaScript
/**
 * Checks if a given function is declared as async.
 * @param {Function} fn - The function to check.
 * @returns {boolean} - True if async, false otherwise.
 */
function isAsyncFunction(fn) {
    if (typeof fn !== 'function') {
        throw new TypeError('Expected a function');
    }
    return fn.constructor.name === 'AsyncFunction';
}
```

#### 5. Error handling

If the network request fails, let the user see the naturally thrown error from the browser, and yes, the placeholder stays forever.  

I like the idea of subsequent getter accesses throwing an error.  Can you pass the placeholder in the error object or is that not allowed.


---

## Kiro's Response I

Good — the updated timeline is clearer and better. Instantiating immediately when the async resolves (rather than waiting for the next getter call) is a stronger design. It means by the time anyone accesses the property after resolution, the real instance is already there. No "one more access needed" awkwardness.

Let me respond to each point:

### On the timeline (T4→T5 happening without getter)

This means the `.then()` callback does the instantiation itself:

```javascript
SpawnClass().then((ResolvedClass) => {
    const stored = storage.get(key);
    const instance = new ResolvedClass(hostElement, ctx, stored);
    // validate if needed
    storage.set(key, instance);
    injection.spawn = ResolvedClass;
});
```

One subtlety: we need to capture `hostElement` (the `this` from the getter) in the closure so the `.then()` callback can pass it to the constructor. That's fine — closures handle this naturally.

### On #1 — reference stability and future EventTarget placeholder

Makes sense as a future enhancement. For now, `{}` is fine. The EventTarget placeholder idea is nice — it would let consumers subscribe to the "upgrade" moment. We can add that later without breaking the `{}` path (just make the placeholder an EventTarget subclass instead of a bare object).

### On #4 — `AsyncFunction` constructor check

That works for `async function` declarations and `async () => {}` arrows. But it does NOT catch a regular (non-async) function that returns a Promise:

```javascript
// This is NOT an AsyncFunction — it's a regular function returning a Promise
const spawn = () => import('./photo-taker.js').then(m => m.PhotoTakerImpl);
spawn.constructor.name; // 'Function', not 'AsyncFunction'
```

The `() => import(...)` pattern (which is the most common lazy-loading pattern) is a regular arrow function, not an `async` function. So `fn.constructor.name === 'AsyncFunction'` would miss it.

I think we need a combined check:

```javascript
function isAsyncSpawn(fn) {
    if (typeof fn !== 'function') return false;
    // Explicit async function
    if (fn.constructor.name === 'AsyncFunction') return true;
    // Arrow function or regular function without .prototype (not a class/constructor)
    // Classes always have fn.prototype as a non-undefined object
    if (fn.prototype === undefined) return true;
    return false;
}
```

The logic: if it has no `.prototype`, it's an arrow function (which can't be a constructor). If it's an `AsyncFunction`, it's explicitly async. Everything else (classes, `function` declarations) is treated as a constructor.

This covers:
- `async () => import(...)` → AsyncFunction ✓
- `() => import(...).then(...)` → arrow, no `.prototype` ✓
- `class PhotoTaker {}` → has `.prototype` → constructor ✓
- `function PhotoTaker() {}` → has `.prototype` → constructor ✓

The one edge case: a regular `function` that returns a Promise and is intended as an async spawner. But that's an unusual pattern — developers will use arrows or `async` for this. We can document it.

### On #5 — error handling and passing the placeholder

Yes, you can absolutely attach the placeholder to the error object:

```javascript
SpawnClass().catch((err) => {
    const error = new Error(`assignFeatures: async spawn for "${key}" failed: ${err.message}`);
    error.placeholder = storage.get(key); // the accumulated object
    error.cause = err; // standard Error.cause for chaining
    storage.set(key, { __featureError: error });
});

// Then in the getter:
if (stored && stored.__featureError) {
    throw stored.__featureError; // error.placeholder is accessible in catch blocks
}
```

Consumers can then:

```javascript
try {
    el.photoTaker;
} catch (e) {
    console.log(e.placeholder); // { someProp: 'hello' } — the accumulated data
    console.log(e.cause);       // the original network/import error
}
```

This is valid — custom properties on Error objects are a standard pattern. `Error.cause` is also well-supported (ES2022+).

### Implementation plan

1. Add `isAsyncSpawn(fn)` helper.
2. In the getter's "first access" path: if `isAsyncSpawn(SpawnClass)`, create placeholder, store it, kick off resolution, return placeholder.
3. In the `.then()` callback: instantiate the real class with the placeholder as `initVals`, replace in storage, update `injection.spawn`.
4. In the `.catch()` callback: store error state with placeholder attached.
5. In the getter's "already stored" path: check for `__featureError` and throw if present. Otherwise return stored value (which is either the placeholder pre-resolution or the real instance post-resolution).
6. The `instanceof` check from my earlier sketch is no longer needed in the getter — the `.then()` callback handles the swap proactively.

Shall I implement?
