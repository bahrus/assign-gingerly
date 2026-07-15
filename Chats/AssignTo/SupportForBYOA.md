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




---

## Kiro's Response I

### 1. Naming: `assignTo` vs `assignFrom` vs something else

Let me think about the semantics from the caller's perspective:

- `assignGingerly(target, { myProp: value })` — we're assigning *to* `target.myProp`.
- When the hook fires, we're saying "hey `MyClass`, someone is assigning *to* your instance."

So **`assignTo`** reads as: "this is how you assign *to* an instance of this class." The subject is the caller (assignGingerly), the action is assigning *to* the instance. ✓

**`assignFrom`** would read as: "this is how the instance assigns *from* the incoming value." The subject is the instance, the action is pulling *from* the RHS. Also valid, but slightly less intuitive since the static method is on the class, not the instance.

Other options:
- **`onAssign`** — event-like naming. "When assignment happens to an instance of this class, do this."
- **`handleAssign`** — similar to event handler naming.
- **`mergeInto`** — "merge the RHS into an instance of this class."

**My recommendation: `assignTo`** — it's the most natural reading in context. "How to assign to this class." It also pairs nicely with the existing `assignGingerly` / `assignFrom` function names in the package without conflicting (those are standalone functions, this is a static method protocol).

### 2. Private field access in static methods

**Yes, this is true.** Static methods of a class *can* access private fields of instances of that class. This is by design in the JavaScript/TypeScript spec:

```javascript
class MyClass {
    #myPrivateField = 'hello';
    static assignTo(instance) {
        console.log(instance.#myPrivateField); // ✅ Works! Logs 'hello'
    }
}
```

This works because private field access is scoped to the *class body* (the lexical scope where `#myPrivateField` is declared), not to the instance. Static methods are defined in the same class body, so they have access.

This is the same reason `getSharedContext` works for sharing private data with features — it's defined in the class body and receives the instance as a parameter.

So `assignTo` gets full access to private fields, which makes it even more powerful — it can implement custom merge logic that reads/writes private state that external code can't touch.

---

## Human Response II

I will add another use case:

Classes that have standard properties, but also are iterable over a list stored in a private variable, and no "list" property to access it / set it.  If the rhs is an array, we want to replace the private list with a (filtered) copy of the rhs.  If the rhs is a non array object, we just want to merge it in.

This I think is what I was looking for with my murky thoughtExperiments/SupportForGeneratorIteratorBrainStorming.md and thoughtExperiments/SupportIteratorUpgrade.md, both of which you found too vague to function.  Does that make sense?

If we are on the same page, please implement (with your very helpful `Object.hasOwn(constructor, 'assignTo')` guard suggestion).  Please keep these use cases in mind when documenting the feature in README.md
