# Support for bring your own assigner

---

## Human Ask

assignGingerly.ts, lines 622 - 637 currently looks like:

```Typescript
// Normal assignment
const lastKey = result.lastKey;
const parent = result.target;

if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    if (lastKey in parent && isReadonlyProperty(parent, lastKey)) {
    const currentValue = parent[lastKey];
    if (typeof currentValue !== 'object' || currentValue === null) {
        throw new Error(`Cannot merge object into readonly primitive property '${String(lastKey)}'`);
    }
    assignGingerly(currentValue, value, options);
    } else {
    parent[lastKey] = value;
    }
} else {
    parent[lastKey] = value;
}
```

Codewise, what this proposal is advocating is modifying it to:

```Typescript
// Normal assignment
const lastKey = result.lastKey;
const parent = result.target;
const currentValue = parent[lastKey];
if(typeof currentValue === 'object'){
    const {constructor} = currentValue;
    if(constructor && typeof(constructor.assignTo) === 'function'){
        constructor.assignTo(currentValue, value, parent, lastKey);
        continue;
    }
}
if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    if (lastKey in parent && isReadonlyProperty(parent, lastKey)) {
    
    if (typeof currentValue !== 'object' || currentValue === null) {
        throw new Error(`Cannot merge object into readonly primitive property '${String(lastKey)}'`);
    }
    assignGingerly(currentValue, value, options);
    } else {
    parent[lastKey] = value;
    }
} else {
    parent[lastKey] = value;
}
```

The intention here is to look for static methods on a class:

```JavaScript
class MyClass {
    static assignTo(instance: MyClass, rhs: any, parent?: any, key: string){
        ...
    }
}
```


Before I try to articulate the use cases I see for this, please let me know:

1.  Would the code change I suggest ever hit MyClass's assignTo?  I.e. does my code make sense?
2.  If so, what use cases do you see for this?  


---

## Kiro's Comments

### 1. Would the code change hit `MyClass.assignTo`?

**Yes, it would work.** Here's the chain:

```javascript
const currentValue = parent[lastKey]; // e.g., an instance of MyClass
const { constructor } = currentValue; // MyClass (the class itself)
constructor.assignTo // MyClass.assignTo (the static method)
```

`instance.constructor` gives you the class that created the instance. Static methods live on the class. So `currentValue.constructor.assignTo` correctly resolves to `MyClass.assignTo`. The code makes sense.

One edge case: if `currentValue` is a plain object (`{}`), its constructor is `Object`. If someone defines `Object.assignTo`, it would intercept *all* plain object assignments. That's probably not desired. You might want to guard against built-in constructors:

```javascript
if (constructor && constructor !== Object && constructor !== Array && typeof constructor.assignTo === 'function') {
```

Or more simply — only check if the constructor has its *own* `assignTo` (not inherited):

```javascript
if (constructor && Object.hasOwn(constructor, 'assignTo') && typeof constructor.assignTo === 'function') {
```

This ensures only classes that explicitly define `assignTo` get the hook.

### 2. Use cases I see

**A. Custom merge strategies for domain objects**

A class that knows how to merge itself better than `Object.assign` or recursive `assignGingerly`:

```javascript
class ImmutableState {
    #data;
    static assignTo(instance, rhs, parent, key) {
        // Instead of mutating, create a new immutable instance
        parent[key] = new ImmutableState({ ...instance.#data, ...rhs });
    }
}
```

**B. Observable/reactive objects**

A class that needs to trigger change notifications when properties are assigned:

```javascript
class ReactiveModel {
    static assignTo(instance, rhs) {
        for (const [k, v] of Object.entries(rhs)) {
            instance.set(k, v); // triggers observers
        }
    }
}
```

Without `assignTo`, `assignGingerly` would do `Object.assign` or recursive merge, bypassing the reactive setters.

**C. Validation on assignment**

A class that validates incoming data before accepting it:

```javascript
class TypedRecord {
    static schema = { name: 'string', age: 'number' };
    static assignTo(instance, rhs) {
        for (const [k, v] of Object.entries(rhs)) {
            if (typeof v !== TypedRecord.schema[k]) {
                throw new TypeError(`${k} must be ${TypedRecord.schema[k]}`);
            }
            instance[k] = v;
        }
    }
}
```

**D. Feature instances that want control over how assignGingerly merges into them**

This connects directly to the custom element features work. A feature class could define `assignTo` to control how properties are merged when someone does:

```javascript
assignGingerly(el, { photoTaker: { someProp: 'hello' } });
```

Currently this merges via `assignGingerly(featureInstance, { someProp: 'hello' })`. With `assignTo`, the feature class could intercept and handle it differently (e.g., queue changes, validate, transform).

**E. Proxy-like behavior without Proxy**

Classes that want to intercept assignment without the overhead/complexity of a Proxy:

```javascript
class LazyLoader {
    static assignTo(instance, rhs) {
        // Trigger load if not loaded, then assign
        if (!instance._loaded) instance._load();
        Object.assign(instance, rhs);
    }
}
```

### 3. One concern: the `parent` and `key` parameters

Passing `parent` and `key` to `assignTo` gives the static method the power to *replace* the instance entirely (`parent[key] = newInstance`). This is powerful (use case A above) but also dangerous — it breaks reference stability. Code holding a reference to the old instance won't see the replacement.

Worth documenting clearly: "If `assignTo` replaces `parent[key]`, existing references to the old value become stale."

### Summary

The code works as intended. The pattern is essentially a "static protocol" — any class can opt into custom assignment behavior by defining `static assignTo`. It's lightweight (one `typeof` check per assignment to a class instance), non-breaking (only activates for classes that explicitly opt in), and opens up useful patterns for reactive models, immutable data, validation, and feature classes.

I'd add the `Object.hasOwn(constructor, 'assignTo')` guard to prevent accidental inheritance from `Object` or other base classes.

---

## Human Response I

Good suggestions, good use cases. 

Two additional questions:

1.  What do you think of the name?  Should it be assignTo or assignFrom?  Or something else?

2.  Is it true or not true that the static method would have access to the private fields:

```JavaScript
class MyClass {
    #myPrivateField = 'hello';
    static assignTo(instance: MyClass, rhs: any, parent?: any, key: string){
        console.log(instance.#myPrivateField);
    }
}
```


