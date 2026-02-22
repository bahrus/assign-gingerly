# assign-gingerly and assign-tentatively

[![Playwright Tests](https://github.com/bahrus/assign-gingerly/actions/workflows/CI.yml/badge.svg?branch=baseline)](https://github.com/bahrus/assign-gingerly/actions/workflows/CI.yml)
[![NPM version](https://badge.fury.io/js/assign-gingerly.png)](http://badge.fury.io/js/assign-gingerly)
[![How big is this package in your project?](https://img.shields.io/bundlephobia/minzip/assign-gingerly?style=for-the-badge)](https://bundlephobia.com/result?p=assign-gingerly)
<img src="http://img.badgesize.io/https://cdn.jsdelivr.net/npm/assign-gingerly?compression=gzip">



## Introduction

This package starts out innocently enough -- it provides two utility functions for carefully merging one object into another.  This is a primitive sorely lacking in the web, and this package is a polyfill for what we (me with a lot of help from AI) would like to see built into the platform.  We make no apologies about adding these features directly to the underlying API's, as it is part of a proposal which is sitting there gathering dust, with no apparent alternatives under consideration.  In particular the reference:

```JavaScript
import 'assign-gingerly/object-extension.js';
```

has the "side effect" of enhancing the platform API in a way that this proposal can only hope the platform chooses to adopt in the future (or some variation).

One can achieve the same functionality with a little more work, and "playing nicer" with the platform by importing assign-gingerly.js and/or assign-tentatively.js, which has no such side effects.

## Object Extension Pattern

Not only does this polyfill package allow merging data properties onto objects that are expecting them, this polyfill also provides the ability to merge *augmented behavior* onto run-time objects without sub classing all such objects of the same type. This includes the ability to spawn an instance of a class and "merge" it into the API of the original object in an elegant way that is easy to wrap one's brain around, without ever blocking access to the original object or breaking it.

So we are providing a form of the ["Decorator Pattern"](https://en.wikipedia.org/wiki/Decorator_pattern) or perhaps more accurately the [Extension Object Pattern](https://swiftorial.com/swiftlessons/design-patterns/structural-patterns/extension-object-pattern) as tailored for the quirks of the web.  

So in our view this package helps fill the void left by not supporting the "is" attribute for built-in elements (but is not a complete solution, just a critical building block).  Mount-observer, mount-observer-script-element, and custom enhancements builds on top of the critical role that assign-gingerly plays.

Anyway, let's start out detailing the more innocent features of this package / polyfill.

The two utility functions are:

## assignGingerly

assignGingerly builds on Object.assign.  Like Object.assign, the object getting assigned can be a JSON stringified object.  Some of the unusual syntax we see with assignGingerly is there to continue to support JSON deserialized objects as a viable argument to be passed.  

assign-gingerly adds support for:

1.  Carefully merging in nested properties.
2.  Dependency injection based on a mapping protocol.

and 

## assignTentatively

assignTentatively provides a far more limited subset of functionality compared to assignGingerly.   The tradeoff is that assignTentatively can do something important assignGingerly cannot do -- be "reversed". This can be quite useful for some scenarios.  Think of how css "turns on" visual effects while conditions are met, then reverts to how things were before the conditions were met when needed without as if nothing happened.  Another example is allowing user edits to be rolled back as they repeatedly hit "ctrl+z".

## Example 1 - assignGingerly as a "superset" of Object.assign:

```TypeScript
const sourceObj = {hello: 'world'};
sourceObj.assignGingerly({hello: 'Venus', foo: 'bar'});
// Because none of the keys of the second parameter start with "?.", 
// nor includes any symbols keys,
// assign gingerly produces identical results 
// as Object.assign,  and is synchronous:
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
oInput.assignGingerly({'?.style?.height': '15px'});
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

When the right hand side of an expression is an object, assignGingerly is recursively applied (passing the third argument in if applicable, which will be discussed below).

While we are in the business of passing values of object A into object B, we might as well add some extremely common behavior that allows updating properties of object B based on the current values of object B -- things like incrementing, toggling, and deleting.  Deleting is critical for assignTentatively, but is included with both functions

## Example 4 - Incrementing values with += command

The `+=` command allows us to increment numeric values and concatenate string values:

```TypeScript
const obj = {
    a: {
        b: {
            c: 2
        }
    }
};
assignGingerly(obj, {
    '?.a?.b?.c +=': 3,
    '?.a?.d?.e +=': -2
});
console.log(obj);
// {
//   a: {
//     b: { c: 5 },      // 2 + 3 = 5
//     d: { e: -2 }      // non-existent path created with value -2
//   }
// }
```

The `+=` command syntax is `<path> +=` where the path can use the `?.` nested notation. The right-hand side value is added to the existing value using `+=`. If the path doesn't exist, it's created and set directly to the value.  If the expression is a string, string concatenation is used.  If the expression can't be "added to", it allows JavaScript to throw its natural error.

## Example 5 - Toggling boolean values and negating

The `=!` command allows us to toggle boolean values:

```TypeScript
const obj = {
    a: {
        b: {
            c: true
        }
    }
};
assignGingerly(obj, {
    '?.a?.b?.c =!': '.',      // Toggle itself
    // Negates another property.  
    // The RHS doesn't spawn new objects
    // and evaluates to true if it doesn't exist
    '?.a?.d?.c =!': '?.a?.d?.e'       
});
console.log(obj);
// {
//   a: {
//     b: { c: false }           // Toggled immediately
//     // d doesn't exist yet
//   }
// }
```

The `=!` command syntax is `<path> =!` where the path can use the `?.` nested notation. 

For existing values, the toggle is performed using JavaScript's logical NOT operator (`!value`), regardless of what type it is.

## Example 6 - Deleting properties with -= command

The `-=` command allows you to delete properties from objects:

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
    //deletes obj.a.b.c if it exists
    '?.a?.b -=': 'c',      
});
console.log(obj);
// {
//   a: {
//     b: { d: 'hello' }          // c deleted 
//   }
// }
```

The `-=` command syntax is `<path> -=` where the path points to the parent object. The right-hand side value specifies what to delete:
- **String**: Delete a single property
- **Array**: Delete multiple properties

```TypeScript
const obj = {
    data: {
        keep: 'this',
        remove1: 'delete',
        remove2: 'delete',
        remove3: 'delete'
    }
};

// Delete single property
assignGingerly(obj, { '?.data -=': 'remove1' });

// Delete multiple properties
assignGingerly(obj, { '?.data -=': ['remove2', 'remove3'] });

console.log(obj);
// {
//   data: { keep: 'this' }
// }
```

**Important notes:**
- The path specifies the parent object, not the property to delete
- Non-existent properties are silently skipped
- If the parent path doesn't exist, the command is silently skipped
- For root-level deletion, use ` -=` (space before -=)
//   }
// }




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
//   ' -=': 'a',
//   ' -=': 'style',
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
- **No registry/DI support**: Dependency injection features are not available (pass it in and it will be ignored).  Dependency injection is discussed below.
- **Reversal tracking**: Maintains a reversal object that records:
  - **Original values** of modified existing properties
  - **-= commands** for newly created top-level paths (e.g., ` -=: 'a'` for paths created under `a`)
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

## Dependency injection based on a registry object and a Symbolic reference mapping

```Typescript
interface IBaseRegistryItem<T = any> {
    spawn: {new(): T} | Promise<{new(): T}>
    symlinks: {[key: symbol]: keyof T}
    // Optional: for element enhancement access
    enhKey?: string
    // Optional: automatic attribute parsing 
    withAttrs?: AttrPatterns<T>  
}

export const isHappy = Symbol.for('TFWsx0YH5E6eSfhE7zfLxA');
class MyEnhancement{
    //optional
    constructor(augmentedObj?: Object){}
    get isHappy(){}
    set isHappy(nv){}
}

export const isMellow = Symbol.for('BqnnTPWRHkWdVGWcGQoAiw');
class YourEnhancement{
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
        symlinks: {
            [isHappy]: 'isHappy'
        },
        spawn: MyEnhancement,
    },{
       
       symlinks: {
           [isMellow]: 'isMellow'
       },
       spawn: YourEnhancement,
    }
]);
//end of dependency injection

const result = assignGingerly({}, {
    [isHappy]: true,
    [isMellow]: true,
    '?.style?.height': '40px',
    '?.enh?.mellowYellow?.madAboutFourteen': true
}, {
    registry: BaseRegistry
});
//result.set[isMellow] = false;
```

The assignGingerly function searches the registry for any items that has a mapping with a matching symbol of isHappy and isMellow, and if found, sees if it already has an instance of the spawn class associated with the first passed in parameter.  If no such instance is found, it instantiates one, associates the instance with the first parameter, then sets the property value.

It also adds a lazy property to the first passed in parameter, "set", which returns a proxy, and that proxy watches for symbol references passed in a value, and sets the value from that spawned instance.  Again, if the spawned instance is not found, it re-spawns it.

The suggestion to use Symbol.for with a guid, as opposed to just Symbol(), is based on some negative experiences I've had with multiple versions of the same library being referenced, but is not required. Regular symbols could also be used when that risk can be avoided.

<details>
<summary>Global Instance Map for Cross-Version Compatibility</summary>

To ensure instance uniqueness even when multiple versions of this package are loaded, spawned instances are stored in a global WeakMap at `globalThis['HDBhTPLuIUyooMxK88m68Q']`. This guarantees that:

- **Same instance across versions**: Different versions of the package will share the same instance map
- **Memory safety**: Using WeakMap allows garbage collection when objects are no longer referenced
- **No conflicts**: The GUID-based key prevents collisions with other libraries
- **Registry item keying**: Instances are keyed by registry item (not by symbol), ensuring that multiple symbols mapped to the same registry item share the same spawned instance
- **Shared between assignGingerly and enh.set**: Both `assignGingerly()` and `element.enh.set` use the same global instance map, ensuring only one instance per registry item per element

This is particularly important in complex applications where different dependencies might bundle different versions of assign-gingerly.

**Example of shared instances:**
```TypeScript
const symbol1 = Symbol.for('prop1');
const symbol2 = Symbol.for('prop2');

class MyEnhancement {
  element;
  ctx;
  prop1 = null;
  prop2 = null;
  instanceId = Math.random();

  constructor(oElement, ctx, initVals) {
    this.element = oElement;
    this.ctx = ctx;
    if (initVals) {
      Object.assign(this, initVals);
    }
  }
}

const registryItem = {
  spawn: MyEnhancement,
  symlinks: {
    [symbol1]: 'prop1',
    [symbol2]: 'prop2'
  },
  enhKey: 'myEnh'
};

const registry = new BaseRegistry();
registry.push(registryItem);

const element = document.createElement('div');
element.customElementRegistry.enhancementRegistry.push(registryItem);

// Use assignGingerly first
assignGingerly(element, { [symbol1]: 'value1' }, { registry });
const id1 = element.enh.myEnh.instanceId;

// Use enh.set - gets the SAME instance
element.enh.set.myEnh.prop2 = 'value2';
const id2 = element.enh.myEnh.instanceId;

console.log(id1 === id2); // true - same instance!
console.log(element.enh.myEnh.prop1); // 'value1'
console.log(element.enh.myEnh.prop2); // 'value2'
```

**Example of registry item keying:**
```TypeScript
const symbol1 = Symbol.for('prop1');
const symbol2 = Symbol.for('prop2');

class MyEnhancement {
  prop1 = null;
  prop2 = null;
}

const registryItem = {
  spawn: MyEnhancement,
  symlinks: {
    [symbol1]: 'prop1',
    [symbol2]: 'prop2'
  }
};

const registry = new BaseRegistry();
registry.push(registryItem);

const target = {};

// Both symbols use the SAME instance because they're in the same registry item
assignGingerly(target, { [symbol1]: 'value1' }, { registry });
assignGingerly(target, { [symbol2]: 'value2' }, { registry });

// Both properties are set on the same instance
console.log(target.set[symbol1] === target.set[symbol2]); // true
console.log(target.set[symbol1].prop1); // 'value1'
console.log(target.set[symbol1].prop2); // 'value2'
```

</details>

<details>
  <summary>Support for JSON assignment with Symbol.for symbols</summary>

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
</details>


<!--


Already covered, I think 

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

-->

## Custom Element Registry Integration (Chrome 146+)

This package includes support for Chrome's scoped custom element registries, which automatically integrates dependency injection in harmony with scoped custom elements DOM sections or ShadowRoots.

<details>
  <summary>Automatic Registry Population</summary>

When `assignGingerly` or `assignTentatively` is called on an Element instance without providing an explicit `registry` option, it automatically uses the registry from `element.customElementRegistry.enhancementRegistry`:

```TypeScript
import 'assign-gingerly/object-extension.js';
import { BaseRegistry } from 'assign-gingerly';

// Set up a registry on the custom element registry
const myElement = document.createElement('div');
const registry = myElement.customElementRegistry.enhancementRegistry;

const mySymbol = Symbol.for('myProperty');
class MyEnhancement {
  value = null;
}

registry.push({
  spawn: MyEnhancement,
  symlinks: { [mySymbol]: 'value' }
});

// No need to pass registry option - it's automatically used!
myElement.assignGingerly({
  [mySymbol]: 'hello world'
});
```

</details>

<details>
<summary>Lazy Registry Creation</summary>

Each `CustomElementRegistry` instance gets its own `enhancementRegistry` property via a lazy getter. The `BaseRegistry` instance is created on first access and cached for subsequent uses:

```TypeScript
const element1 = document.createElement('div');
const element2 = document.createElement('span');

// Each element's customElementRegistry gets its own registry
const registry1 = element1.customElementRegistry.enhancementRegistry;
const registry2 = element2.customElementRegistry.enhancementRegistry;

// Multiple accesses return the same instance
console.log(registry1 === element1.customElementRegistry.enhancementRegistry); // true
```
</details>

<details>
  <summary>Explicit Registry Override</summary>

You can still provide an explicit `registry` option to override the automatic behavior:

```TypeScript
const customRegistry = new BaseRegistry();
// ... configure customRegistry ...

myElement.assignGingerly({
  [mySymbol]: 'value'
}, { registry: customRegistry }); // Uses customRegistry instead of customElementRegistry.enhancementRegistry
```

**Browser Support**: This feature requires Chrome 146+ with scoped custom element registry support. The implementation is designed as a polyfill for the web standards proposal and does not include fallback behavior for older browsers.
</details>

## Enhanced Element Property Assignment with `enh.set` Proxy (Chrome 146+)

Building on the Custom Element Registry integration, this package provides a powerful `enh.set` proxy on all Element instances that enables automatic enhancement spawning and simplified property assignment syntax. The `enh` property serves as a dedicated namespace for enhancements, preventing conflicts with future platform properties.

### Basic Usage

The `enh.set` proxy allows you to assign properties to enhancements using a clean, chainable syntax:

```TypeScript
import 'assign-gingerly/object-extension.js';
//import { BaseRegistry } from 'assign-gingerly';

// Define an enhancement class
class MyEnhancement {
  element;
  ctx;
  myProp = null;
  anotherProp = null;

  constructor(oElement, ctx, initVals) {
    this.element = oElement;
    this.ctx = ctx;
    if (initVals) {
      Object.assign(this, initVals);
    }
  }
}

// Register the enhancement with an enhKey
const myElement = document.createElement('div');
const registry = myElement.customElementRegistry.enhancementRegistry;

registry.push({
  spawn: MyEnhancement,
  enhKey: 'myEnh'  // Key identifier for this enhancement
});

// Use the enh.set proxy to automatically spawn and assign properties
myElement.enh.set.myEnh.myProp = 'hello';
myElement.enh.set.myEnh.anotherProp = 'world';

console.log(myElement.enh.myEnh instanceof MyEnhancement); // true
console.log(myElement.enh.myEnh.myProp); // 'hello'
console.log(myElement.enh.myEnh.element === myElement); // true
```

<details>
<summary>
How It Works
</summary>

When you access `element.enh.set.enhKey.property`, the proxy:

1. **Checks the registry**: Looks for a registry item with `enhKey` matching the property name
2. **Spawns if needed**: If found and the enhancement doesn't exist or is the wrong type:
   - Creates a `SpawnContext` with `{ config: registryItem }`
   - Calls the constructor with `(element, ctx, initVals)`
   - If a non-matching object already exists at `element.enh[enhKey]`, it's passed as `initVals`
   - Stores the spawned instance at `element.enh[enhKey]`
3. **Reuses existing instances**: If the enhancement already exists and is the correct type, it reuses it
4. **Falls back to plain objects**: If no registry item is found, creates a plain object at `element.enh[enhKey]`

</details>

### Why the `enh` Namespace?

The `enh` property provides a dedicated namespace for enhancements, similar to how `dataset` provides a namespace for data attributes. This prevents conflicts with:
- Future platform properties that might be added to Element
- Existing element properties and methods
- Other libraries that might extend HTMLElement

This approach is part of a proposal to WHATWG for standardizing element enhancements.

### Constructor Signature

Enhancement classes should follow this constructor signature:

```TypeScript
interface SpawnContext<T, TMountContext = any> {
  config: IBaseRegistryItem<T>;
  mountCtx?: TMountContext;  // Optional custom context passed by caller
}

class Enhancement {
  constructor(
    oElement?: Element,      // The element being enhanced
    ctx?: SpawnContext,      // Context with registry item info and optional mountCtx
    initVals?: Partial<T>    // Initial values if property existed
  ) {
    // Your initialization logic
    // Access custom context via ctx.mountCtx if provided
  }
}
```

All parameters are optional for backward compatibility with existing code.

<details>
<summary>Passing Custom Context</summary>

You can pass custom context when calling `enh.get()` or `enh.whenResolved()`:

```TypeScript
// Pass custom context to the spawned instance
const myContext = { userId: 123, permissions: ['read', 'write'] };
const instance = element.enh.get(registryItem, myContext);

// The constructor receives it via ctx.mountCtx
class MyEnhancement {
  constructor(oElement, ctx, initVals) {
    console.log(ctx.mountCtx.userId);        // 123
    console.log(ctx.mountCtx.permissions);   // ['read', 'write']
  }
}
```

This is useful for:
- Passing authentication/authorization context
- Providing configuration that varies per invocation
- Sharing state between caller and enhancement
- Dependency injection of services or utilities

**Note**: The `mountCtx` is only available when explicitly calling `enh.get()` or `enh.whenResolved()`. It's not available when accessing via the `enh.set` proxy (since that's a property getter with no way to pass parameters).

</details>

### Registry Item with enhKey

In addition to spawn and symlinks, registry items support optional properties `enhKey`, `withAttrs`, `canSpawn`, and `lifecycleKeys`:

```TypeScript
interface IBaseRegistryItem<T> {
  spawn: { 
    new (oElement?: Element, ctx?: SpawnContext<T>, initVals?: Partial<T>): T;
    canSpawn?: (obj: any, ctx?: SpawnContext<T>) => boolean;  // Optional spawn guard
  };
  symlinks?: { [key: string | symbol]: keyof T };
  enhKey?: string;  // String identifier for set proxy access
  withAttrs?: AttrPatterns<T>;  // Automatic attribute parsing during spawn
  lifecycleKeys?: 
    | true  // Use standard names: "dispose" method, "resolved" property/event
    | {
        dispose?: string | symbol;  // Method name to call on disposal
        resolved?: string | symbol;  // Property name and event name for async resolution
      };
}
```

The `withAttrs` property enables automatic attribute parsing when the enhancement is spawned. See the [Parsing Attributes with parseWithAttrs](#parsing-attributes-with-parsewithattrs) section for details.

It also tips off extending polyfills / libraries, in particular mount-observer, to be on te lookout for the attributes specified by withAttrs.  But *assign-gingerly, by itself, performs **no** DOM observing to automatically spawn the class instance*.  It expects consumers of the polyfill to programmatically attach such behavior/enhancements, and/or rely on alternative, higher level packages to be vigilant for enhancement opportunities. 

The `canSpawn` static method allows enhancement classes to conditionally block spawning based on the target object. See the [Conditional Spawning with canSpawn](#conditional-spawning-with-canspawn) section for details.

The `lifecycleKeys` property configures lifecycle integration without requiring base classes. See the [Lifecycle Keys: Configuration vs Convention](#lifecycle-keys-configuration-vs-convention) section for details.

<details>
   <summary>Advanced Examples</summary>

**Multiple Enhancements:**
```TypeScript
class StyleEnhancement {
  constructor(oElement, ctx, initVals) {
    this.element = oElement;
  }
  height = null;
  width = null;
}

class DataEnhancement {
  constructor(oElement, ctx, initVals) {
    this.element = oElement;
  }
  value = null;
}

const element = document.createElement('div');
const registry = element.customElementRegistry.enhancementRegistry;

registry.push([
  { spawn: StyleEnhancement, enhKey: 'styles' },
  { spawn: DataEnhancement, enhKey: 'data' }
]);

element.enh.set.styles.height = '100px';
element.enh.set.data.value = 'test';

console.log(element.enh.styles instanceof StyleEnhancement); // true
console.log(element.enh.data instanceof DataEnhancement); // true
```

**Preserving Existing Data with initVals:**
```TypeScript
const element = document.createElement('div');
const registry = element.customElementRegistry.enhancementRegistry;

registry.push({
  spawn: MyEnhancement,
  enhKey: 'config'
});

// Set a plain object first
element.config = { existingProp: 'preserved', anotherProp: 'also preserved' };

// Access via enh.set proxy - spawns enhancement with initVals
element.enh.set.config.newProp = 'added';

console.log(element.enh.config instanceof MyEnhancement); // true
console.log(element.enh.config.existingProp); // 'preserved'
console.log(element.enh.config.newProp); // 'added'
```

**Plain Objects Without Registry:**
```TypeScript
const element = document.createElement('div');

// No registry item for 'plainData' - creates plain object
element.enh.set.plainData.prop1 = 'value1';
element.enh.set.plainData.prop2 = 'value2';

console.log(element.enh.plainData); // { prop1: 'value1', prop2: 'value2' }
```

</details>

<details>
<summary>Finding Registry Items by enhKey</summary>

The `BaseRegistry` class includes a `findByEnhKey` method:

```TypeScript
const registry = new BaseRegistry();
registry.push({
  spawn: MyEnhancement,
  enhKey: 'myEnh'
});

const item = registry.findByEnhKey('myEnh');
console.log(item.enhKey); // 'myEnh'
```
</details>

### Programmatic Instance Spawning with `enh.get()`

The `enh.get(registryItem)` method provides a programmatic way to spawn or retrieve enhancement instances:

```TypeScript
const registryItem = {
  spawn: MyEnhancement,
  enhKey: 'myEnh'
};

// Get or spawn the instance
const instance = element.enh.get(registryItem);

console.log(instance instanceof MyEnhancement); // true
console.log(element.enh.myEnh === instance); // true
```

**How `enh.get()` works:**

1. **Adds to registry**: If the registry item isn't already in `element.customElementRegistry.enhancementRegistry`, it's automatically added
2. **Spawns if needed**: If no instance exists for this registry item, it spawns one (passing element, context, and initVals if applicable)
3. **Stores on enh**: If the registry item has an `enhKey`, the instance is stored at `element.enh[enhKey]`
4. **Returns instance**: Returns the spawned or existing instance

**Benefits:**
- **Explicit control**: Spawn instances programmatically without needing to use symbols or property assignment
- **Shared instances**: Uses the same global instance map as `assignGingerly` and `enh.set`, ensuring only one instance per registry item
- **Auto-registration**: Automatically adds registry items to the element's registry if not present

<details>
<summary>Example with shared instances</summary>

```TypeScript
const registryItem = {
  spawn: MyEnhancement,
  symlinks: { [mySymbol]: 'value' },
  enhKey: 'myEnh'
};

// Get instance programmatically
const instance1 = element.enh.get(registryItem);
instance1.prop1 = 'from get()';

// Use enh.set - gets the SAME instance
element.enh.set.myEnh.prop2 = 'from set';

// Use assignGingerly - still the SAME instance
assignGingerly(element, { [mySymbol]: 'from assign' }, { registry });

console.log(element.enh.myEnh.prop1); // 'from get()'
console.log(element.enh.myEnh.prop2); // 'from set'
console.log(element.enh.myEnh.value); // 'from assign'
```

</details>

<details>
  <summary>Lifecycle Keys: Configuration vs Convention</summary>

Enhancement classes can integrate with the lifecycle system through configurable method/property names, avoiding the need for base classes or mixins.

**Why configurable lifecycle keys?**

1. **Zero coupling**: Enhancement classes remain plain classes with no framework dependencies
2. **Framework agnostic**: Works with classes from any source - your own, third-party libraries, generated code, legacy code
3. **Naming freedom**: Avoids debates over standard names. One team's `dispose()` is another's `cleanup()`, `destroy()`, or `teardown()`
4. **Multiple patterns**: Different enhancement libraries can coexist with different conventions
5. **Gradual adoption**: Integrate with existing classes without refactoring
6. **Testability**: Enhancement classes remain simple POJOs (Plain Old JavaScript Objects) that are easy to test in isolation

**The shortcut: `lifecycleKeys: true`**

For convenience, you can use `lifecycleKeys: true` to adopt standard naming conventions:

```TypeScript
const registryItem = {
  spawn: MyEnhancement,
  enhKey: 'myEnh',
  lifecycleKeys: true  // Uses standard names: "dispose" and "resolved"
};
```

This is equivalent to:

```TypeScript
lifecycleKeys: {
  dispose: 'dispose',
  resolved: 'resolved'
}
```

**Custom lifecycle keys:**

When you need different names (for legacy code, team conventions, or avoiding conflicts):

```TypeScript
lifecycleKeys: {
  dispose: 'cleanup',      // Call cleanup() method on disposal
  resolved: 'isReady'      // Watch isReady property and dispatch "isReady" event
}
```

**Symbol support:**

Lifecycle keys can be symbols to avoid naming collisions:

```TypeScript
const DISPOSE = Symbol('dispose');
const RESOLVED = Symbol('resolved');

class MyEnhancement {
  [DISPOSE]() {
    // Cleanup code
  }
  
  [RESOLVED] = false;
}

const registryItem = {
  spawn: MyEnhancement,
  enhKey: 'myEnh',
  lifecycleKeys: {
    dispose: DISPOSE,
    resolved: RESOLVED
  }
};
```

Note: Symbol event names are not yet supported by the platform but have been requested. When supported, the `resolved` key will work as both property name and event name.

</details>

### Disposing Enhancement Instances with `enh.dispose()`

The `enh.dispose()` method provides a way to clean up and remove enhancement instances:

```TypeScript
class MyEnhancement {
  element;
  ctx;
  
  constructor(oElement, ctx, initVals) {
    this.element = oElement;
    this.ctx = ctx;
    // Setup code...
  }
  
  cleanup(registryItem) {
    // Cleanup code - remove event listeners, clear timers, etc.
    console.log('Disposing enhancement');
  }
}

const registryItem = {
  spawn: MyEnhancement,
  enhKey: 'myEnh',
  lifecycleKeys: true  // Standard: calls dispose() method
};

// Or with custom name:
const customRegistryItem = {
  spawn: MyEnhancement,
  enhKey: 'myEnh',
  lifecycleKeys: {
    dispose: 'cleanup'  // Custom: calls cleanup() method
  }
};

// Get instance
const instance = element.enh.get(registryItem);

// Later, dispose of it
element.enh.dispose(registryItem);
```

**How `enh.dispose()` works:**

1. **Retrieves instance**: Gets the spawned instance from the global instance map
2. **Calls lifecycle method**: If `lifecycleKeys.dispose` is specified, calls that method on the instance (passing the registry item)
3. **Removes from map**: Removes the instance from the global instance map
4. **Removes from enh**: If the registry item has an `enhKey`, removes the property from the enh container

**Benefits:**
- **Proper cleanup**: Allows enhancements to clean up resources (event listeners, timers, etc.)
- **Memory management**: Removes references to allow garbage collection
- **Safe**: Safely handles non-existent instances without errors
- **Isolated**: Only affects the specified instance, leaving others intact

**Example with lifecycle cleanup:**
```TypeScript
class TimerEnhancement {
  element;
  timerId = null;
  
  constructor(oElement, ctx) {
    this.element = oElement;
    this.timerId = setInterval(() => {
      console.log('Timer tick');
    }, 1000);
  }
  
  dispose() {
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
      console.log('Timer cleaned up');
    }
  }
}

const registryItem = {
  spawn: TimerEnhancement,
  enhKey: 'timer',
  lifecycleKeys: true  // Standard: calls dispose() method
};

element.enh.get(registryItem); // Starts timer

// Later...
element.enh.dispose(registryItem); // Stops timer and cleans up
```

**After disposal:**
- The instance is removed from the global instance map
- Calling `enh.get()` again will create a new instance
- The enhancement property is removed from the enh container

### Waiting for Async Initialization with `enh.whenResolved()`

The `enh.whenResolved()` method provides a way to wait for asynchronous enhancement initialization:

```TypeScript
class AsyncEnhancement extends EventTarget {
  element;
  ctx;
  isResolved = false;
  data = null;
  
  constructor(oElement, ctx) {
    super();
    this.element = oElement;
    this.ctx = ctx;
    this.initialize();
  }
  
  async initialize() {
    // Simulate async operation (fetch data, load resources, etc.)
    const response = await fetch('/api/data');
    this.data = await response.json();
    
    // Mark as resolved and dispatch event
    this.resolved = true;
    this.dispatchEvent(new Event('resolved'));
  }
}

const registryItem = {
  spawn: AsyncEnhancement,
  enhKey: 'asyncEnh',
  lifecycleKeys: true  // Standard: watches "resolved" property and event
};

// Or with custom name:
const customRegistryItem = {
  spawn: AsyncEnhancement,
  enhKey: 'asyncEnh',
  lifecycleKeys: {
    resolved: 'isReady'  // Custom: watches "isReady" property and event
  }
};

// Wait for the enhancement to be fully initialized
const instance = await element.enh.whenResolved(registryItem);
console.log(instance.data); // Data is loaded and ready

// With custom context
const authContext = { token: 'abc123', userId: 456 };
const instanceWithContext = await element.enh.whenResolved(registryItem, authContext);
// The constructor receives authContext via ctx.mountCtx
```

<details>
<summary>How `enh.whenResolved()` works:</summary>

1. **Validates configuration**: Throws error if `lifecycleKeys.resolved` is not specified
2. **Gets instance**: Calls `enh.get()` to get or spawn the instance
3. **Checks if resolved**: If the resolved property is already true, returns immediately
4. **Validates EventTarget**: Throws error if instance is not an EventTarget
5. **Waits for event**: Lazy loads the `waitForEvent` module and waits for the resolved event (using the same name as the property)
6. **Returns or rejects**: Returns the instance if resolved flag is set, otherwise throws

**Requirements:**
- Enhancement class must extend `EventTarget`
- Must specify `lifecycleKeys.resolved` property name (or use `lifecycleKeys: true` for standard "resolved")
- Instance must dispatch an event with the same name as the resolved property when ready
- Instance must set the resolved property to a truthy value

**Note**: The `resolved` key serves dual purpose - it's both the property name to check AND the event name to listen for. When `lifecycleKeys: true`, both use "resolved".

**Benefits:**
- **Async-aware**: Properly handles asynchronous initialization
- **Lazy loading**: The waitForEvent module is only loaded when needed
- **Early return**: Returns immediately if already resolved (no waiting)
- **Type safety**: Validates that instance can dispatch events
- **Clean API**: Simple promise-based interface

**Example with multiple async operations:**
```TypeScript
class DataEnhancement extends EventTarget {
  element;
  resolved = false;
  users = null;
  settings = null;
  
  constructor(oElement, ctx) {
    super();
    this.element = oElement;
    this.loadData();
  }
  
  async loadData() {
    try {
      // Load multiple resources in parallel
      const [usersRes, settingsRes] = await Promise.all([
        fetch('/api/users'),
        fetch('/api/settings')
      ]);
      
      this.users = await usersRes.json();
      this.settings = await settingsRes.json();
      
      // Mark as resolved
      this.resolved = true;
      this.dispatchEvent(new Event('resolved'));
    } catch (error) {
      console.error('Failed to load data:', error);
      // Could dispatch a 'rejected' event here
    }
  }
}

const registryItem = {
  spawn: DataEnhancement,
  enhKey: 'data',
  lifecycleKeys: true  // Standard: watches "resolved" property and event
};

// Wait for all data to be loaded
try {
  const dataEnh = await element.enh.whenResolved(registryItem);
  console.log('Users:', dataEnh.users);
  console.log('Settings:', dataEnh.settings);
} catch (error) {
  console.error('Enhancement failed to resolve:', error);
}
```

**Calling multiple times:**
```TypeScript
// Multiple calls to whenResolved all wait for the same instance
const promise1 = element.enh.whenResolved(registryItem);
const promise2 = element.enh.whenResolved(registryItem);

const [instance1, instance2] = await Promise.all([promise1, promise2]);
console.log(instance1 === instance2); // true - same instance
```

**Browser Support**: This feature requires Chrome 146+ with scoped custom element registry support.

</details>

## Conditional Spawning with `canSpawn`

Enhancement classes can implement a static `canSpawn` method to conditionally block spawning based on the target object. This is useful for:
- Restricting enhancements to specific element types
- Checking object compatibility before spawning
- Implementing version-based feature gates
- Validating object state before enhancement

### Basic Usage

```TypeScript
class DivOnlyEnhancement {
  element;
  ctx;
  
  constructor(oElement, ctx, initVals) {
    this.element = oElement;
    this.ctx = ctx;
    if (initVals) {
      Object.assign(this, initVals);
    }
  }
  
  // Static method to control spawning
  static canSpawn(obj, ctx) {
    // Only spawn for div elements
    return obj.tagName && obj.tagName.toLowerCase() === 'div';
  }
}

const registry = new BaseRegistry();
registry.push({
  spawn: DivOnlyEnhancement,
  enhKey: 'divOnly'
});

const div = document.createElement('div');
const span = document.createElement('span');

// Will spawn - div is allowed
const divInstance = div.enh.get(registry.getItems()[0]);
console.log(divInstance instanceof DivOnlyEnhancement); // true

// Will NOT spawn - span is blocked
const spanInstance = span.enh.get(registry.getItems()[0]);
console.log(spanInstance); // undefined
```

<details>
  <summary>How It Works</summary>

1. **Called before spawning**: When an enhancement is about to be spawned (via `assignGingerly`, `enh.get()`, or `enh.set`), the `canSpawn` method is called first
2. **Receives context**: The method receives the target object and spawn context with registry item information
3. **Returns boolean**: Return `true` to allow spawning, `false` to block it
4. **Applies everywhere**: Works consistently across all spawning methods (dependency injection, `enh.get()`, `enh.set`)
5. **Optional**: If not defined, spawning proceeds normally

### Parameters

```TypeScript
static canSpawn(obj: any, ctx?: SpawnContext<T>): boolean
```

- `obj`: The target object being enhanced (element, plain object, etc.)
- `ctx`: Optional spawn context containing `{ config: IBaseRegistryItem<T> }`
- Returns: `true` to allow spawning, `false` to block

### Use Cases

**Element Type Checking:**
```TypeScript
class ButtonEnhancement {
  static canSpawn(obj, ctx) {
    return obj.tagName && obj.tagName.toLowerCase() === 'button';
  }
}
```

**Version Gating:**
```TypeScript
class ModernFeature {
  static canSpawn(obj, ctx) {
    // Only spawn for objects with version 2+
    return obj.version && obj.version >= 2;
  }
}
```

**Custom Type Checking:**
```TypeScript
class CustomTypeEnhancement {
  static canSpawn(obj, ctx) {
    return obj instanceof MyCustomClass;
  }
}
```

**Attribute-Based Conditions:**
```TypeScript
class OptInEnhancement {
  static canSpawn(obj, ctx) {
    // Only spawn if element has opt-in attribute
    return obj.hasAttribute && obj.hasAttribute('data-enhanced');
  }
}
```

**Complex Validation:**
```TypeScript
class ValidatedEnhancement {
  static canSpawn(obj, ctx) {
    // Multiple conditions
    if (!obj.id) return false;
    if (obj.disabled) return false;
    if (!obj.dataset?.ready) return false;
    return true;
  }
}
```

### Behavior Notes

- **No spawning**: When `canSpawn` returns `false`, no instance is created and no constructor is called
- **Returns undefined**: Methods like `enh.get()` return `undefined` when spawning is blocked
- **Silent blocking**: No errors are thrown - spawning is simply skipped
- **Reuse unaffected**: If an instance already exists, `canSpawn` is not called again
- **Performance**: `canSpawn` is only called once per spawn attempt, not on every access

### Example with Dependency Injection

```TypeScript
import assignGingerly, { BaseRegistry } from 'assign-gingerly';

class ElementOnlyEnhancement {
  value = null;
  
  static canSpawn(obj, ctx) {
    return typeof Element !== 'undefined' && obj instanceof Element;
  }
}

const registry = new BaseRegistry();
const enhSymbol = Symbol.for('myEnhancement');

registry.push({
  spawn: ElementOnlyEnhancement,
  symlinks: { [enhSymbol]: 'value' }
});

// Plain object - will not spawn
const plainObj = {};
assignGingerly(plainObj, { [enhSymbol]: 'test' }, { registry });
// No enhancement created

// Element - will spawn
const element = document.createElement('div');
assignGingerly(element, { [enhSymbol]: 'test' }, { registry });
// Enhancement created and value set
```

</details>

## Parsing Attributes with `parseWithAttrs`

The `parseWithAttrs` function provides a declarative way to read and parse HTML attributes into structured data objects. It's particularly useful for custom elements and web components that need to extract configuration from attributes.

### Automatic Integration with Enhancement Spawning

**Important**: When using the `enh.get()`, `enh.set`, or `assignGingerly()` methods with registry items, you typically **do not need to call `parseWithAttrs()` manually**. The attribute parsing happens automatically during enhancement spawning when you include a `withAttrs` property in your registry item.

```html
<my-element my-enhancement-count="42" my-enhancement-theme="dark"></my-element>
```

```TypeScript
import 'assign-gingerly/object-extension.js';

class MyEnhancement {
  elementRef;
  ctx;
  count = 0;
  theme = 'light';
  
  constructor(oElement, ctx, initVals) {
    this.element = new WeakRef(oElement);
    this.ctx = ctx;
    // initVals automatically contains parsed attributes!
    if (initVals) {
      Object.assign(this, initVals);
    }
  }
}

const element = document.querySelector('my-element');
const enhancementConfig = {
  spawn: MyEnhancement,
  enhKey: 'myEnh',
  withAttrs: {
    base: 'my-enhancement',
    count: '${base}-count',
    _count: { instanceOf: 'Number' },
    theme: '${base}-theme'

  }
};


// Spawn the enhancement - attributes are automatically parsed!
const instance = element.enh.get(enhancementConfig);
console.log(instance.count);  // 42 (parsed from attribute)
console.log(instance.theme);  // 'dark' (parsed from attribute)
```

**Example without enhKey:**

```TypeScript
// withAttrs works even without enhKey
class SimpleEnhancement {
  element;
  ctx;
  value = null;
  
  constructor(oElement, ctx, initVals) {
    this.element = oElement;
    this.ctx = ctx;
    if (initVals) {
      Object.assign(this, initVals);
    }
  }
}

const element = document.createElement('div');
element.setAttribute('data-value', 'test123');

const config = {
  spawn: SimpleEnhancement,
  // No enhKey - attributes still parsed!
  withAttrs: {
    base: 'data-',
    value: '${base}value'
  }
};

const instance = element.enh.get(config);
console.log(instance.value);  // 'test123' (parsed from attribute)
```

**How it works:**
1. When an enhancement is spawned via `enh.get()`, `enh.set`, or `assignGingerly()`
2. If the registry item has a `withAttrs` property defined
3. `parseWithAttrs(element, registryItem.withAttrs)` is automatically called
4. The parsed attributes are passed to the enhancement constructor as `initVals`
5. If the registry item also has an `enhKey`, the parsed attributes are merged with any existing values from `element.enh[enhKey]` (existing values take precedence)

**Note**: `withAttrs` works with or without `enhKey`. When there's no `enhKey`, the parsed attributes are passed directly to the constructor. When there is an `enhKey`, they're merged with any pre-existing values on the enh container.



### The `enh-` Prefix for Attribute Isolation

The `parseWithAttrs` function supports an `enh-` prefix for attributes to provide better isolation and avoid conflicts, especially for custom elements and SVG elements.

**Behavior by Element Type:**

- **Built-in HTML elements** (div, span, etc.): The `enh-` prefix acts as an **alias**. The function tries `enh-` prefixed attributes first, then falls back to unprefixed attributes.
  ```html
  <!-- Both work for built-in elements -->
  <div data-count="42"></div>
  <div enh-data-count="42"></div>
  
  <!-- enh- prefix takes precedence -->
  <div data-count="10" enh-data-count="42"></div>  <!-- Uses 42 -->
  ```

- **Custom elements and SVG elements**: The `enh-` prefix is **strictly enforced** by default. Only `enh-` prefixed attributes are read.
  ```html
  <!-- Only enh- prefixed attributes work -->
  <my-element data-count="42"></my-element>           <!-- Ignored -->
  <my-element enh-data-count="42"></my-element>       <!-- Works -->
  
  <svg enh-data-theme="dark"></svg>                   <!-- Works -->
  <svg data-theme="dark"></svg>                       <!-- Ignored -->
  ```

**Overriding with `allowUnprefixed`:**

For custom elements and SVG, you can opt-in to reading unprefixed attributes by specifying a pattern (string or RegExp) that the element's tag name must match:

```TypeScript
// Allow unprefixed for elements matching pattern
registry.push({
  spawn: MyEnhancement,
  enhKey: 'myEnh',
  allowUnprefixed: '^my-',  // Only for elements starting with "my-"
  withAttrs: {
    base: 'data-',
    count: '${base}count',
    _count: { instanceOf: 'Number' }
  }
});

// Or use RegExp for more complex patterns
registry.push({
  spawn: MyEnhancement,
  enhKey: 'myEnh',
  allowUnprefixed: /^(my-|app-)/,  // For "my-*" or "app-*" elements
  withAttrs: {
    base: 'data-',
    count: '${base}count',
    _count: { instanceOf: 'Number' }
  }
});
```

<details>
  <summary>Why use `enh-` prefix?</summary>

1. **Avoid conflicts**: Custom elements may use unprefixed attributes for their own purposes
2. **Clear intent**: Makes it obvious which attributes are for enhancements
3. **Future-proof**: Protects against future attribute additions to custom elements
4. **Consistency**: Provides a standard convention across all enhanced elements
5. **Selective override**: Pattern-based `allowUnprefixed` lets you opt-in specific element families while maintaining strict isolation for others

</details>

<details>
  <summary>Manual Usage</summary>

While automatic parsing is the recommended approach, you can also call `parseWithAttrs()` manually when needed.

When calling `parseWithAttrs()` manually, pass the pattern as the third (optional) parameter:

```TypeScript
// Allow unprefixed only for elements matching pattern
const result = parseWithAttrs(element, attrPatterns, '^my-');

// Or with RegExp
const result = parseWithAttrs(element, attrPatterns, /^(my-|app-)/);
```

**Pattern Matching:**
- The pattern is tested against the element's **lowercase tag name**
- String patterns are automatically converted to RegExp
- If the tag name matches, unprefixed attributes are allowed (but `enh-` still takes precedence)
- If the tag name doesn't match, only `enh-` prefixed attributes are read

**Example:**
```html
<my-widget data-count="42"></my-widget>
<other-widget data-count="42"></other-widget>
```

```TypeScript
// Pattern: '^my-' (only matches "my-widget")
const result1 = parseWithAttrs(
  document.querySelector('my-widget'),
  { base: 'data-', count: '${base}count', _count: { instanceOf: 'Number' } },
  '^my-'
);
// result1.count = 42 (unprefixed allowed because tag matches)

const result2 = parseWithAttrs(
  document.querySelector('other-widget'),
  { base: 'data-', count: '${base}count', _count: { instanceOf: 'Number' } },
  '^my-'
);
// result2.count = undefined (unprefixed ignored because tag doesn't match)
```

### Basic Usage

```TypeScript
import { parseWithAttrs } from 'assign-gingerly/parseWithAttrs';

const element = document.querySelector('#myElement');
const config = parseWithAttrs(element, {
  base: 'data-',
  count: '${base}count',
  _count: {
    instanceOf: 'Number',
    mapsTo: 'itemCount'
  }
});
```

### Error Handling

The function throws descriptive errors for common issues:

```TypeScript
// Circular reference
parseWithAttrs(element, {
  a: '${b}',
  b: '${a}'  // Error: Circular reference detected
});

// Undefined variable
parseWithAttrs(element, {
  name: '${missing}'  // Error: Undefined template variable: missing
});

// Invalid JSON
// HTML: <div data-obj='{invalid}'></div>
parseWithAttrs(element, {
  base: 'data-',
  obj: '${base}obj',
  _obj: { instanceOf: 'Object' }
  // Error: Failed to parse JSON: "{invalid}"
});

// Invalid number
// HTML: <div data-count="abc"></div>
parseWithAttrs(element, {
  base: 'data-',
  count: '${base}count',
  _count: { instanceOf: 'Number' }
  // Error: Failed to parse number: "abc"
});
```

</details>

**Base Attribute Validation:**

The `base` attribute must contain either a dash (`-`) or a non-ASCII character to prevent conflicts with native attributes:

```TypeScript
// Valid base attributes
const enhConfig1 = { base: 'data-config' };     // Has dash
const enhConfig2 =  { base: '🎨-theme' });        // Has non-ASCII (and dash)

// Invalid - throws error
const enhConig3 = { base: 'config' };          // No dash or non-ASCII
```


<details>
  <summary>AttrPatterns Configuration</summary>

The `parseWithAttrs` function accepts an `AttrPatterns` object that defines:

1. **Attribute name templates**: String values with `${variable}` placeholders
2. **Configuration objects**: Properties prefixed with `_` that specify parsing behavior

```TypeScript
interface AttrPatterns<T> {
  base?: string;                    // Base attribute name prefix
  _base?: AttrConfig<T>;            // Configuration for base attribute
  [key: string]: string | AttrConfig<T>;  // Other attributes and configs
}

interface AttrConfig<T> {
  mapsTo?: keyof T | '.';           // Target property name (or '.' to spread)
  instanceOf?: string | Function;   // Type for default parser
  parser?: (v: string | null) => any;  // Custom parser function
}
```

### Template Variables

Attribute names support template variables using `${varName}` syntax:

```TypeScript
// HTML: <div data-user-name="Alice" data-user-age="30"></div>

const result = parseWithAttrs(element, {
  base: 'data-',
  user: '${base}user',
  name: '${user}-name',
  age: '${user}-age'
});
// Result: { name: 'Alice', age: '30' }
```

Template variables are resolved recursively and cached for performance. Circular references are detected and throw an error.

### Type Parsing with instanceOf

The `instanceOf` property determines how attribute values are parsed:

```TypeScript
// HTML: <div data-count="42" data-active data-tags='["a","b"]'></div>

const result = parseWithAttrs(element, {
  base: 'data-',
  count: '${base}count',
  _count: { instanceOf: 'Number' },
  
  active: '${base}active',
  _active: { instanceOf: 'Boolean' },  // Presence check
  
  tags: '${base}-tags',
  _tags: { instanceOf: 'Array' }
});
// Result: { count: 42, active: true, tags: ['a', 'b'] }
```

**Built-in type parsers:**
- `String`: Identity (default)
- `Number`: Parses numeric values, throws on invalid numbers
- `Boolean`: Presence check (attribute exists = true)
- `Object`: Parses JSON objects
- `Array`: Parses JSON arrays

### Custom Parsers

Provide a custom `parser` function for specialized parsing:

```TypeScript
// HTML: <div data-timestamp="2024-01-15T10:30:00Z"></div>

const result = parseWithAttrs(element, {
  base: 'data-',
  timestamp: '${base}timestamp',
  _timestamp: {
    mapsTo: 'createdAt',
    parser: (v) => v ? new Date(v).getTime() : null
  }
});
// Result: { createdAt: 1705315800000 }
```

### Named Parsers for Reusability and JSON Serialization

Instead of inline functions, you can reference parsers by name, making configs JSON serializable and parsers reusable:

```TypeScript
import { globalParserRegistry, parseWithAttrs } from 'assign-gingerly';

// Register parsers once (typically in app initialization)
globalParserRegistry.register('timestamp', (v) => 
  v ? new Date(v).getTime() : null
);

globalParserRegistry.register('csv', (v) => 
  v ? v.split(',').map(s => s.trim()) : []
);

// Use by name - config is now JSON serializable!
const config = {
  base: 'data-',
  created: '${base}created',
  _created: {
    parser: 'timestamp'  // String reference instead of function
  },
  tags: '${base}tags',
  _tags: {
    parser: 'csv'
  }
};

// Can serialize to JSON
const json = JSON.stringify(config);

// Use the config
const result = parseWithAttrs(element, config);
```

**Built-in Named Parsers:**

The following parsers are pre-registered in `globalParserRegistry`:

- `'timestamp'` - Parses ISO date string to Unix timestamp (milliseconds)
- `'date'` - Parses string to Date object
- `'csv'` - Splits comma-separated values into trimmed array
- `'int'` - Parses integer with `parseInt(v, 10)`
- `'float'` - Parses float with `parseFloat(v)`
- `'boolean'` - Presence check (same as `instanceOf: 'Boolean'`)
- `'json'` - Parses JSON (same as `instanceOf: 'Object'` or `'Array'`)

**Custom Element Static Method Parsers:**

You can also reference static methods on custom elements using dot notation:

```TypeScript
class MyWidget extends HTMLElement {
  static parseSpecialFormat(v) {
    return v ? v.toUpperCase() : null;
  }
  
  static parseWithPrefix(v) {
    return v ? `PREFIX:${v}` : null;
  }
}
customElements.define('my-widget', MyWidget);

// Reference custom element parsers
const config = {
  base: 'data-',
  value: '${base}value',
  _value: {
    parser: 'my-widget.parseSpecialFormat'  // element-name.methodName
  }
};
```

**Parser Resolution Order:**

When a string parser is specified:

1. **Check for dot notation** - If parser contains `.`, try to resolve as `element-name.methodName`
2. **Try custom element** - Look up element in `customElements` registry and check for static method
3. **Fall back to global registry** - If custom element not found, check `globalParserRegistry`
4. **Throw error** - If not found anywhere, throw descriptive error

This allows:
- Element-specific parsers to be scoped to their custom elements
- Fallback to global registry for shared parsers
- Dot notation in global registry names (e.g., `'utils.parseDate'`)

**Example: Organizing Parsers**

```TypeScript
// parsers.js - Centralized parser definitions
export function registerCommonParsers(registry) {
  registry.register('uppercase', (v) => v ? v.toUpperCase() : null);
  registry.register('lowercase', (v) => v ? v.toLowerCase() : null);
  registry.register('trim', (v) => v ? v.trim() : null);
  registry.register('phone', (v) => v ? v.replace(/\D/g, '') : null);
}

// app.js - Register at startup
import { globalParserRegistry } from 'assign-gingerly';
import { registerCommonParsers } from './parsers.js';

registerCommonParsers(globalParserRegistry);

// Now all configs can use these parsers by name
```

**Benefits of Named Parsers:**

- ✅ **JSON serializable** - Configs can be stored/transmitted as JSON
- ✅ **Reusable** - Define once, use everywhere
- ✅ **Maintainable** - Update parser logic in one place
- ✅ **Testable** - Test parsers independently
- ✅ **Discoverable** - `globalParserRegistry.getNames()` lists all available parsers
- ✅ **Backward compatible** - Inline functions still work

**Mixing Inline and Named Parsers:**

```TypeScript
const config = {
  base: 'data-',
  created: '${base}created',
  _created: {
    parser: 'timestamp'  // Named parser
  },
  special: '${base}special',
  _special: {
    parser: (v) => v ? v.split('').reverse().join('') : null  // Inline
  }
};
```

### Property Mapping with mapsTo

The `mapsTo` property controls where parsed values are placed:

```TypeScript
// HTML: <div data-count="5"></div>

const result = parseWithAttrs(element, {
  base: 'data-',
  count: '${base}count',
  _count: {
    instanceOf: 'Number',
    mapsTo: 'itemCount'  // Maps to different property name
  }
});
// Result: { itemCount: 5 }
```

**Special value `'.'`**: Spreads the parsed object into the root:

```TypeScript
// HTML: <div data-config='{"theme":"dark","lang":"en"}'></div>

const result = parseWithAttrs(element, {
  base: 'data-config',
  _base: {
    instanceOf: 'Object',
    mapsTo: '.'  // Spread into root
  }
});
// Result: { theme: 'dark', lang: 'en' }
```

### Default Values with valIfNull

The `valIfNull` property allows you to specify default values when attributes are missing:

```TypeScript
// HTML: <div></div>  (no attributes)

const result = parseWithAttrs(element, {
  base: 'data-',
  theme: '${base}theme',
  _theme: {
    instanceOf: 'String',
    valIfNull: 'light'  // Default when attribute is missing
  },
  count: '${base}count',
  _count: {
    instanceOf: 'Number',
    valIfNull: 0  // Default to 0
  }
});
// Result: { theme: 'light', count: 0 }
```

**How it works:**
- **Attribute missing**: If the attribute doesn't exist and `valIfNull` is defined, the default value is used **without calling the parser**
- **Attribute present**: If the attribute exists (even if empty string), the parser is called normally and `valIfNull` is ignored
- **No valIfNull**: If `valIfNull` is undefined and the attribute is missing, the property is not added to the result (current behavior)

**Important notes:**
1. **Parser is bypassed**: When `valIfNull` is used, the parser is NOT called - the default value is used as-is
2. **Empty string vs missing**: `valIfNull` only applies when the attribute is completely absent. If the attribute exists but is empty (`data-count=""`), the parser IS called
3. **Any value allowed**: `valIfNull` can be any JavaScript value: string, number, boolean, object, array, null, etc.
4. **Falsy values work**: Even falsy values like `0`, `false`, `''`, or `null` are valid defaults

**Examples with different types:**

```TypeScript
// Object default
const result1 = parseWithAttrs(element, {
  base: 'config-',
  settings: '${base}settings',
  _settings: {
    instanceOf: 'Object',
    valIfNull: { enabled: false, mode: 'auto' }
  }
});
// Result: { settings: { enabled: false, mode: 'auto' } }

// Boolean default
const result2 = parseWithAttrs(element, {
  base: 'feature-',
  enabled: '${base}enabled',
  _enabled: {
    instanceOf: 'Boolean',
    valIfNull: false
  }
});
// Result: { enabled: false }

// Array default
const result3 = parseWithAttrs(element, {
  base: 'data-',
  items: '${base}items',
  _items: {
    instanceOf: 'Array',
    valIfNull: []
  }
});
// Result: { items: [] }

// null as default
const result4 = parseWithAttrs(element, {
  base: 'data-',
  value: '${base}value',
  _value: {
    instanceOf: 'String',
    valIfNull: null
  }
});
// Result: { value: null }
```

**Comparison: Empty string vs missing attribute:**

```html
<!-- Attribute is missing -->
<div></div>

<!-- Attribute exists but is empty -->
<div data-count=""></div>
```

```TypeScript
const config = {
  base: 'data-',
  count: '${base}count',
  _count: {
    instanceOf: 'Number',
    valIfNull: 99
  }
};

// Missing attribute - uses valIfNull
const result1 = parseWithAttrs(document.querySelector('div:nth-child(1)'), config);
// Result: { count: 99 }

// Empty string - calls parser (returns null for empty Number)
const result2 = parseWithAttrs(document.querySelector('div:nth-child(2)'), config);
// Result: { count: null }
```

### Performance Optimization with parseCache

The `parseCache` property enables caching of parsed attribute values to improve performance when the same attribute values appear repeatedly throughout the document:

```TypeScript
// HTML: Multiple elements with same attribute values
// <div data-config='{"theme":"dark","size":"large"}'></div>
// <div data-config='{"theme":"dark","size":"large"}'></div>
// <div data-config='{"theme":"dark","size":"large"}'></div>

const config = {
  base: 'data-',
  config: '${base}config',
  _config: {
    instanceOf: 'Object',
    parseCache: 'shared'  // Cache and reuse parsed objects
  }
};

// First parse - parses and caches
const result1 = parseWithAttrs(element1, config);

// Subsequent parses - returns cached value (no parsing)
const result2 = parseWithAttrs(element2, config);
const result3 = parseWithAttrs(element3, config);
```

**Cache Strategies:**

1. **`'shared'`**: Returns the same object reference from cache
   - **Fastest**: No cloning overhead
   - **Risk**: Enhancements that mutate the object will affect all instances
   - **Best for**: Immutable data or when you trust enhancements not to mutate

2. **`'cloned'`**: Returns a structural clone of the cached object
   - **Safer**: Each instance gets its own copy
   - **Slower**: Uses `structuredClone()` which has overhead
   - **Best for**: Mutable data or when enhancements might modify values

**Examples:**

```TypeScript
// Shared cache - fast but requires discipline
const sharedConfig = {
  base: 'data-',
  settings: '${base}settings',
  _settings: {
    instanceOf: 'Object',
    parseCache: 'shared'  // All instances share same object
  }
};

// Cloned cache - safer for mutable data
const clonedConfig = {
  base: 'data-',
  state: '${base}state',
  _state: {
    instanceOf: 'Object',
    parseCache: 'cloned'  // Each instance gets a copy
  }
};

// Custom parser with caching
let parseCount = 0;
const customConfig = {
  base: 'data-',
  timestamp: '${base}timestamp',
  _timestamp: {
    parser: (v) => {
      parseCount++;  // Track parse calls
      return v ? new Date(v).getTime() : null;
    },
    parseCache: 'shared'  // Parser only called once per unique value
  }
};
```

**Important Notes:**

1. **Parser purity**: Parsers should be pure functions (no side effects) when using caching
2. **Boolean types**: Caching is skipped for Boolean types (presence check doesn't benefit)
3. **Cache scope**: Cache is module-level and persists across all `parseWithAttrs()` calls
4. **Cache key**: Values are cached per `(instanceOf, parserType, attributeValue)` tuple
5. **Memory**: Cache grows with unique attribute values encountered (no automatic cleanup)
6. **Browser support**: `'cloned'` strategy requires `structuredClone()` (modern browsers)

**Performance Considerations:**

- **Shared cache**: Best for simple objects, arrays, or when parsing is expensive
- **Cloned cache**: Overhead may negate benefits for simple values (strings, numbers)
- **No cache**: Better for unique values or when parsing is trivial
- **Custom parsers**: Caching is most beneficial when parser does expensive operations (Date parsing, complex transformations)

**Example: Shared cache mutation risk**

```TypeScript
const config = {
  base: 'data-',
  items: '${base}items',
  _items: {
    instanceOf: 'Array',
    parseCache: 'shared'
  }
};

// HTML: <div data-items='[1,2,3]'></div>

const result1 = parseWithAttrs(element1, config);
result1.items.push(4);  // Mutation!

const result2 = parseWithAttrs(element2, config);
console.log(result2.items);  // [1,2,3,4] - mutation is visible!
```

**Example: Cloned cache safety**

```TypeScript
const config = {
  base: 'data-',
  items: '${base}items',
  _items: {
    instanceOf: 'Array',
    parseCache: 'cloned'  // Safe from mutations
  }
};

const result1 = parseWithAttrs(element1, config);
result1.items.push(4);  // Mutation

const result2 = parseWithAttrs(element2, config);
console.log(result2.items);  // [1,2,3] - original value preserved
```

### Base Attribute

The special `base` property handles a single attribute that spreads into the result:

```TypeScript
// HTML: <div data-greetings='{"hello":"world","goodbye":"Mars"}'></div>

const result = parseWithAttrs(element, {
  base: 'data-greetings'
  // Default: spreads into root with Object parser
});
// Result: { hello: 'world', goodbye: 'Mars' }

// With custom mapsTo:
const result2 = parseWithAttrs(element, {
  base: 'data-greetings',
  _base: {
    mapsTo: 'greetings',
    instanceOf: 'Object'
  }
});
// Result: { greetings: { hello: 'world', goodbye: 'Mars' } }
```

### Best Practices

1. **Use base for common prefixes**: Reduces repetition in attribute names
2. **Leverage template variables**: Build complex attribute names from simple parts
3. **Specify instanceOf**: Ensures proper type conversion
4. **Use mapsTo for clarity**: Map attribute names to meaningful property names
5. **Combine with assignGingerly**: Use nested paths (`?.`) for deep property assignment
6. **Handle missing attributes**: Non-existent attributes are skipped (except Boolean types)

### Nested Paths with assignGingerly

Combine `parseWithAttrs` with `assignGingerly` for nested property assignment:

```TypeScript
// HTML: <div data-height="100px" data--is-happy></div>

const element = document.createElement('div');
const attrs = parseWithAttrs(element, {
  base: 'data-',
  height: '${base}height',
  _height: {
    mapsTo: '?.style?.height'
  },
  isHappy: '${base}-is-happy',
  _isHappy: {
    instanceOf: 'Boolean',
    mapsTo: '?.moods?.personIsHappy'
  }
});

assignGingerly(element, attrs);
// element.style.height === '100px'
// element.moods.personIsHappy === true
```

</details>

## Building CSS Queries with `buildCSSQuery`

The `buildCSSQuery` function generates CSS selector strings that match elements with attributes defined in an enhancement configuration's `withAttrs`. This is particularly useful for libraries like mount-observer that need to find elements that should be enhanced.

### Basic Usage

```TypeScript
import { buildCSSQuery } from 'assign-gingerly';

const config = {
  spawn: MyEnhancement,
  withAttrs: {
    base: 'my-component',
    theme: '${base}-theme'
  }
};

const query = buildCSSQuery(config, 'div, span');
console.log(query);
// 'div[my-component], span[my-component], div[enh-my-component], span[enh-my-component], 
//  div[my-component-theme], span[my-component-theme], div[enh-my-component-theme], span[enh-my-component-theme]'

// Use with querySelector
const elements = document.querySelectorAll(query);
```

### How It Works

`buildCSSQuery` creates a cross-product of:
1. **Selectors**: The CSS selectors you provide (e.g., `'div, span'`)
2. **Attributes**: All attribute names from `withAttrs` (resolving template variables)
3. **Prefixes**: Both unprefixed and `enh-` prefixed versions

This ensures you find all elements that might be enhanced, regardless of whether they use the `enh-` prefix or not.

### Template Variable Resolution

Template variables in `withAttrs` are automatically resolved:

```TypeScript
const config = {
  spawn: BeABeacon,
  withAttrs: {
    base: 'be-a-beacon',
    theme: '${base}-theme',
    size: '${base}-size'
  }
};

buildCSSQuery(config, 'template, script');
// Returns selectors for: be-a-beacon, be-a-beacon-theme, be-a-beacon-size
// Each with both prefixed and unprefixed versions
```

### Complex Selectors

The function supports any valid CSS selector:

```TypeScript
const config = {
  spawn: MyEnhancement,
  withAttrs: {
    base: 'data-enhanced'
  }
};

// Classes and IDs
buildCSSQuery(config, 'div.highlight, span#special');
// 'div.highlight[data-enhanced], span#special[data-enhanced], ...'

// Combinators
buildCSSQuery(config, 'div > span, ul li');
// 'div > span[data-enhanced], ul li[data-enhanced], ...'

// Pseudo-classes
buildCSSQuery(config, 'div:hover, span:first-child');
// 'div:hover[data-enhanced], span:first-child[data-enhanced], ...'

// Attribute selectors
buildCSSQuery(config, 'div[existing-attr]');
// 'div[existing-attr][data-enhanced], ...'
```

### Underscore-Prefixed Keys Excluded

Configuration keys starting with `_` are excluded from the query:

```TypeScript
const config = {
  spawn: MyEnhancement,
  withAttrs: {
    base: 'my-attr',
    _base: {
      mapsTo: 'something'  // Config only, not an attribute
    },
    theme: '${base}-theme',
    _theme: {
      instanceOf: 'String'  // Config only
    }
  }
};

buildCSSQuery(config, 'div');
// Only includes: my-attr and my-attr-theme
// Does NOT include: _base or _theme
```

### Edge Cases

**Empty inputs return empty string:**
```TypeScript
buildCSSQuery({ spawn: MyClass }, 'div');  // '' (no withAttrs)
buildCSSQuery({ spawn: MyClass, withAttrs: {} }, 'div');  // '' (empty withAttrs)
buildCSSQuery({ spawn: MyClass, withAttrs: { base: 'x' } }, '');  // '' (empty selectors)
```

**Deduplication:**
```TypeScript
buildCSSQuery(config, 'div, div, div');
// Duplicates are removed automatically
```

**Whitespace handling:**
```TypeScript
buildCSSQuery(config, '  div  ,  span  ,  p  ');
// Whitespace is trimmed automatically
```

### Use Cases

1. **Mount Observer Integration**: Find elements that need enhancement
   ```TypeScript
   const query = buildCSSQuery(enhancementConfig, '*');
   const observer = new MutationObserver(() => {
     const elements = document.querySelectorAll(query);
     elements.forEach(el => enhance(el));
   });
   ```

2. **Batch Enhancement**: Enhance all matching elements at once
   ```TypeScript
   const query = buildCSSQuery(config, 'template, script');
   document.querySelectorAll(query).forEach(el => {
     const instance = el.enh.get(config);
   });
   ```

3. **Conditional Enhancement**: Find elements in specific contexts
   ```TypeScript
   const query = buildCSSQuery(config, '.container > div');
   const elements = document.querySelectorAll(query);
   ```

### API Reference

```TypeScript
function buildCSSQuery(
  config: EnhancementConfig,
  selectors: string
): string
```

**Parameters:**
- `config`: Enhancement configuration with `withAttrs` property
- `selectors`: Comma-separated CSS selectors (e.g., `'div, span'`)

**Returns:**
- CSS query string with cross-product of selectors and attributes
- Empty string if `withAttrs` is missing or empty

**Throws:**
- Error if template variables have circular references
- Error if template variables reference undefined keys

### Performance Notes

- The function is synchronous and fast
- Resulting queries can be long with many attributes, but CSS engines handle this efficiently
- Queries are deduplicated automatically
- Consider caching the result if calling repeatedly with the same config

<!--

### Complete Example

```TypeScript
// HTML: <user-card 
//   data-config='{"theme":"dark"}' 
//   data-config-name="Alice" 
//   data-config-age="30" 
//   data-config-active
// ></user-card>

const element = document.querySelector('user-card');
const result = parseWithAttrs(element, {
  base: 'data-config',
  _base: {
    mapsTo: 'settings',
    instanceOf: 'Object'
  },
  name: '${base}-name',
  age: '${base}-age',
  _age: {
    instanceOf: 'Number',
    mapsTo: 'userAge'
  },
  active: '${base}-active',
  _active: {
    instanceOf: 'Boolean',
    mapsTo: 'isActive'
  }
});

console.log(result);
// {
//   settings: { theme: 'dark' },
//   name: 'Alice',
//   userAge: 30,
//   isActive: true
// }
```

-->




