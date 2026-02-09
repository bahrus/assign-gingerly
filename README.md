# assign-gingerly and assign-tentatively

[![Playwright Tests](https://github.com/bahrus/assign-gingerly/actions/workflows/CI.yml/badge.svg?branch=baseline)](https://github.com/bahrus/assign-gingerly/actions/workflows/CI.yml)
[![NPM version](https://badge.fury.io/js/assign-gingerly.png)](http://badge.fury.io/js/assign-gingerly)
[![How big is this package in your project?](https://img.shields.io/bundlephobia/minzip/assign-gingerly?style=for-the-badge)](https://bundlephobia.com/result?p=assign-gingerly)
<img src="http://img.badgesize.io/https://cdn.jsdelivr.net/npm/assign-gingerly?compression=gzip">

This package provides two utility functions for carefully merging one object into another.

## assignGingerly

assignGingerly builds on Object.assign.  assign-gingerly adds support for:

1.  Carefully merging in nested properties.
2.  Dependency injection based on a mapping protocol.

## Example 1 - assignGingerly is mostly a "superset" of Object.assign:

```TypeScript
const sourceObj = {hello: 'world'};
assignGingerly(sourceObj, {hello: 'Venus', foo: 'bar'});
// Because none of the keys of the second parameter start with "?.", 
// nor includes any symbols keys,
// assign gingerly produces identical results as Object.assign:
console.log(sourceObj);
//{hello: 'Venus', foo: 'bar'}
```

## Example 2 Merging into an existing sub object

```html
<body>
    <input id=myInput>
</body>
```

```TypeScript
const oInput = document.querySelector('#myInput');
assignGingerly(oInput, {'?.style?.height': '15px'});
console.log(oInput.style.height);
// 15px
```

This can go many levels deep.

## Example 3 Deeply nested

```TypeScript
const obj = {};
assignGingerly(obj, {
    '?.style?.height': '15px',
    '?.a?.b?.c': {
        d: 'hello',
        e: 'world'
    }
});
console.log(obj);
// {
//   a: {b: c: {d: 'hello', e: 'world'}},
//   style: {height: '15px'}
// }
```

When the right hand side of an expression is an object, assignGingerly is recursively applied (passing the third argument in if applicable, which will be discussed below) 

## Example 4 - Incrementing values with !inc command

The `!inc` command allows you to increment numeric values:

```TypeScript
const obj = {
    a: {
        b: {
            c: 2
        }
    }
};
assignGingerly(obj, {
    '!inc ?.a?.b?.c': 3,
    '!inc ?.a?.d?.e': -2
});
console.log(obj);
// {
//   a: {
//     b: { c: 5 },      // 2 + 3 = 5
//     d: { e: -2 }      // non-existent path created with value -2
//   }
// }
```

The `!inc` command syntax is `!inc <path>` where the path can use the `?.` nested notation. The right-hand side value is added to the existing value using `+=`. If the path doesn't exist, it's created and set directly to the value. Non-numeric increments will allow JavaScript to throw its natural error.

## Example 5 - Toggling boolean values with !toggle command

The `!toggle` command allows you to toggle boolean values either immediately or after a delay:

```TypeScript
const obj = {
    a: {
        b: {
            c: true
        }
    }
};
assignGingerly(obj, {
    '!toggle ?.a?.b?.c': 0,      // Toggle immediately
    '!toggle ?.a?.d?.e': 20      // Toggle after 20ms
});
console.log(obj);
// {
//   a: {
//     b: { c: false }           // Toggled immediately
//     // d doesn't exist yet
//   }
// }

setTimeout(() => {
    console.log(obj);
    // {
    //   a: {
    //     b: { c: false },
    //     d: { e: true }         // Created and toggled after 20ms
    //   }
    // }
}, 40);
```

The `!toggle` command syntax is `!toggle <path>` where the path can use the `?.` nested notation. The right-hand side value determines the behavior:
- **RHS = 0**: Toggle the existing value immediately (non-existent paths are not created)
- **RHS > 0**: Schedule the toggle to happen after N milliseconds (non-existent paths are created and initialized to `true`)

For existing values, the toggle is performed using JavaScript's logical NOT operator (`!value`). Non-numeric delay values will be passed to `setTimeout` and may throw an error.

## Example 6 - Deleting properties with !delete command

The `!delete` command allows you to delete properties either immediately or after a delay:

```TypeScript
const obj = {
    a: {
        b: {
            c: true,
            d: 'hello'
        }
    }
};
assignGingerly(obj, {
    '!delete ?.a?.b?.c': 0,      // Delete immediately
    '!delete ?.a?.b': 20         // Delete after 20ms
});
console.log(obj);
// {
//   a: {
//     b: { d: 'hello' }          // c deleted immediately
//   }
// }

setTimeout(() => {
    console.log(obj);
    // {
    //   a: {}                     // b deleted after 20ms
    // }
}, 40);
```

The `!delete` command syntax is `!delete <path>` where the path can use the `?.` nested notation. The right-hand side value determines the behavior:
- **RHS = 0**: Delete the final property immediately (non-existent paths are silently skipped)
- **RHS > 0**: Schedule the deletion to happen after N milliseconds (non-existent paths are silently skipped)

**Important**: The `!delete` command only deletes the **final property** in the path. The entire nested chain is not deleted. For example, `'!delete ?.a?.b?.c': 0` only deletes property `c`, leaving the structure `a.b` intact. If any intermediate path doesn't exist, the command is silently skipped without error.

## Example 7 - Reversible assignments with assignTentatively

The `assignTentatively` function works like `assignGingerly` but with a powerful addition: **reversibility**. It tracks changes and generates a reversal object that can undo all modifications:

```TypeScript
import assignTentatively from 'assign-gingerly/assignTentatively';

const obj = { f: { g: 'hello' } };
const reversal = {};

assignTentatively(obj, {
    '?.style?.height': '15px',
    '?.a?.b?.c': {
        d: 'hello',
        e: 'world'
    },
    '?.f?.g': 'bye'
}, { reversal });

console.log(obj);
// {
//   f: { g: 'bye' },
//   style: { height: '15px' },
//   a: { b: { c: { d: 'hello', e: 'world' } } }
// }

console.log(reversal);
// {
//   '!delete ?.a': 0,
//   '!delete ?.style': 0,
//   '?.f?.g': 'hello'
// }

// Later, restore to original state:
assignTentatively(obj, reversal);
console.log(obj);
// {
//   f: { g: 'hello' }
// }
```

**Key differences from assignGingerly:**
- **No setTimeout support**: All `!toggle`, `!inc`, and `!delete` commands execute immediately, regardless of the RHS value
- **No registry/DI support**: Dependency injection features are not available (pass it in and it will be ignored)
- **Reversal tracking**: Maintains a reversal object that records:
  - **Original values** of modified existing properties
  - **!delete commands** for newly created top-level paths (e.g., `!delete ?.a` for paths created under `a`)
  - **Original values** for deleted properties

**Reversal guarantee:**
```JavaScript
const reversal = {};
const obj = {...originalObj};
const string1 = JSON.stringify(obj);

assignTentatively(obj, sourceChanges, { reversal });
assignTentatively(obj, reversal);

const string2 = JSON.stringify(obj);
console.log(string1 === string2); // true
```

This guarantees that applying the reversal object restores the object to its exact original state.

## Dependency injection based on a registry object and a Symbolic reference

```Typescript
interface IBaseRegistryItem<T = any> {
    spawn: {new(): T} | Promise<{new(): T}>
    map: {[key: string | symbol]: keyof T}
}

export const isHappy = Symbol.for('TFWsx0YH5E6eSfhE7zfLxA');
class MyEnhancement extends ElementEnhancement(EventTarget){
    get isHappy(){}
    set isHappy(nv){}
}

export const isMellow = Symbol.for('BqnnTPWRHkWdVGWcGQoAiw');
class YourEnhancement extends ElementEnhancement(EventTarget){
    get isMellow(){}
    set isMellow(nv){}
    get madAboutFourteen(){}
    set madAboutFourteen(nv){}
}

class BaseRegistry{
    push(IBaseRegistryItem | IBaseRegistryItem[]){
        ...
    }
}

//Here's where the dependency injection mapping takes place
const baseRegistry = new BaseRegistry;
baseRegistry.push([
    {
        map: {
            [isHappy]: 'isHappy'
        },
        spawn: MyEnhancement,
    },{
       
       map: {
           [isMellow]: 'isMellow'
       },
       spawn: YourEnhancement,
    }
]);
//end of dependency injection

const result = assignGingerly({}, {
    [isHappy]: true,
    [isMellow]: true,
    '?.style.height': '40px',
    '?.enh?.mellowYellow?.madAboutFourteen': true
}, {
    registry: BaseRegistry
});
result.set[isMellow] = false;
```

The assignGingerly searches the registry for any items that has a mapping with a matching symbol of isHappy and isMellow, and if found, sees if it already has an instance of the spawn class associated with the first passed in parameter.  If no such instance is found, it instantiates one, associates the instance with the first parameter, then sets the property value.

It also adds a lazy property to the first passed in parameter, "set", which returns a proxy, and that proxy watches for symbol references passed in a value, and sets the value from that spawned instance.  Again, if the spawned instance is not found, it re-spawns it.

The suggestion to use Symbol.for with a guid, as opposed to just Symbol(), is based on some negative experiences I've had with multiple versions of the same library being referenced, but is not required. Regular symbols could also be used when that risk can be avoided.

## Support for JSON assignment with Symbol.for symbols

```JavaScript
const result = assignGingerly({}, {
    "[Symbol.for('TFWsx0YH5E6eSfhE7zfLxA')]": true,
    "[Symbol.for('BqnnTPWRHkWdVGWcGQoAiw')]": true,
    '?.style.height': '40px',
    '?.enh?.mellowYellow?.madAboutFourteen': true
}, {
    registry: BaseRegistry
});
```



## Object.prototype Extensions

For convenience, this package also provides Object.prototype extensions that allow you to call `assignGingerly` and `assignTentatively` directly on any object:

```TypeScript
import 'assign-gingerly/object-extension.js';

const obj = {};
obj.assignGingerly({ '?.style?.height': '15px' });
console.log(obj.style.height); // '15px'

// assignTentatively is an alias for assignGingerly on the prototype
const target = {};
target.assignTentatively({ '?.config?.theme': 'dark' });
console.log(target.config.theme); // 'dark'
```

Both methods return `this`, allowing for method chaining:

```TypeScript
const obj = {};
obj
  .assignGingerly({ a: 1 })
  .assignTentatively({ '?.b?.c': 2 })
  .assignGingerly({ d: 3 });

console.log(obj); // { a: 1, b: { c: 2 }, d: 3 }
```

**Note**: The `assignTentatively` method on Object.prototype is simply an alias for `assignGingerly` and does **not** provide the reversibility features of the standalone `assignTentatively` function described in Example 7. For reversible assignments, use the standalone function from `assign-gingerly/assignTentatively`.

The prototype extensions are non-enumerable and won't appear in `Object.keys()` or `for...in` loops.

## Custom Element Registry Integration (Chrome 146+)

This package includes support for Chrome's scoped custom element registries, which automatically integrates dependency injection with custom elements.

### Automatic Registry Population

When `assignGingerly` or `assignTentatively` is called on an Element instance without providing an explicit `registry` option, it automatically uses the registry from `element.customElementRegistry.assignGingerlyRegistry`:

```TypeScript
import 'assign-gingerly/object-extension.js';
import { BaseRegistry } from 'assign-gingerly';

// Set up a registry on the custom element registry
const myElement = document.createElement('div');
const registry = myElement.customElementRegistry.assignGingerlyRegistry;

const mySymbol = Symbol.for('myProperty');
class MyEnhancement {
  value = null;
}

registry.push({
  spawn: MyEnhancement,
  map: { [mySymbol]: 'value' }
});

// No need to pass registry option - it's automatically used!
myElement.assignGingerly({
  [mySymbol]: 'hello world'
});
```

### Lazy Registry Creation

Each `CustomElementRegistry` instance gets its own `assignGingerlyRegistry` property via a lazy getter. The `BaseRegistry` instance is created on first access and cached for subsequent uses:

```TypeScript
const element1 = document.createElement('div');
const element2 = document.createElement('span');

// Each element's customElementRegistry gets its own registry
const registry1 = element1.customElementRegistry.assignGingerlyRegistry;
const registry2 = element2.customElementRegistry.assignGingerlyRegistry;

// Multiple accesses return the same instance
console.log(registry1 === element1.customElementRegistry.assignGingerlyRegistry); // true
```

### Explicit Registry Override

You can still provide an explicit `registry` option to override the automatic behavior:

```TypeScript
const customRegistry = new BaseRegistry();
// ... configure customRegistry ...

myElement.assignGingerly({
  [mySymbol]: 'value'
}, { registry: customRegistry }); // Uses customRegistry instead of customElementRegistry
```

**Browser Support**: This feature requires Chrome 146+ with scoped custom element registry support. The implementation is designed as a polyfill for the web standards proposal and does not include fallback behavior for older browsers.
