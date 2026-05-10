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