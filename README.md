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

## Custom Registries

On top of that, this polyfill package builds on the newly minted Custom Element Registry, adding additional sub-registries:

1.  [enhancementRegistry](#enhancement-registry-addendum-to-the-custom-element-registry) object on top of the customElementRegistry object associated with all elements, to be able to lazy load object extensions on demand while avoiding namespace conflicts, and, importantly, as a basis for defining custom attributes associated with the enhancements.

2.  [itemscopeRegistry for Itemscope Managers](#itemscoperegistry) to automatically associate a function prototype or class instance with the itemscope attribute of an HTMLElement.

3.  [featuresRegistry for Custom Element Features](#custom-element-features) to support dependency injection of composable feature classes or function prototypes onto custom element prototypes via lazy getters.

So in our view this package helps fill the void left by not supporting the "is" attribute for built-in elements (but is not a complete solution, just a critical building block).  Mount-observer and custom enhancements builds on top of the critical role that assign-gingerly plays.

Anyway, let's start out detailing the more innocent features of this package / polyfill.

The two utility functions are:

## assignGingerly

assignGingerly builds on Object.assign.  Like Object.assign, the object getting assigned can often be a JSON stringified object.  Some of the unusual syntax we see with assignGingerly is there to continue to support JSON deserialized objects as a viable argument to be passed.  

assign-gingerly adds support for:

1.  Carefully merging in nested properties.
2.  Dependency injection based on a mapping protocol.

The second fundamental utility function is:

## assignTentatively

assignTentatively provides a far more limited subset of functionality compared to assignGingerly.   The tradeoff is that assignTentatively can do something important assignGingerly cannot do -- be "reversed". This can be quite useful for some scenarios.  Think of how css "turns on" visual effects while conditions are met, then reverts to how things were before the conditions were met when the conditions are no longer met, as if nothing happened.  Another example is allowing user edits to be rolled back as they repeatedly hit "ctrl+z".

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

When the right hand side of an expression is an object, assignGingerly behavior depends on the context:
- For **nested paths** (starting with `?.`): recursively merges into nested objects, creating them if needed
- For **plain keys**: performs simple assignment (like `Object.assign`), unless the target property is readonly, an accessor, or the current value's class defines [`static assignTo`](#custom-assignment-with-static-assignto-protocol) (see Examples 3a, 3b, and the assignTo section below)

Of course, just as Object.assign led to object spread notation, assignGingerly could lead to some sort of deep structural JavaScript syntax, but that is outside the scope of this polyfill package.

## Example 3-plain - Plain Key Object Assignment

For plain keys (without `?.` prefix), assignGingerly performs simple assignment, just like `Object.assign`:

```TypeScript
const obj = {};
const template = document.createElement('template');
template.innerHTML = '<div>Hello</div>';

assignGingerly(obj, {
    template: template,
    config: { theme: 'dark', lang: 'en' }
});

console.log(obj.template === template); // true - direct assignment
console.log(obj.config); // { theme: 'dark', lang: 'en' } - direct assignment
```

This is different from nested paths, which create intermediate objects:

```TypeScript
const obj = {};
assignGingerly(obj, {
    '?.config?.theme': 'dark'
});
console.log(obj.config); // { theme: 'dark' } - intermediate object created
```

## Example 3a - Automatic Readonly Property Detection

assignGingerly automatically detects readonly properties and merges into them instead of attempting to replace them. This makes working with DOM properties like `dataset` ergonomic:

```TypeScript
const div = document.createElement('div');
assignGingerly(div, {
    dataset: {
        userId: '123',
        userName: 'Alice'
    }
});
console.log(div.dataset.userId);   // '123'
console.log(div.dataset.userName); // 'Alice'
```

**How it works:**

When assignGingerly encounters an object value being assigned to an existing property, it checks if that property is readonly:
- **Data properties** with `writable: false`
- **Accessor properties** with a getter but no setter (e.g., `dataset`, `shadowRoot`)

If the property is readonly and its current value is an object, assignGingerly automatically merges into it recursively.

**Note on `element.style`:** The `style` property has both a getter and a setter, so it is *not* treated as readonly. Use nested path syntax instead:

```TypeScript
// Use nested path syntax for style
assignGingerly(div, {
    '?.style?.height': '15px',
    '?.style?.width': '20px'
});
```

**Examples of readonly properties that trigger merging:**
- `HTMLElement.dataset` - getter only, no setter
- Custom objects with `Object.defineProperty(obj, 'prop', { value: {}, writable: false })`
- Accessor properties with getter only: `Object.defineProperty(obj, 'prop', { get() { return {}; } })`

**Error handling:**

If you try to merge an object into a readonly property whose current value is a primitive, assignGingerly throws a descriptive error:

```TypeScript
const obj = {};
Object.defineProperty(obj, 'readonlyString', {
    value: 'immutable',
    writable: false
});

assignGingerly(obj, {
    readonlyString: { nested: 'value' }
});
// Error: Cannot merge object into readonly primitive property 'readonlyString'
```

**Additional examples:**

```TypeScript
// Dataset property
const div = document.createElement('div');
assignGingerly(div, {
    dataset: {
        userId: '123',
        userName: 'Alice'
    }
});
console.log(div.dataset.userId);   // '123'
console.log(div.dataset.userName); // 'Alice'

// Custom readonly property
const config = {};
Object.defineProperty(config, 'settings', {
    value: {},
    writable: false
});
assignGingerly(config, {
    settings: {
        theme: 'dark',
        lang: 'en'
    }
});
console.log(config.settings.theme); // 'dark'
```

## Example 3b - Class Instances Are Normally Replaced

Unlike readonly/accessor properties, class instances on writable properties are **replaced** by simple assignment, just like plain objects. This allows you to swap one object for another without unexpected merging:

```TypeScript
class FakeDocumentFragment {
  constructor() {
    this.nodeType = 11;
    this.childNodes = [];
  }
}

const obj = {
  clone: new FakeDocumentFragment()
};

const element = document.createElement('div');

// Replace the DocumentFragment with the actual element
assignGingerly(obj, {
  clone: element
});

console.log(obj.clone === element); // true - replaced, not merged
```

**Why replacement instead of merging?**

In real-world use cases, you often need to replace one object with another of a completely different type. For example, replacing a cloned DocumentFragment with the actual web component element. Automatic merging would corrupt the target by mixing properties from incompatible types.

**Exception: classes with `static assignTo`**

If the current value is an instance of a class that defines [`static assignTo`](#custom-assignment-with-static-assignto-protocol), that method is called instead of replacing. This allows classes to opt into custom assignment behavior (e.g., reactive models, validated records, iterable collections with private lists):

```TypeScript
class TodoList {
    #items = [];
    *[Symbol.iterator]() { yield* this.#items; }
    static assignTo(instance, rhs) {
        if (Array.isArray(rhs)) instance.#items = [...rhs];
        else Object.assign(instance, rhs);
    }
}

const app = { todos: new TodoList() };
assignGingerly(app, { todos: ['Buy milk', 'Walk dog'] });
// TodoList.assignTo is called — replaces internal list, not the instance
console.log([...app.todos]); // ['Buy milk', 'Walk dog']
console.log(app.todos instanceof TodoList); // true — instance preserved
```

**Readonly/accessor properties are still merged:**

The distinction is clear:
- **Writable data properties**: replaced (unless class defines `static assignTo`)
- **Readonly data properties** (`writable: false`): merged into
- **Getter-only accessor properties** (no setter): merged into
- **Getter+setter accessor properties** (e.g., `style`): setter runs with the value as-is

```TypeScript
const div = document.createElement('div');

assignGingerly(div, {
  dataset: { userId: '123' },       // Getter-only - merged
  '?.style?.height': '100px'        // Use nested path for style
});

console.log(div.dataset.userId);  // '123'
console.log(div.style.height);    // '100px'
```

## Example 3c - Method Calls with withMethods

The `withMethods` option allows you to call methods as part of property assignment, which is particularly useful for DOM APIs like `classList` and `part`:

```TypeScript
import assignGingerly from 'assign-gingerly';

const element = document.createElement('div');

// Simple method calls
assignGingerly(element, {
  '?.classList?.add': 'myClass',
  '?.part?.add': 'myPart'
}, { withMethods: ['add'] });

console.log(element.classList.contains('myClass')); // true
console.log(element.part.contains('myPart'));       // true
```

**How it works:**

When a path segment matches a name in the `withMethods` array/set:
- If it's the **last segment**: the method is called with the RHS value as an argument
- If it's a **middle segment** and the next segment is also a method: called with no arguments
- If it's a **middle segment** and the next segment is NOT a method: called with the next segment as a string argument
- If the property is not a function: silently skipped

**Array arguments:**

Arrays are spread as multiple arguments:

```TypeScript
assignGingerly(element, {
  '?.setAttribute': ['data-id', '123']
}, { withMethods: ['setAttribute'] });

// Equivalent to: element.setAttribute('data-id', '123')
```

**Chained method calls:**

Methods can be chained to navigate through object hierarchies:

```TypeScript
const elementRef = {
  deref() { return this.element; },
  element: document.createElement('div')
};

assignGingerly(elementRef, {
  '?.deref?.classList?.add': 'active'
}, { withMethods: ['deref', 'add'] });

// Equivalent to: elementRef.deref().classList.add('active')
```

**Complex chaining with real DOM elements:**

Methods are called on the objects found through chained accessors, not just on the root object:

```TypeScript
const div = document.createElement('div');
div.innerHTML = `
  <my-element>
    <your-element></your-element>
  </my-element>
`;

assignGingerly(div, {
  '?.querySelector?.my-element?.querySelector?.your-element?.classList?.add': 'highlighted'
}, { withMethods: ['querySelector', 'add'] });

// Equivalent to:
// div.querySelector('my-element').querySelector('your-element').classList.add('highlighted')

const yourElement = div.querySelector('my-element')?.querySelector('your-element');
console.log(yourElement?.classList.contains('highlighted')); // true
```

The key insight: `querySelector` is called on each intermediate result in the chain. First on `div`, then on the `my-element` result, demonstrating that methods work naturally with the object hierarchy you're navigating.

**Using Set for withMethods:**

For better performance with many methods, use a Set:

```TypeScript
const methods = new Set(['add', 'remove', 'toggle', 'setAttribute']);

assignGingerly(element, {
  '?.classList?.add': 'class1',
  '?.classList?.remove': 'class2',
  '?.setAttribute': ['data-value', '42']
}, { withMethods: methods });
```

**Mixing methods and normal assignments:**

```TypeScript
assignGingerly(element, {
  '?.classList?.add': 'active',
  '?.dataset?.userId': '123',
  '?.style?.height': '100px'
}, { withMethods: ['add'] });

// classList.add() is called
// dataset.userId and style.height are assigned normally
```

**Benefits:**

- Cleaner syntax for DOM manipulation
- Works with any object methods, not just DOM APIs
- Silent failure for non-existent methods (garbage in, garbage out)
- Supports method chaining and complex navigation patterns

## Example 3d - Aliasing with aka

The `aka` option allows you to define custom shortcuts (aliases) for property and method names, reducing verbosity in repetitive patterns. This is inspired by jQuery's `$` shortcut for `querySelectorAll`, but fully customizable.

```TypeScript
import assignGingerly from 'assign-gingerly';

const div = document.createElement('div');
div.innerHTML = `
  <my-element>
    <your-element></your-element>
  </my-element>
`;

// Without aliases (verbose)
assignGingerly(div, {
  '?.querySelector?.my-element?.classList?.add': 'highlighted',
  '?.querySelector?.your-element?.classList?.add': 'active'
}, { withMethods: ['querySelector', 'add'] });

// With aliases (concise)
assignGingerly(div, {
  '?.$?.my-element?.c?.+': 'highlighted',
  '?.$?.your-element?.c?.+': 'active'
}, { 
  withMethods: ['querySelector', 'add'],
  aka: { '$': 'querySelector', 'c': 'classList', '+': 'add' }
});
```

**How it works:**

- Aliases are substituted **before** path evaluation
- Matches complete tokens between `?.` delimiters (not substrings)
- Works for both properties and methods
- Single or multi-character aliases supported

**Reserved characters:**

Cannot be used in aliases: space (` `), backtick (`` ` ``)

**Multi-character aliases:**

```TypeScript
assignGingerly(element, {
  '?.qs?.my-element?.cl?.add': 'highlighted'
}, { 
  withMethods: ['querySelector', 'add'],
  aka: { 'qs': 'querySelector', 'cl': 'classList' }
});
```

**Multiple aliases in one path:**

```TypeScript
assignGingerly(element, {
  '?.c?.+': 'class1',
  '?.p?.+': 'part1',
  '?.ds?.userId': '123'
}, { 
  withMethods: ['add'],
  aka: { 
    'c': 'classList', 
    'p': 'part',
    'ds': 'dataset',
    '+': 'add'
  }
});

// Equivalent to:
// element.classList.add('class1')
// element.part.add('part1')
// element.dataset.userId = '123'
```

**Benefits:**

- Reduces verbosity in repetitive patterns
- Fully customizable shortcuts
- Improves readability when you have many similar operations
- Works seamlessly with `withMethods`

## Example 3e - ForEach with @each

The `@each` symbol allows you to iterate over collections and apply operations to each item. This works with any iterable including Arrays, NodeList, HTMLCollection, and more.

```TypeScript
import assignGingerly from 'assign-gingerly';

const div = document.createElement('div');
div.innerHTML = `
  <my-element></my-element>
  <my-element></my-element>
  <my-element></my-element>
`;

// Apply to each element in the collection
assignGingerly(div, {
  '?.querySelectorAll?.my-element?.@each?.classList?.add': 'highlighted'
}, { withMethods: ['querySelectorAll', 'add'] });

// All my-element elements now have the 'highlighted' class
```

**How it works:**

- `@each` marks the point where iteration begins
- Everything before `@each` navigates to the iterable
- Everything after `@each` is applied to each item in the collection
- Empty collections are handled gracefully (no errors)

**With regular arrays:**

```TypeScript
const obj = {
  items: [
    { value: null },
    { value: null },
    { value: null }
  ]
};

assignGingerly(obj, {
  '?.items?.@each?.value': 'test'
});

// All items now have value: 'test'
```

**Nested forEach:**

```TypeScript
const obj = {
  groups: [
    { items: [{ value: null }, { value: null }] },
    { items: [{ value: null }, { value: null }] }
  ]
};

assignGingerly(obj, {
  '?.groups?.@each?.items?.@each?.value': 'nested'
});

// All nested items now have value: 'nested'
```

**With aliases:**

```TypeScript
assignGingerly(div, {
  '?.qsa?.my-element?.*?.c?.+': 'highlighted'
}, { 
  withMethods: ['querySelectorAll', 'add'],
  aka: { 
    'qsa': 'querySelectorAll',
    'c': 'classList',
    '+': 'add',
    '*': '@each'  // Alias * to @each for brevity
  }
});
```

**Method calls on each item:**

```TypeScript
assignGingerly(div, {
  '?.querySelectorAll?.div?.@each?.setAttribute': ['data-id', '123']
}, { withMethods: ['querySelectorAll', 'setAttribute'] });

// All div elements now have data-id="123"
```

**Accessing iterable properties:**

When you omit `@each`, you access properties on the iterable itself, not its items:

```TypeScript
const obj = {
  items: [1, 2, 3],
  customProp: null
};

// Set property on the array itself
assignGingerly(obj, {
  '?.items?.customProp': 'test'
});

console.log(obj.items.customProp); // 'test'
```

**Benefits:**

- Works with any iterable (Arrays, NodeList, HTMLCollection, etc.)
- Supports nested iterations
- Integrates seamlessly with `withMethods` and `aka`
- Clear distinction between iterating and accessing iterable properties
- Graceful handling of empty collections

## Example 3f - Reactive Iteration with @eachTime

The `@eachTime` symbol enables reactive iteration over elements as they mount or appear dynamically. Unlike `@each` which operates on static collections, `@eachTime` subscribes to events and applies operations to elements as they arrive over time.

**Important:** This feature requires an `AbortSignal` for cleanup and is designed to work with EventTarget objects that emit 'mount' events (such as [mount-observer](https://github.com/bahrus/mount-observer)).

```TypeScript
import assignGingerly from 'assign-gingerly';

const controller = new AbortController();
const div = document.createElement('div');

// Assume mountObserver is an IMountObserver instance that emits 'mount' events
// when new elements matching 'my-element' are added to the DOM

assignGingerly(div, {
  '?.mountObserver?.@eachTime?.classList?.add': 'highlighted'
}, { 
  withMethods: ['add'],
  signal: controller.signal  // Required for cleanup
});

// As elements mount, they automatically get the 'highlighted' class
// Later, cleanup all listeners:
controller.abort();
```

**How it works:**

- `@eachTime` marks the point where reactive iteration begins
- Everything before `@eachTime` must navigate to an EventTarget
- The EventTarget must emit 'mount' events with a `mountedElement` property
- Everything after `@eachTime` is applied to each mounted element
- Event listeners are automatically cleaned up when the AbortSignal is aborted

**With method calls:**

```TypeScript
const controller = new AbortController();

assignGingerly(div, {
  '?.mountObserver?.@eachTime?.setAttribute': ['data-mounted', 'true']
}, { 
  withMethods: ['setAttribute'],
  signal: controller.signal
});

// Each mounted element gets data-mounted="true"
```

**With aliases:**

```TypeScript
const controller = new AbortController();

assignGingerly(div, {
  '?.mo?.@*?.c?.+': 'active'
}, { 
  withMethods: ['add'],
  aka: { 
    'mo': 'mountObserver',
    '@*': '@eachTime',
    'c': 'classList',
    '+': 'add'
  },
  signal: controller.signal
});
```

**Cleanup is required:**

```TypeScript
const controller = new AbortController();

// Setup reactive iteration
assignGingerly(div, {
  '?.mountObserver?.@eachTime?.classList?.add': 'mounted'
}, { 
  withMethods: ['add'],
  signal: controller.signal
});

// Later, when you're done observing:
controller.abort();  // Removes all event listeners

// Attempting to use @eachTime without a signal throws an error:
assignGingerly(div, {
  '?.mountObserver?.@eachTime?.classList?.add': 'mounted'
}, { withMethods: ['add'] });
// Error: @eachTime requires an AbortSignal in options.signal for cleanup
```

**Key differences from @each:**

| Feature | @each | @eachTime |
|---------|-------|-----------|
| **Type** | Static iteration | Reactive iteration |
| **Timing** | Immediate (synchronous) | Over time (asynchronous) |
| **Use case** | Existing collections | Elements appearing dynamically |
| **Cleanup** | Not needed | Required (AbortSignal) |
| **Requirements** | Any iterable | EventTarget with 'mount' events |

**Benefits:**

- Declarative reactive programming without RxJS complexity
- Automatic cleanup via standard AbortSignal API
- JSON-serializable configuration (behavior is in implementation)
- Fire-and-forget async pattern (doesn't block)
- Minimal weight impact (~3% when not used, dynamically loaded when needed)

**Limitations:**

- Requires EventTarget that emits 'mount' events
- AbortSignal is mandatory for cleanup
- Testing is done in mount-observer package (no tests in assign-gingerly)
- Single @eachTime per path (nested @eachTime not currently supported)

While we are in the business of passing values of object A into object B, we might as well add some extremely common behavior that allows updating properties of object B based on the current values of object B -- things like incrementing, toggling, and deleting.  Deleting is critical for assignTentatively, but is included with both functions.

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

The `+=` command syntax is `<path> +=` where the path uses the `?.` nested notation for nested properties, or a plain key for direct properties. The right-hand side value is added to the existing value using `+=`. If the path doesn't exist, it's created and set directly to the value.

**Behavior by type:**

| LHS type | RHS type | Result |
|----------|----------|--------|
| number | number | addition (`2 += 3` → `5`) |
| string | any | string concatenation (`"hello" += 3` → `"hello3"`) |
| array | array | array concatenation (`[1,2] += [3,4]` → `[1,2,3,4]`) |
| array | non-array | push single item (`[1,2] += 3` → `[1,2,3]`) |
| undefined/missing | any | direct assignment |

```TypeScript
const obj = {
    tags: ['a', 'b'],
    name: 'hello'
};
assignGingerly(obj, {
    '?.tags +=': ['c', 'd'],   // array concat: ['a', 'b', 'c', 'd']
    '?.name +=': ' world'      // string concat: 'hello world'
});

// Push a single item
assignGingerly(obj, { '?.tags +=': 'e' }); // ['a', 'b', 'c', 'd', 'e']
```

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

The `=!` command syntax is `<path> =!` where the path uses the `?.` nested notation for nested properties, or a plain key for direct properties.

For existing values, the toggle is performed using JavaScript's logical NOT operator (`!value`), regardless of what type it is.

## Example 6 - Deleting properties with -= command

The `-=` command allows us to delete properties from objects:

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

# Object and Element Enhancements via assign-gingerly

## Dependency injection based on a registry object and a Symbolic reference mapping

```Typescript
interface EnhancementConfig<T = any, TObjToExtend = any> {
    spawn: {new(objToExtend: TObjToExtend, ctx: SpawnContext, initVals: Partial<T>): T}
    symlinks?: {[key: symbol]: keyof T}
    // Optional: for element enhancement access
    enhKey?: string | symbol
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

class EnhancementRegistry{
    push(EnhancementConfig | EnhancementConfig[]){
        ...
    }
}

//Here's where the dependency injection mapping takes place
const EnhancementRegistry = new EnhancementRegistry;
EnhancementRegistry.push([
    {
        symlinks: {
            [isHappy]: 'isHappy'
        },
        spawn: MyEnhancement,
    },{
       enhKey: 'mellowYellow',
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
    style:{
      height: '40px',
    }, 
    enh: {
      '?.mellowYellow?.madAboutFourteen': true
    }
    
}, {
    registry: EnhancementRegistry
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

const registry = new EnhancementRegistry();
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

const registry = new EnhancementRegistry();
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
    style: {
      height: '40px'
    }
    enh: {
      mellowYellow?.madAboutFourteen': true
    }
}, {
    registry: EnhancementRegistry
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

## Enhancement Registry Addendum to the Custom Element Registry

This package polyfill adds an "enhancementRegistry" registry on the CustomElementRegistry prototype.

In this way, we achieve dependency injection in harmony with scoped custom elements DOM registry scopes.

> [!NOTE]
> Safari/WebKit played a critical role in pushing scoped custom element registries forward, and announced with little fanfare or documentation that [Safari 26 supports it](https://developer.apple.com/documentation/safari-release-notes/safari-26-release-notes).  However, the Playwright test machinery's cross platform Safari test browser doesn't yet support it.  For now, only Chrome 146+ has been tested / vetted for this functionality.
>
> For more information about scoped custom element registries, see [Chrome's announcement and guide](https://developer.chrome.com/blog/scoped-registries).

<details>
  <summary>Automatic Registry Population</summary>

When `assignGingerly` or `assignTentatively` is called on an Element instance without providing an explicit `registry` option, it automatically uses the registry from `element.customElementRegistry.enhancementRegistry`:

```TypeScript
import 'assign-gingerly/object-extension.js';

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

Each `CustomElementRegistry` instance gets its own `enhancementRegistry` property via a lazy getter. The `EnhancementRegistry` instance is created on first access and cached for subsequent uses:

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
const customRegistry = new EnhancementRegistry();
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

The `enh.set` proxy allows us to assign properties to enhancements using a clean, chainable syntax:

```TypeScript
import 'assign-gingerly/object-extension.js';
//import { EnhancementRegistry } from 'assign-gingerly';

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

Element enhancement classes should follow this constructor signature:

```TypeScript
interface SpawnContext<T, TMountContext = any> {
  config: EnhancementConfig<T>;
  mountCtx?: TMountContext;  // Optional custom context passed by caller
}

class Enhancement<T> {
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

Note that the class need not extend any base class or leverage any mixins.  In fact, ES5 prototype functions can be used, and in both cases are instantiated using new ....  Arrow functions cannot be used.

<details>
<summary>Passing Custom Context</summary>

You can pass custom context when calling `enh.get()` or `enh.whenResolved()` (discussed in detail below):

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
interface EnhancementConfig<T, TObj = Element> {
  spawn: { 
    new (obj?: TObj, ctx?: SpawnContext<T>, initVals?: Partial<T>): T;
    canSpawn?: (obj: TObj, ctx?: SpawnContext<T>) => boolean;  // Optional spawn guard
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

The `EnhancementRegistry` class includes a `findByEnhKey` method:

```TypeScript
const registry = new EnhancementRegistry();
registry.push({
  spawn: MyEnhancement,
  enhKey: 'myEnh'
});

const item = registry.findByEnhKey('myEnh');
console.log(item.enhKey); // 'myEnh'
```
</details>

### Programmatic Instance Spawning with `enh.get()`

The `enh.get(registryItem)` method provides a programmatic way to spawn or retrieve previously instantiated enhancement instances:

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

**Lookup by enhKey (string or symbol):**

Instead of passing the full registry item object, you can pass a string or symbol matching the `enhKey` of a previously registered enhancement:

```TypeScript
// First, register the enhancement (e.g., via mount-observer or manually)
registry.push({
  spawn: MyEnhancement,
  enhKey: 'myEnh'
});

// Later, retrieve by enhKey string
const instance = element.enh.get('myEnh');

// Or by symbol enhKey
const enhSym = Symbol.for('myEnh');
const instance2 = element.enh.get(enhSym);
```

If the enhKey is not found in the registry, an error is thrown: `"myEnh not in registry"`.

This also works with `enh.dispose()` and `enh.whenResolved()`:

```TypeScript
// Dispose by enhKey
element.enh.dispose('myEnh');

// Wait for resolution by enhKey
const resolved = await element.enh.whenResolved('myEnh');
```

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

### Disposing Enhancement Instances with `enh.dispose(regItem)`

The `enh.dispose(regItem)` method provides a way to clean up and remove enhancement instances:

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

**How `enh.dispose(regItem)` works:**

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

#### Memory Management and When to Call Dispose

**Important: Understanding automatic vs manual cleanup**

The enhancement storage system uses a **WeakMap** to prevent memory leaks:

```TypeScript
// Global storage: WeakMap<Element, Map<EnhancementConfig, Instance>>
```

**What this means for memory:**

✅ **Automatic cleanup when elements are garbage collected:**
- When an element is GC'd, the WeakMap entry is automatically removed
- Both `enhKey` references (`element.enh[enhKey]`) and WeakMap entries are cleaned up
- **No memory leak from the storage mechanism itself**

⚠️ **Manual cleanup needed for enhancement internals:**
- Event listeners on global objects (window, document)
- Timers (setInterval, setTimeout)
- External registries or caches
- Network connections or subscriptions

**The challenge: Knowing WHEN to dispose**

JavaScript provides no way to detect when an element is about to be garbage collected. Additionally, DOM disconnection doesn't reliably indicate disposal:

```TypeScript
// Element disconnected - but should we dispose?
element.remove();

// Case 1: Temporarily removed, will be re-added
setTimeout(() => document.body.append(element), 1000);
// ? Don't dispose - enhancement should persist

// Case 2: Moved to another location
otherContainer.append(element);
// ? Don't dispose - enhancement should persist

// Case 3: Cached for reuse
elementCache.set('myElement', element);
// ? Don't dispose - enhancement should persist

// Case 4: Truly done, ready for GC
element = null;
// ? Should dispose, but no way to detect this automatically
```

**Practical disposal strategies:**

1. **Short-lived elements:** Don't worry about disposal - WeakMap handles cleanup automatically when elements are GC'd

2. **Long-lived applications:** Implement manual disposal at logical boundaries:
   ```TypeScript
   // On route change
   router.beforeLeave(() => {
     oldRouteElements.forEach(el => el.enh.dispose(registryItem));
   });
   
   // On explicit user action
   closeButton.onclick = () => {
     dialog.enh.dispose(registryItem);
     dialog.remove();
   };
   ```

3. **Framework integration:** Use framework lifecycle hooks:
   ```TypeScript
   // React
   useEffect(() => {
     return () => elementRef.current?.enh.dispose(registryItem);
   }, []);
   
   // Vue
   onUnmounted(() => {
     element.value?.enh.dispose(registryItem);
   });
   ```

4. **MutationObserver heuristic:** Watch for disconnection + timeout (imperfect but practical):
   ```TypeScript
   const observer = new MutationObserver(() => {
     if (!element.isConnected) {
       setTimeout(() => {
         if (!element.isConnected) {
           element.enh.dispose(registryItem);
         }
       }, 5000); // If still disconnected after 5s, probably done
     }
   });
   ```

**Best practices for enhancement authors:**

Always implement proper cleanup in your dispose method:

```TypeScript
class MyEnhancement {
  element;
  timerId = null;
  boundHandler = null;
  
  constructor(element, ctx) {
    this.element = element;
    this.boundHandler = this.handleClick.bind(this);
    
    // Local listener - OK, will be GC'd with element
    element.addEventListener('click', this.boundHandler);
    
    // Global listener - MUST clean up manually
    window.addEventListener('resize', this.boundHandler);
    
    // Timer - MUST clean up manually
    this.timerId = setInterval(() => this.update(), 1000);
  }
  
  dispose() {
    // Clean up global listener
    if (this.boundHandler) {
      window.removeEventListener('resize', this.boundHandler);
    }
    
    // Clean up timer
    if (this.timerId) {
      clearInterval(this.timerId);
      this.timerId = null;
    }
    
    // Clear references
    this.element = null;
    this.boundHandler = null;
  }
  
  handleClick() { /* ... */ }
  update() { /* ... */ }
}
```

**Summary:**
- ? Storage mechanism prevents memory leaks via WeakMap
- ?? Enhancement internals need manual cleanup via dispose()
- ? No automatic way to detect when disposal should happen
- ?? Choose disposal strategy based on your application's lifecycle

### Waiting for Async Initialization with `enh.whenResolved(regItem)`

The `enh.whenResolved(regItem)` method provides a way to wait for asynchronous enhancement initialization:

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

const registry = new EnhancementRegistry();
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
- `ctx`: Optional spawn context containing `{ config: EnhancementConfig<T> }`
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
import assignGingerly, { EnhancementRegistry } from 'assign-gingerly';

class ElementOnlyEnhancement {
  value = null;
  
  static canSpawn(obj, ctx) {
    return typeof Element !== 'undefined' && obj instanceof Element;
  }
}

const registry = new EnhancementRegistry();
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

The `parseWithAttrs` function provides a declarative way to read and parse HTML attributes and pass the parsed values into the spawned enhancement constructor. 

### Automatic Integration with Enhancement Spawning

**Important**: When using the `enh.get()`, `enh.set`, or `assignGingerly()` methods with registry items, you typically **do not need to call `parseWithAttrs()` manually**. The attribute parsing happens automatically during enhancement spawning when you include a `withAttrs` property in your registry item configuration.

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

<details>
  <summary>Example without enhKey</summary>

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

</details>

<details>
  <summary>How it works</summary>

1. When an enhancement is spawned via `enh.get()`, `enh.set`, or `assignGingerly()`
2. If the registry item has a `withAttrs` property defined
3. `parseWithAttrs(element, registryItem.withAttrs)` is automatically called
4. The parsed attributes are passed to the enhancement constructor as `initVals`
5. If the registry item also has an `enhKey`, the parsed attributes are merged with any existing values from `element.enh[enhKey]` (existing values take precedence)

</details>

> [!NOTE]
> `withAttrs` works with or without `enhKey`. When there's no `enhKey`, the parsed attributes are passed directly to the constructor. When there is an `enhKey`, they're merged with any pre-existing values on the enh container.

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
const enhConfig2 =  { base: '??-theme' });        // Has non-ASCII (and dash)

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
  parser?: 
    | ((v: string | null) => any)   // Inline parser function
    | string                         // Named parser from globalParserRegistry
    | [string, string];              // [CustomElementName, StaticMethodName]
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

**Deep Nesting:**

Template variables can reference other template variables to any depth, creating hierarchical attribute naming patterns:

```TypeScript
// HTML: <div data-app-user-profile-name="Alice" data-app-user-profile-email="alice@example.com"></div>

const result = parseWithAttrs(element, {
  base: 'data-',
  app: '${base}app',
  user: '${app}-user',
  profile: '${user}-profile',
  name: '${profile}-name',
  email: '${profile}-email'
});
// Result: { name: 'Alice', email: 'alice@example.com' }

// The resolution chain: base ? app ? user ? profile ? name/email
// Resolves to: data-app-user-profile-name and data-app-user-profile-email
```

**Benefits of hierarchical variables:**
- Build complex attribute names from simple parts
- Maintain consistency across related attributes
- Easy to refactor by changing a single variable
- Self-documenting attribute structure

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

[TODO]: Check if this is all needed

The following parsers are pre-registered in `globalParserRegistry`:

- `'timestamp'` - Parses ISO date string to Unix timestamp (milliseconds)
- `'date'` - Parses string to Date object
- `'csv'` - Splits comma-separated values into trimmed array
- `'int'` - Parses integer with `parseInt(v, 10)`
- `'float'` - Parses float with `parseFloat(v)`
- `'boolean'` - Presence check (same as `instanceOf: 'Boolean'`)
- `'json'` - Parses JSON (same as `instanceOf: 'Object'` or `'Array'`)

**Custom Element Static Method Parsers:**

You can reference static methods on custom elements using tuple syntax `[elementName, methodName]`:

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

// Reference custom element parsers using tuple syntax
const config = {
  base: 'data-',
  value: '${base}value',
  _value: {
    parser: ['my-widget', 'parseSpecialFormat']  // [element-name, methodName]
  },
  title: '${base}title',
  _title: {
    parser: ['my-widget', 'parseWithPrefix']
  }
};

const result = parseWithAttrs(element, config);
```

**Parser Resolution:**

When a parser is specified, it can be:

1. **Inline function** - `parser: (v) => v.toUpperCase()` - Used directly
2. **String reference** - `parser: 'timestamp'` - Looks up in `globalParserRegistry`
3. **Tuple reference** - `parser: ['my-widget', 'parseMethod']` - Looks up static method on custom element constructor

**Error Handling:**

The tuple syntax provides clear error messages:

```TypeScript
// Element not found
parser: ['non-existent', 'method']
// Error: Cannot resolve parser [non-existent, method]: custom element "non-existent" not found

// Method not found
parser: ['my-widget', 'nonExistent']
// Error: Cannot resolve parser [my-widget, nonExistent]: static method "nonExistent" not found on custom element "my-widget"

// String not found in registry
parser: 'unknown'
// Error: Parser "unknown" not found in globalParserRegistry. If you want to reference a custom element static method, use tuple syntax: ["element-name", "methodName"]
```

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

- ? **JSON serializable** - Configs can be stored/transmitted as JSON
- ? **Reusable** - Define once, use everywhere
- ? **Maintainable** - Update parser logic in one place
- ? **Testable** - Test parsers independently
- ? **Discoverable** - `globalParserRegistry.getNames()` lists all available parsers
- ? **Backward compatible** - Inline functions still work

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

The `valIfNull` property allows us to specify default values when attributes are missing:

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

**Without selectors (matches any element):**

```TypeScript
// Omit the selectors parameter
const query = buildCSSQuery(config);
// or explicitly pass empty string
const query = buildCSSQuery(config, '');

console.log(query);
// '[my-component], [enh-my-component], [my-component-theme], [enh-my-component-theme]'

// Matches any element with these attributes
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

**Omitting or empty selectors return attribute-only selectors:**
```TypeScript
const config = {
  spawn: MyClass,
  withAttrs: {
    base: 'my-attr',
    theme: '${base}-theme'
  }
};

buildCSSQuery(config);  // Omit selectors parameter
// or
buildCSSQuery(config, '');  // Empty string
// Both return: '[my-attr], [enh-my-attr], [my-attr-theme], [enh-my-attr-theme]'
// Matches any element with these attributes
```

**Empty withAttrs returns empty string:**
```TypeScript
buildCSSQuery({ spawn: MyClass }, 'div');  // '' (no withAttrs)
buildCSSQuery({ spawn: MyClass, withAttrs: {} }, 'div');  // '' (empty withAttrs)
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
   // Match any element with the attributes
   const matching = buildCSSQuery(enhancementConfig);
   const observer = new MountObserver({
      matching,
      do: (mountedElement) => {
        enhance(mountedElement);
      }
   });
   ```

   See [Mount-Observer](https://github.com/bahrus/mount-observer).

2. **Specific Element Types**: Enhance only certain element types
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
  selectors?: string
): string
```

**Parameters:**
- `config`: Enhancement configuration with `withAttrs` property
- `selectors` (optional): Comma-separated CSS selectors (e.g., `'div, span'`)
  - If omitted or empty string, returns attribute selectors without element prefix
  - This matches any element with the specified attributes

**Returns:**
- CSS query string with cross-product of selectors and attributes
- If selectors is omitted or empty: returns attribute-only selectors (e.g., `'[attr], [enh-attr]'`)
- If withAttrs is missing or empty: returns empty string

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

## Resolving and Assigning with `assignFrom`

The `assignFrom` function combines RHS path resolution with `assignGingerly` in a single call. It resolves `?.`-prefixed RHS values against a source object, then assigns the results into a target. Use `?.` alone as a RHS value to reference the entire source object itself.

```TypeScript
import { assignFrom } from 'assign-gingerly/assignFrom.js';

const viewModel = { username: 'Alice', clone: someDocumentFragment };

assignFrom(target, {
  '?.appendChild': '?..clone',                              // source.clone
  '?.clone?.q?..username?.textContent': '?.username',       // source.username
  ref: '?.'                                                  // the source object itself
}, {
  from: viewModel,
  withMethods: ['appendChild'],
  aka: { 'q': 'querySelector' }
});
```

For full documentation, see [docs/assignFrom.md](docs/assignFrom.md).

## Protocol Resolution in `resolveValues` and `assignFrom`

`resolveValues` (and by extension `assignFrom`) supports resolving values from external sources via protocol-prefixed strings. This enables declarative references to `globalThis`, `localStorage`, `sessionStorage`, or custom stores.

```JavaScript
import { resolveValues } from 'assign-gingerly/resolveValues.js';

const result = await resolveValues({
    baseURL: 'globalThis://myAppConfig?.apiBaseUrl',
    authToken: 'localStorage://auth?.token',
    label: '?.title'  // normal path resolution still works
}, source, {
    protocols: {
        globalThis: (key) => globalThis[key],
        localStorage: (key) => JSON.parse(localStorage.getItem(key) || 'null')
    }
});
```

**How it works:**

1. If a value contains `://` and the part before it matches a key in `protocols`, it's treated as a protocol reference.
2. The protocol handler is called with the key portion (between `://` and the first `?.`, or end of string).
3. If a `?.` path follows the key, it's resolved against the handler's result using `resolveValue`.
4. If the protocol isn't found in the map, the value passes through unchanged (no error).

**Path after protocol key:**

```JavaScript
// 'globalThis://myConfig?.database?.host'
// 1. Protocol: 'globalThis'
// 2. Key: 'myConfig'
// 3. Handler returns: globalThis['myConfig'] → { database: { host: 'localhost' } }
// 4. Remaining path: '?.database?.host' → resolves to 'localhost'
```

**With `assignFrom` and the `"..."` spread key:**

`assignFrom` supports a special `"..."` key that spreads the resolved value into the parent object:

```JavaScript
import { assignFrom } from 'assign-gingerly/assignFrom.js';

await assignFrom(myForm, {
    "...": "globalThis://qmywdO1vr0SwyuIe4fvzxQ",
    path: "api/v2/:operation/:expression",
    headers: {
        "...": "globalThis://rPpwNLcYsUOjFcg+N8lmOA"
    }
}, {
    from: source,
    protocols: { globalThis: (key) => globalThis[key] }
});
```

The `"..."` key causes the resolved object to be merged (spread) into the result before passing to `assignGingerly`, rather than being assigned to a property named `"..."`.

**Note:** Both `resolveValues` and `assignFrom` are async (return Promises) to support async protocol handlers (e.g., IndexedDB, fetch). For patterns without protocols, the async overhead is negligible.

## Custom Assignment with `static assignTo` Protocol

Classes can opt into custom assignment behavior by defining a `static assignTo` method. When `assignGingerly` encounters a property whose current value is an instance of such a class, it delegates the assignment to `assignTo` instead of performing the default merge/replace logic.

```JavaScript
class ReactiveModel {
    #data = {};
    #listeners = [];

    static assignTo(instance, rhs, parent, key) {
        // Custom merge: trigger reactive notifications
        for (const [k, v] of Object.entries(rhs)) {
            instance.#data[k] = v;
            instance.#listeners.forEach(fn => fn(k, v));
        }
    }

    get(prop) { return this.#data[prop]; }
    onChange(fn) { this.#listeners.push(fn); }
}
```

### How it works

When `assignGingerly` is about to assign a value to a property, it checks if the property's current value is an object whose constructor defines `static assignTo`. If so, it calls `assignTo` instead of the default behavior:

```JavaScript
const obj = { model: new ReactiveModel() };

assignGingerly(obj, { model: { name: 'Alice', age: 30 } });
// Instead of replacing or merging, calls:
// ReactiveModel.assignTo(obj.model, { name: 'Alice', age: 30 }, obj, 'model')
```

### Parameters

```TypeScript
class MyClass {
    static assignTo(
        instance: MyClass,  // The current value (instance of this class)
        rhs: any,           // The value being assigned (from the RHS of assignGingerly)
        parent: any,        // The parent object containing the property
        key: string|symbol  // The property key being assigned to
    ) { ... }
}
```

The `parent` and `key` parameters allow `assignTo` to replace the instance entirely if needed (e.g., for immutable patterns):

```JavaScript
class ImmutableState {
    #data;
    constructor(data) { this.#data = Object.freeze({ ...data }); }
    
    static assignTo(instance, rhs, parent, key) {
        // Replace with a new immutable instance
        parent[key] = new ImmutableState({ ...instance.#data, ...rhs });
    }
}
```

### Use case: Iterable classes with private lists

A class that is iterable over a private list can use `assignTo` to handle array assignment (replacing the list) vs object assignment (merging properties):

```JavaScript
class TodoList {
    #items = [];
    
    *[Symbol.iterator]() { yield* this.#items; }
    
    static assignTo(instance, rhs) {
        if (Array.isArray(rhs)) {
            // Replace the private list
            instance.#items = [...rhs];
        } else if (typeof rhs === 'object' && rhs !== null) {
            // Merge properties normally
            Object.assign(instance, rhs);
        }
    }
}

const app = { todos: new TodoList() };

// Assign an array — replaces the internal list
assignGingerly(app, { todos: ['Buy milk', 'Walk dog'] });
console.log([...app.todos]); // ['Buy milk', 'Walk dog']

// Assign an object — merges properties
assignGingerly(app, { todos: { title: 'My Todos' } });
console.log(app.todos.title); // 'My Todos'
console.log([...app.todos]); // ['Buy milk', 'Walk dog'] (list unchanged)
```

### Use case: Validation on assignment

```JavaScript
class TypedRecord {
    static schema = { name: 'string', age: 'number' };
    
    static assignTo(instance, rhs) {
        for (const [k, v] of Object.entries(rhs)) {
            const expected = TypedRecord.schema[k];
            if (expected && typeof v !== expected) {
                throw new TypeError(`${k} must be ${expected}, got ${typeof v}`);
            }
            instance[k] = v;
        }
    }
}
```

### Private field access

Because `assignTo` is a static method defined in the class body, it has full access to `#private` fields:

```JavaScript
class SecureStore {
    #secrets = {};
    
    static assignTo(instance, rhs) {
        // Can read/write private fields
        for (const [k, v] of Object.entries(rhs)) {
            instance.#secrets[k] = encrypt(v);
        }
    }
}
```

### Safety

Only classes that explicitly define their own `assignTo` are affected. The check uses `Object.hasOwn(constructor, 'assignTo')` to prevent accidental inheritance — plain objects, arrays, and classes without `assignTo` use the default assignGingerly behavior.

## Property Forwarding with `installForwarding`

`installForwarding` installs getter/setter pairs on a class prototype that delegate to nested paths on the instance. This is useful for exposing deeply nested properties at the top level of an object — particularly for custom elements that delegate behavior to compositional feature classes.

```JavaScript
import { installForwarding } from 'assign-gingerly/installForwarding.js';
```

### Basic usage

```JavaScript
class ClubMember extends HTMLElement {
    static propLinks = {
        'command': '?.behaviors?.commandBehavior?.command',
        'commandForElement': '?.behaviors?.commandBehavior?.commandForElement'
    };
}

installForwarding(ClubMember);

const el = document.createElement('club-member');
el.command = 'toggle';
// Equivalent to: assignGingerly(el, { '?.behaviors?.commandBehavior?.command': 'toggle' })

console.log(el.command);
// Equivalent to: resolveValue('?.behaviors?.commandBehavior?.command', el)
```

### How it works

1. Reads `static propLinks` from the constructor — a map of top-level property names to `?.`-delimited path strings.
2. For each entry, installs a getter/setter pair on the prototype:
   - **Getter**: uses `resolveValue` to walk the path with optional chaining semantics. Returns `undefined` if any segment is nullish.
   - **Setter**: uses `assignGingerly` to assign the value at the path, creating intermediate objects as needed.
3. Validates that forwarded property names don't already exist on the prototype (throws if they do).

### With methods and aliases

Because the getter uses `resolveValue` and the setter uses `assignGingerly`, you get full access to `withMethods` and `aka` via the options parameter:

```JavaScript
class MyComponent extends HTMLElement {
    static propLinks = {
        'username': '?.q?.#user-input?.value'
    };
}

installForwarding(MyComponent, {
    withMethods: ['querySelector'],
    aka: { 'q': 'querySelector' }
});

// el.username now resolves:
// el.querySelector('#user-input').value
```

### Use with Custom Element Features

A common pattern is forwarding top-level properties to feature instances:

```JavaScript
class CustomButton extends HTMLElement {
    static supportedFeatures = {
        commandBehavior: { fallbackSpawn: CommandFeatureImpl }
    };
    static propLinks = {
        'command': '?.commandBehavior?.command',
        'commandForElement': '?.commandBehavior?.commandForElement'
    };
}

customElements.assignFeatures(CustomButton, {
    commandBehavior: { spawn: CommandFeatureImpl }
});
installForwarding(CustomButton);

// Now el.command delegates to el.commandBehavior.command
// The feature getter triggers lazy instantiation automatically
```

### Error conditions

| Condition | Error |
|-----------|-------|
| Property already exists on prototype | `"already exists on Constructor.prototype"` |
| Path doesn't start with `?.` | `"path must start with '?.'"` |

### Performance

- Paths are cached after first parse — repeated getter/setter calls don't re-split strings.
- The getter uses `resolveValue` (a lightweight single-path resolver with caching).
- The setter uses `assignGingerly` which also benefits from path caching.

## Itemscope Managers (Chrome 146+)

Itemscope Managers provide a way to manage DOM fragments and their associated data/view models for elements with the `itemscope` attribute. This feature enables frameworks and libraries to manage light children of web components, DOM fragments from looping constructs, and scenarios where custom element wrapping is not feasible.

> [!NOTE]
> This feature requires Chrome 146+ with scoped custom element registry support. It follows the same browser support requirements as the Enhancement Registry integration.
>
> For more information about scoped custom element registries, see [Chrome's announcement and guide](https://developer.chrome.com/blog/scoped-registries).

### Why Itemscope Managers?

The `itemscope` attribute (from the Microdata specification) provides a semantic way to mark elements that represent distinct data items. ItemScope Managers build on this by allowing us to:

- **Manage light children**: Attach behavior to light DOM children of web components without wrapping them in custom elements
- **Handle template loops**: Manage repeated DOM fragments generated by template systems
- **Avoid custom element overhead**: Enhance elements where custom element registration isn't appropriate or possible
- **Separate concerns**: Keep data/view model logic separate from the DOM structure

### Basic Usage

```html
<div itemscope="user-card">
  <h2>User Profile</h2>
  <p itemprop="name"></p>
  <p itemprop="email"></p>
</div>
```

```TypeScript
import 'assign-gingerly/object-extension.js';

// Define a manager class
class UserCardManager {
  element;
  name = '';
  email = '';
  
  constructor(element, initVals) {
    this.element = element;
    if (initVals) {
      Object.assign(this, initVals);
      this.render();
    }
  }
  
  render() {
    this.element.querySelector('[itemprop="name"]').textContent = this.name;
    this.element.querySelector('[itemprop="email"]').textContent = this.email;
  }
}

// Register the manager
customElements.itemscopeRegistry.define('user-card', {
  manager: UserCardManager
});

// Use assignGingerly with the 'ish' property
const element = document.querySelector('[itemscope="user-card"]');
element.assignGingerly({
  ish: {
    name: 'Alice',
    email: 'alice@example.com'
  }
});

// Wait for async setup to complete
await customElements.itemscopeRegistry.whenDefined('user-card');

// Access the manager instance
console.log(element.ish instanceof UserCardManager); // true
console.log(element.ish.name); // 'Alice'
```

### The 'ish' Property

The `ish` property (short for "itemscope host") is the key to ItemScope Managers:

- **Special behavior for HTMLElements**: When you assign an `ish` property to an HTMLElement with an `itemscope` attribute, it triggers manager instantiation
- **Normal property for other objects**: For non-HTMLElement objects, `ish` is just a regular property with no special behavior
- **Asynchronous setup**: The manager is instantiated asynchronously, so use `whenDefined()` to wait for completion

```TypeScript
// HTMLElement with itemscope - special behavior
const div = document.createElement('div');
div.setAttribute('itemscope', 'my-manager');
div.assignGingerly({ ish: { prop: 'value' } });
// Manager will be instantiated asynchronously

// Plain object - normal property
const obj = {};
obj.assignGingerly({ ish: { prop: 'value' } });
console.log(obj.ish.prop); // 'value' - just a regular property
```

### ItemscopeRegistry

The `ItemscopeRegistry` class manages manager configurations and extends `EventTarget` to support lazy registration:

```TypeScript
// Access the global registry
const registry = customElements.itemscopeRegistry;

// Define a manager
registry.define('manager-name', {
  manager: ManagerClass,
  lifecycleKeys: {
    dispose: 'cleanup',
    resolved: 'isReady'
  }
});

// Get a manager configuration
const config = registry.get('manager-name');

// Wait for a manager to be defined and all setups to complete
await registry.whenDefined('manager-name');
```

**Methods:**

- `define(name, config)` - Register a manager configuration
  - Throws `Error: Already registered` if name already exists
  - Dispatches an event with the manager name when successful
  
- `get(name)` - Retrieve a manager configuration
  - Returns the configuration or `undefined` if not found
  
- `whenDefined(name)` - Wait for manager definition and setup completion
  - Returns a Promise that resolves when:
    1. The manager is defined (waits for definition if not yet registered)
    2. All pending `ish` property setups for this manager are complete
  - This is the recommended way to wait for async manager instantiation

### Manager Configuration

Manager configurations follow this interface:

```TypeScript
interface ItemscopeManagerConfig<T = any> {
  manager: {
    new (element: HTMLElement, initVals?: Partial<T>): T;
  };
  lifecycleKeys?: {
    dispose?: string | symbol;
    resolved?: string | symbol;
  };
}
```

**Properties:**

- `manager` (required): Constructor function that receives:
  - `element`: The HTMLElement with the itemscope attribute
  - `initVals`: Merged values from all queued `ish` assignments
  
- `lifecycleKeys` (optional): Lifecycle method names
  - `dispose`: Method to call when cleaning up
  - `resolved`: Property/event name for async initialization

### Lazy Registration

Managers can be registered after elements are already using them. The system queues values and instantiates the manager when it's registered:

```TypeScript
const element = document.createElement('div');
element.setAttribute('itemscope', 'lazy-manager');

// Assign before manager is registered - values are queued
element.assignGingerly({ ish: { prop1: 'value1' } });
element.assignGingerly({ ish: { prop2: 'value2' } });

// Register the manager later
setTimeout(() => {
  customElements.itemscopeRegistry.define('lazy-manager', {
    manager: class LazyManager {
      constructor(element, initVals) {
        this.element = element;
        Object.assign(this, initVals);
        // initVals contains both prop1 and prop2
      }
    }
  });
}, 100);

// Wait for registration and setup
await customElements.itemscopeRegistry.whenDefined('lazy-manager');

console.log(element.ish.prop1); // 'value1'
console.log(element.ish.prop2); // 'value2'
```

### Instance Caching

Manager instances are cached per element. Subsequent `ish` assignments merge values into the existing instance:

```TypeScript
const element = document.createElement('div');
element.setAttribute('itemscope', 'my-manager');

// First assignment - creates instance
element.assignGingerly({ ish: { prop1: 'value1' } });
await customElements.itemscopeRegistry.whenDefined('my-manager');

const firstInstance = element.ish;

// Second assignment - reuses instance
element.assignGingerly({ ish: { prop2: 'value2' } });
await customElements.itemscopeRegistry.whenDefined('my-manager');

console.log(element.ish === firstInstance); // true - same instance
console.log(element.ish.prop1); // 'value1'
console.log(element.ish.prop2); // 'value2'
```

### Validation and Error Handling

The system validates `ish` property assignments and throws descriptive errors:

```TypeScript
// Error: Element must have itemscope attribute
const div1 = document.createElement('div');
div1.assignGingerly({ ish: { prop: 'value' } });
// Throws asynchronously

// Error: itemscope must be non-empty string
const div2 = document.createElement('div');
div2.setAttribute('itemscope', '');
div2.assignGingerly({ ish: { prop: 'value' } });
// Throws asynchronously

// Error: ish value must be an object
const div3 = document.createElement('div');
div3.setAttribute('itemscope', 'my-manager');
div3.assignGingerly({ ish: 'string' });
// Throws asynchronously
```

**Note**: Errors are thrown asynchronously since the `ish` property setup happens in the background. They will appear in the console but won't be catchable with try/catch around the `assignGingerly` call.

### Scoped Registries

ItemScope Managers integrate with scoped custom element registries. Each element can have its own registry:

```TypeScript
// Create a scoped registry
const scopedRegistry = new CustomElementRegistry();

// Define a manager in the scoped registry
scopedRegistry.itemscopeRegistry.define('scoped-manager', {
  manager: ScopedManager
});

// Attach the registry to an element
const element = document.createElement('div');
element.customElementRegistry = scopedRegistry;
element.setAttribute('itemscope', 'scoped-manager');

// The element uses its scoped registry
element.assignGingerly({ ish: { prop: 'value' } });
await scopedRegistry.itemscopeRegistry.whenDefined('scoped-manager');
```

If an element doesn't have a `customElementRegistry` property, it falls back to the global `customElements.itemscopeRegistry`.

### Complete Example

```html
<!DOCTYPE html>
<html>
<head>
  <script type="module">
    import 'assign-gingerly/object-extension.js';
    
    // Define a todo item manager
    class TodoItemManager {
      element;
      text = '';
      completed = false;
      
      constructor(element, initVals) {
        this.element = element;
        if (initVals) {
          Object.assign(this, initVals);
        }
        this.render();
        this.attachListeners();
      }
      
      render() {
        const checkbox = this.element.querySelector('input[type="checkbox"]');
        const label = this.element.querySelector('label');
        
        if (checkbox) checkbox.checked = this.completed;
        if (label) label.textContent = this.text;
      }
      
      attachListeners() {
        const checkbox = this.element.querySelector('input[type="checkbox"]');
        if (checkbox) {
          checkbox.addEventListener('change', (e) => {
            this.completed = e.target.checked;
            this.render();
          });
        }
      }
      
      cleanup() {
        // Remove event listeners, etc.
        console.log('Cleaning up todo item');
      }
    }
    
    // Register the manager
    customElements.itemscopeRegistry.define('todo-item', {
      manager: TodoItemManager,
      lifecycleKeys: {
        dispose: 'cleanup'
      }
    });
    
    // Initialize todo items
    async function initTodos() {
      const items = document.querySelectorAll('[itemscope="todo-item"]');
      
      items.forEach((item, index) => {
        item.assignGingerly({
          ish: {
            text: `Todo item ${index + 1}`,
            completed: false
          }
        });
      });
      
      // Wait for all setups to complete
      await customElements.itemscopeRegistry.whenDefined('todo-item');
      
      console.log('All todo items initialized');
    }
    
    // Run on page load
    document.addEventListener('DOMContentLoaded', initTodos);
  </script>
</head>
<body>
  <h1>Todo List</h1>
  <ul>
    <li itemscope="todo-item">
      <input type="checkbox">
      <label></label>
    </li>
    <li itemscope="todo-item">
      <input type="checkbox">
      <label></label>
    </li>
    <li itemscope="todo-item">
      <input type="checkbox">
      <label></label>
    </li>
  </ul>
</body>
</html>
```

### Testing with whenDefined

When writing tests for code that uses ItemScope Managers, use `whenDefined()` to wait for async setup:

```TypeScript
// Test example
test('should initialize manager with values', async () => {
  const element = document.createElement('div');
  element.setAttribute('itemscope', 'test-manager');
  
  // Register manager
  customElements.itemscopeRegistry.define('test-manager', {
    manager: class TestManager {
      constructor(element, initVals) {
        this.element = element;
        Object.assign(this, initVals);
      }
    }
  });
  
  // Assign values
  element.assignGingerly({ ish: { prop: 'value' } });
  
  // Wait for setup to complete
  await customElements.itemscopeRegistry.whenDefined('test-manager');
  
  // Now we can assert
  expect(element.ish.prop).toBe('value');
  expect(element.ish.element).toBe(element);
});
```

### Design Rationale

ItemScope Managers follow these design principles:

1. **Synchronous API**: `assignGingerly` remains synchronous and returns immediately
2. **Async setup**: Manager instantiation happens asynchronously in the background
3. **Explicit waiting**: Use `whenDefined()` when you need to wait for setup completion
4. **Dual behavior**: The `ish` property has special meaning only for HTMLElements with `itemscope` attributes
5. **Registry-based**: Follows the same pattern as `EnhancementRegistry` for consistency
6. **Event-driven**: Uses EventTarget for lazy registration support

This design ensures backward compatibility while providing powerful new capabilities for managing DOM fragments.


## Custom Element Features

Custom Element Features provide dependency injection for custom elements (and other objects). A custom element author declares which feature "slots" their class supports, and consumers inject implementations into those slots. Features are lazily instantiated on first property access.

To use features, import the module directly — it is independent of `object-extension.js`:

```JavaScript
import 'assign-gingerly/assignFeatures.js';
```

This self-installs `featuresRegistry` and `assignFeatures()` on `CustomElementRegistry.prototype`. It does not require or pull in the enhancement/itemscope registries.

This is useful for:

- **Decomposing large components** into smaller, testable units (e.g., a photo-taking feature, a badge-making feature).
- **Mocking in tests** — swap real implementations for test doubles without subclassing.
- **Reusing behaviors** across different custom elements without mixins.
- **Lazy loading** — feature code isn't executed until the property is actually accessed.

### How it works

1. The custom element declares `static supportedFeatures` — an opt-in map of feature keys and their configuration.
2. A consumer calls `customElements.assignFeatures(Constructor, injections)` to register implementations.
3. Lazy getter-only properties are installed on the constructor's prototype.
4. On first access, the getter spawns the feature instance, validates it (optionally), caches it, and returns it.
5. Because the property is getter-only (no setter), `assignGingerly` automatically merges into the spawned instance when assigning object values to that property.

### Basic example

```JavaScript
import 'assign-gingerly/assignFeatures.js';

// 1. Define a feature implementation
class PhotoTakerImpl {
    constructor(hostElement) {
        this.host = hostElement;
    }
    takePicture() {
        return `📸 taken by ${this.host.localName}`;
    }
    someProp = 'default';
}

// 2. Define the custom element with supported feature slots
class ClubMember extends HTMLElement {
    static supportedFeatures = {
        photoTaker: {
            // Used if no spawn is provided in assignFeatures
            fallbackSpawn: PhotoTakerImpl,
            // Optional runtime check on the spawned instance
            validateShape(instance) {
                return typeof instance.takePicture === 'function';
            }
        }
    }
}

// 3. Inject features before define (getters must be on prototype before instances exist)
customElements.assignFeatures(ClubMember, {
    photoTaker: {
        spawn: PhotoTakerImpl
    }
});

customElements.define('club-member', ClubMember);

// 4. Use it — lazy instantiation on first access
const el = document.createElement('club-member');
console.log(el.photoTaker.takePicture()); // '📸 taken by club-member'

// 5. assignGingerly merges into the feature instance automatically
el.assignGingerly({
    photoTaker: { someProp: 'hello' }
});
console.log(el.photoTaker.someProp); // 'hello'
```

### Using fallbackSpawn (no explicit injection needed)

If `fallbackSpawn` is provided in `supportedFeatures`, you can call `assignFeatures` with an empty spawn — or even just `{}` — and the fallback will be used:

```JavaScript
class ClubMember extends HTMLElement {
    static supportedFeatures = {
        photoTaker: {
            fallbackSpawn: PhotoTakerImpl
        }
    }
}

customElements.define('club-member', ClubMember);

// No spawn provided — will use fallbackSpawn
customElements.assignFeatures(ClubMember, {
    photoTaker: {}
});

const el = document.createElement('club-member');
console.log(el.photoTaker.takePicture()); // works via fallbackSpawn
```

### Testing with mocks

```JavaScript
class PhotoTakerMock {
    constructor(hostElement) {
        this.host = hostElement;
        this.calls = [];
    }
    takePicture() {
        this.calls.push('takePicture');
        return 'mock click';
    }
}

// In test setup:
customElements.assignFeatures(ClubMember, {
    photoTaker: { spawn: PhotoTakerMock }
});

const el = document.createElement('club-member');
el.photoTaker.takePicture();
console.log(el.photoTaker.calls); // ['takePicture']
```

### Multiple features

```JavaScript
class BadgeMakerImpl {
    constructor(hostElement) {
        this.host = hostElement;
    }
    makeBadge(name) {
        return `🎫 ${name}`;
    }
}

class ClubMember extends HTMLElement {
    static supportedFeatures = {
        photoTaker: { fallbackSpawn: PhotoTakerImpl },
        badgeMaker: { fallbackSpawn: BadgeMakerImpl }
    }
}

customElements.define('club-member', ClubMember);

// Can assign all at once
customElements.assignFeatures(ClubMember, {
    photoTaker: { spawn: PhotoTakerImpl },
    badgeMaker: { spawn: BadgeMakerImpl }
});

// Or incrementally (different keys each call)
// customElements.assignFeatures(ClubMember, { photoTaker: { spawn: PhotoTakerImpl } });
// customElements.assignFeatures(ClubMember, { badgeMaker: { spawn: BadgeMakerImpl } });
```

### Validation

The `validateShape` callback runs after instantiation. If it returns `false`, an error is thrown:

```JavaScript
class ClubMember extends HTMLElement {
    static supportedFeatures = {
        photoTaker: {
            fallbackSpawn: PhotoTakerImpl,
            validateShape(instance) {
                if (typeof instance.takePicture !== 'function') return false;
                if (typeof instance.someProp !== 'string') return false;
                return true;
            }
        }
    }
}
```

### Error conditions

`assignFeatures` throws in these cases:

| Condition | Error |
|-----------|-------|
| Constructor has no `static supportedFeatures` | `"does not define static supportedFeatures"` |
| Key not declared in `supportedFeatures` | `"is not declared in Constructor.supportedFeatures"` |
| Property already exists on prototype | `"already exists on Constructor.prototype"` |
| Same key assigned twice for same constructor | `"has already been assigned for Constructor"` |
| No `spawn` provided and no `fallbackSpawn` | `"no spawn implementation found"` (at access time) |
| `validateShape` returns false | `"failed shape validation"` (at access time) |

### Integration with assignGingerly

Because `assignFeatures` installs **getter-only** properties (no setter), assignGingerly's existing readonly property detection kicks in automatically:

```JavaScript
// assignGingerly detects photoTaker is getter-only
// → reads the getter (spawning the instance if needed)
// → recursively merges the RHS object into the instance
el.assignGingerly({
    photoTaker: { someProp: 'updated' }
});
```

This means no special handling is needed in assignGingerly for features — it "just works."

### Scoped registry support

The lazy getter uses `(this.customElementRegistry || customElements)` to resolve the features registry. This means:

- On Chrome 146+ (and future browsers with scoped registries), the element's scoped `customElementRegistry` is used.
- On older browsers, it falls back to the global `customElements`.

### Not limited to custom elements

While designed with custom elements in mind, `assignFeatures` works with any constructor whose instances will have a `customElementRegistry` property (or where the global `customElements` fallback is acceptable). This includes element enhancement classes that set `this.customElementRegistry` from the element they enhance.

### API reference

```TypeScript
// On CustomElementRegistry.prototype:
customElements.assignFeatures(
    ctr: Function,           // The class constructor
    features: FeatureConfigsMap  // Map of feature keys to FeatureConfig
): void;

// FeatureConfig — passed to assignFeatures for each feature key:
interface FeatureConfig {
    // Synchronous constructor or async function returning one
    spawn?: 
        | { new(hostElement: any, ctx: FeatureSpawnContext, initVals?: any): any }
        | (() => Promise<{ new(hostElement: any, ctx: FeatureSpawnContext, initVals?: any): any }>);
    
    // Attribute patterns for parsing element attributes into initVals
    withAttrs?: AttrPatterns<any>;
    
    // Pass-through field for custom configuration (accessible via ctx.injection.customData)
    customData?: any;
}

// SupportedFeatureConfig — declared on the class via static supportedFeatures:
interface SupportedFeatureConfig {
    fallbackSpawn?: /* same type as FeatureConfig.spawn */;
    validateShape?: (instance: any) => boolean;
    lifecycleKeys?: true | { whenFeatureReady?: string };
    getSharedContext?: (instance: any) => any;
}

// Context passed to feature constructors:
interface FeatureSpawnContext {
    key: string;                        // The feature key (e.g., 'photoTaker')
    optIn: SupportedFeatureConfig;      // The config from static supportedFeatures
    injection: FeatureConfig;           // The config from assignFeatures()
    featuresRegistry: FeaturesRegistry; // The registry reference
    shared?: any;                       // From getSharedContext (if defined)
}
```

### Constructor signature

Feature classes receive three arguments:

```JavaScript
class MyFeature {
    constructor(hostElement, ctx, initVals) {
        // hostElement: the element instance that owns this feature
        // ctx: { key, optIn, injection, featuresRegistry, shared }
        // initVals: any pre-set value captured before the feature was spawned (or undefined)
        if (initVals) {
            Object.assign(this, initVals);
        }
        // Access shared context (e.g., ElementInternals)
        if (ctx.shared) {
            this.internals = ctx.shared.internals;
        }
        // Access custom data from the FeatureConfig
        if (ctx.injection.customData) {
            this.config = ctx.injection.customData;
        }
    }
}
```

### Pre-upgrade property capture with `captureFeatureInitVals`

When a custom element exists in the DOM before `customElements.define()` is called, properties may be set on it directly (e.g., by a framework or server-rendered HTML hydration). After the element upgrades, these own-properties shadow the prototype getters installed by `assignFeatures`, preventing the lazy spawn mechanism from working.

`captureFeatureInitVals` solves this by capturing and deleting those own-properties in the constructor, storing them so the getter can pass them as `initVals` when the feature is first accessed.

**Usage:**

```JavaScript
import { captureFeatureInitVals } from 'assign-gingerly/assignFeatures.js';

class ClubMember extends HTMLElement {
    static supportedFeatures = {
        photoTaker: { fallbackSpawn: PhotoTakerImpl }
    }

    constructor() {
        super();
        captureFeatureInitVals(this);
    }
}
```

**What it does:**

1. Iterates over the keys in `static supportedFeatures`.
2. For each key, checks if the instance has an own-property with that name (`Object.hasOwn`).
3. If found: captures the value, deletes the own-property, and stores the value internally so the getter can retrieve it as `initVals` when the feature is first accessed.

**When to use it:**

- Always include it in the constructor if your element might exist in the DOM before `define()` is called (which is common with server-rendered HTML or lazy-loaded component definitions).
- It's safe to call even when no own-properties exist — it simply does nothing.
- It's a one-liner with no performance cost when there are no pre-set properties.

**The full pre-upgrade flow:**

```JavaScript
// 1. Element exists in DOM before define (unknown element)
const el = document.createElement('club-member');
document.body.appendChild(el);

// 2. Framework or hydration sets properties
el.photoTaker = { someProp: 'hello', count: 42 };

// 3. Later, the component definition loads
customElements.assignFeatures(ClubMember, {
    photoTaker: { spawn: PhotoTakerImpl }
});
customElements.define('club-member', ClubMember);
// → constructor runs, captureFeatureInitVals captures el.photoTaker value

// 4. First access spawns with initVals
console.log(el.photoTaker.someProp); // 'hello'
console.log(el.photoTaker.count);    // 42
```

**Important ordering:** Call `assignFeatures` before `customElements.define()`. The getters must be on the prototype before any instances are created or upgraded.

### Async spawn (lazy-loading features)

Feature implementations can be loaded asynchronously. Instead of providing a constructor directly, provide a function that returns a Promise resolving to a constructor:

```JavaScript
customElements.assignFeatures(ClubMember, {
    photoTaker: {
        spawn: () => import('./photo-taker.js').then(m => m.PhotoTakerImpl)
    }
});
```

**How it works:**

1. On first access, the getter detects that `spawn` is an async function (arrow function or `async function`).
2. It creates a `{}` placeholder object, stores it, and returns it immediately.
3. In the background, the async function is called and awaited.
4. When the Promise resolves, the real class is instantiated with the placeholder as `initVals` (so any properties merged into the placeholder are passed to the constructor).
5. The placeholder is replaced in storage with the real instance.
6. Subsequent getter accesses return the real instance.

**During the loading window:**

```JavaScript
const el = document.createElement('club-member');

// First access — returns placeholder {}
assignGingerly(el, { photoTaker: { someProp: 'hello' } });
// Merges into the placeholder: { someProp: 'hello' }

// Later, after async resolution:
console.log(el.photoTaker.someProp); // 'hello' — now on the real instance
console.log(el.photoTaker instanceof PhotoTakerImpl); // true
```

**Error handling:**

If the async import fails, the error is stored. The next getter access throws with the original error attached:

```JavaScript
try {
    el.photoTaker;
} catch (e) {
    console.log(e.message);     // 'assignFeatures: async spawn for "photoTaker" failed: ...'
    console.log(e.placeholder); // the accumulated placeholder object
    console.log(e.cause);       // the original import/network error
}
```

**Detection heuristic:** A function is treated as an async spawner if it's an `AsyncFunction` or has no `.prototype` (arrow functions). Classes and `function` declarations (which have `.prototype`) are treated as synchronous constructors.

### `whenFeatureReady` lifecycle method

For code that needs to wait for an async feature to be fully instantiated, configure `lifecycleKeys` on the supported feature:

```JavaScript
class ClubMember extends HTMLElement {
    static supportedFeatures = {
        photoTaker: {
            fallbackSpawn: PhotoTakerImpl,
            lifecycleKeys: true  // installs 'whenFeatureReady' method
        }
    };
    static featuresConfig = {
        lifecycleKeys: true
    }
}

customElements.assignFeatures(ClubMember, {
    photoTaker: { spawn: () => import('./photo-taker.js').then(m => m.PhotoTakerImpl) }
});

const el = document.createElement('club-member');

// Wait for the async feature to be ready
const photoTaker = await el.whenFeatureReady('photoTaker');
console.log(photoTaker instanceof PhotoTakerImpl); // true
```

**Configuration:**

- `lifecycleKeys: true` — installs a method named `'whenFeatureReady'` on the prototype.
- `lifecycleKeys: { whenFeatureReady: 'awaitFeature' }` — custom method name (in case `whenFeatureReady` conflicts with an existing method).

**Behavior:**

- For **synchronous** features: returns `Promise.resolve(instance)` immediately.
- For **async** features: returns a Promise that resolves when the async spawn completes and the real instance is stored.
- The method triggers the getter (starting async resolution if it hasn't started yet).

### Attribute parsing with `withAttrs`

Features can declare attribute patterns to parse element attributes into `initVals`:

```JavaScript
customElements.assignFeatures(ClubMember, {
    photoTaker: {
        spawn: PhotoTakerImpl,
        withAttrs: {
            base: 'photo',
            resolution: '${base}-resolution',
            format: '${base}-format'
        }
    }
});
```

```HTML
<club-member photo-resolution="4k" photo-format="png"></club-member>
```

This parses into `initVals = { resolution: '4k', format: 'png' }`. By default, non-underscore keys are assumed to be strings with `mapsTo` equal to the key name. The `_key` form is only needed to override defaults (e.g., parse as Number, map to a different property name, use a custom parser):

```JavaScript
withAttrs: {
    base: 'photo',
    resolution: '${base}-resolution',
    // Override: parse as Number instead of String
    _resolution: { instanceOf: 'Number', mapsTo: 'resolutionPx' },
    format: '${base}-format'
    // No _format needed — defaults to String, mapsTo: 'format'
}
```

**Merge priority (lowest to highest):**
1. Attribute-parsed values (`withAttrs`)
2. Programmatic `initVals` (from `captureFeatureInitVals` or placeholder accumulation)

Attributes are always unprefixed for features (no `enh-` prefix). The same `parseWithAttrs` function used by enhancements is reused here.

### Shared context with `getSharedContext`

Features often need access to private data from the host element (e.g., `ElementInternals`). The `getSharedContext` callback on `supportedFeatures` provides this:

```JavaScript
class MyButton extends HTMLElement {
    #internals;
    #privateState = { clickCount: 0 };

    static supportedFeatures = {
        commandBehavior: {
            fallbackSpawn: CommandFeatureImpl,
            getSharedContext(instance) {
                // This callback is in the class scope — it can access #private fields
                return {
                    internals: instance.#internals,
                    state: instance.#privateState
                };
            }
        }
    }

    constructor() {
        super();
        this.#internals = this.attachInternals();
    }
}

class CommandFeatureImpl {
    constructor(host, ctx, initVals) {
        // ctx.shared contains what getSharedContext returned
        this.internals = ctx.shared.internals;
        this.state = ctx.shared.state;
    }
}
```

**Key points:**
- `getSharedContext` is called at spawn time (both sync and async paths).
- It's per-feature — different features can receive different slices of private state.
- It's opt-in — if not defined, `ctx.shared` is `undefined`.
- Because it's defined in the class body, it has access to `#private` fields of instances of that class.

### Custom data

The `customData` field on `FeatureConfig` is a pass-through for arbitrary configuration:

```JavaScript
customElements.assignFeatures(ClubMember, {
    photoTaker: {
        spawn: PhotoTakerImpl,
        customData: {
            maxResolution: '8k',
            allowedFormats: ['png', 'jpg', 'webp']
        }
    }
});

class PhotoTakerImpl {
    constructor(host, ctx, initVals) {
        // Access custom data
        const { maxResolution, allowedFormats } = ctx.injection.customData;
    }
}
```

### `withAsyncMethods` in assignGingerly

assignGingerly supports async method calls in path expressions via the `withAsyncMethods` option. This is particularly useful with `whenFeatureReady`:

```JavaScript
import assignGingerly from 'assign-gingerly/assignGingerly.js';

assignGingerly(el, {
    '?.whenFeatureReady?.photoTaker?.someProp': 'hello'
}, { withAsyncMethods: ['whenFeatureReady'] });
// Equivalent to: (await el.whenFeatureReady('photoTaker')).someProp = 'hello'
```

**How it works:**

- `assignGingerly` remains synchronous — async paths are **fire-and-forget**.
- When a path segment matches a name in `withAsyncMethods`, the method is called and its return value is awaited before continuing the chain.
- The async path evaluator (`evaluatePathWithAsyncMethods`) is dynamically imported only when needed, so there's no cost to the synchronous path.
- `withAsyncMethods` works together with `withMethods` — you can mix sync and async methods in the same path.

```JavaScript
assignGingerly(el, {
    '?.whenFeatureReady?.photoTaker?.classList?.add': 'active'
}, { 
    withAsyncMethods: ['whenFeatureReady'],
    withMethods: ['add']
});
// (await el.whenFeatureReady('photoTaker')).classList.add('active')
```

**Note:** Interaction with `@each` and `@eachTime` is not yet supported for async methods.

### Nested features with `PropertyBag`

`PropertyBag` is a base class for creating nested feature containers. It groups related features under a single namespace property, enabling hierarchical composition:

```JavaScript
import { PropertyBag, assignFeatures } from 'assign-gingerly/assignFeatures.js';
import { installForwarding } from 'assign-gingerly/installForwarding.js';

// 1. Define a feature container by subclassing PropertyBag
class ClubMemberBehaviors extends PropertyBag {
    static supportedFeatures = {
        commandBehavior: { fallbackSpawn: CommandFeatureImpl },
        ariaBehavior: { fallbackSpawn: AriaFeatureImpl }
    }
}

// 2. Define the custom element with the container as a feature
class ClubMember extends HTMLElement {
    static supportedFeatures = {
        behaviors: { fallbackSpawn: ClubMemberBehaviors }
    }
    // Forward nested properties to the top level
    static propLinks = {
        'command': '?.behaviors?.commandBehavior?.command',
        'commandForElement': '?.behaviors?.commandBehavior?.commandForElement'
    }
}

// 3. Register features at both levels
customElements.assignFeatures(ClubMember, {
    behaviors: { spawn: ClubMemberBehaviors }
});
customElements.assignFeatures(ClubMemberBehaviors, {
    commandBehavior: { spawn: CommandFeatureImpl },
    ariaBehavior: { spawn: AriaFeatureImpl }
});
installForwarding(ClubMember);
customElements.define('club-member', ClubMember);

// 4. Use it
const el = document.createElement('club-member');
el.command = 'toggle';  // forwards to el.behaviors.commandBehavior.command
el.behaviors.ariaBehavior.setRole('button');  // access nested features directly
```

**How `PropertyBag` works:**

- Carries `customElementRegistry` from the host element so nested features can resolve their registries.
- Applies `initVals` via `Object.assign` (supports pre-upgrade property capture).
- Must be subclassed — direct instantiation throws an error.
- Subclasses must define `static supportedFeatures` (enforced by `assignFeatures` validation).

**Why subclass instead of using `PropertyBag` directly?**

Each subclass declares its own `static supportedFeatures`, which:
- Provides opt-in safety (only declared feature keys are allowed).
- Enables TypeScript type checking on the feature slots.
- Documents the expected shape of the container.

```JavaScript
// This throws — PropertyBag has no supportedFeatures
customElements.assignFeatures(PropertyBag, { anything: {} }); // Error!

// This works — subclass declares what's allowed
class MyBehaviors extends PropertyBag {
    static supportedFeatures = { anything: { fallbackSpawn: AnythingImpl } }
}
customElements.assignFeatures(MyBehaviors, { anything: { spawn: AnythingImpl } }); // ✓
```

### Lifecycle callback forwarding with `callbackForwarding`

Features can receive custom element lifecycle callbacks by declaring `callbackForwarding` in their config. This can be specified by the feature author (in `static supportedFeatures`) and/or by the consumer (in `assignFeatures`). Both are merged — the author declares what the feature intrinsically needs, the consumer can add more:

```JavaScript
// Author declares what the feature needs
class MyElement extends HTMLElement {
    static supportedFeatures = {
        reflector: {
            fallbackSpawn: Reflector,
            callbackForwarding: ['connectedCallback', 'disconnectedCallback']
        }
    }
}

// Consumer can add more (but not remove author's)
customElements.assignFeatures(MyElement, {
    reflector: {
        spawn: Reflector,
        callbackForwarding: ['adoptedCallback'] // merged with author's
    }
});
```

When the custom element's `connectedCallback` fires, the feature's `connectedCallback` is called automatically. This eliminates boilerplate forwarding code and handles feature activation timing naturally.

**How it works:**

1. `assignFeatures` patches the custom element's lifecycle callback on the prototype (once per callback type).
2. The original callback runs first, then all registered features are forwarded.
3. On first `connectedCallback`, the getter is triggered — spawning the feature lazily at the correct lifecycle moment (when the element is in the DOM and computed styles are available).
4. For async features, forwarding is skipped until the real instance is available.

**Supported callbacks:**

| Callback | Use case |
|----------|----------|
| `connectedCallback` | Feature needs DOM context (computed styles, layout, etc.) |
| `disconnectedCallback` | Feature needs cleanup (remove listeners, abort fetches) |
| `attributeChangedCallback` | Feature reacts to attribute changes (limited to element's `observedAttributes`) |
| `adoptedCallback` | Feature reacts to document adoption |
| `formDisabledCallback` | Feature reacts to disabled state changes (form-associated elements) |
| `formResetCallback` | Feature reacts to form reset (form-associated elements) |
| `formStateRestoreCallback` | Feature restores state after navigation/session restore (form-associated elements) |

**Example: Feature that reads computed styles on connect**

```JavaScript
class Reflector {
    constructor(host, ctx) {
        this.host = host;
        this.internals = ctx.shared.internals;
    }
    
    connectedCallback() {
        // Safe to call getComputedStyle here — element is in the DOM
        const styles = getComputedStyle(this.host);
        const exports = styles.getPropertyValue('--custom-state-exports');
        // ... process exports
    }
    
    disconnectedCallback() {
        // Cleanup
    }
}

class MyElement extends HTMLElement {
    #internals;
    static supportedFeatures = {
        reflector: {
            fallbackSpawn: Reflector,
            getSharedContext(instance) {
                return { internals: instance.#internals };
            }
        }
    }
    constructor() {
        super();
        this.#internals = this.attachInternals();
    }
}

customElements.assignFeatures(MyElement, {
    reflector: {
        spawn: Reflector,
        callbackForwarding: ['connectedCallback', 'disconnectedCallback']
    }
});
customElements.define('my-element', MyElement);
```

No manual getter access or `connectedCallback` boilerplate needed — the feature activates at the right time automatically.

**Multiple features with callbacks:**

```JavaScript
customElements.assignFeatures(MyElement, {
    reflector: {
        spawn: Reflector,
        callbackForwarding: ['connectedCallback']
    },
    logger: {
        spawn: Logger,
        callbackForwarding: ['connectedCallback', 'disconnectedCallback']
    }
});
// Both features receive connectedCallback; only logger receives disconnectedCallback
```

**Note on `attributeChangedCallback`:** The feature only receives callbacks for attributes listed in the element's `static observedAttributes`. Features cannot add to this list after `define()` is called.

### Class-level setup with `static onAssigned`

Some features need one-time class-level setup before any instances are created — for example, installing prototype getter/setters or pre-loading modules. The `static onAssigned` method on the spawn class is called by `assignFeatures` immediately after registration:

```JavaScript
class RoundaboutFeature {
    // Called once when assignFeatures processes this feature
    static async onAssigned(ctr, featureConfig) {
        // One-time class-level setup: install prototype getter/setters, pre-load modules
        await makeRoundaboutReady(ctr, featureConfig.customData);
    }

    constructor(host, ctx, initVals) {
        // Instance-level setup (runs on first getter access)
        const [vm, propagator] = roundaboutSync({
            vm: host,
            ...ctx.injection.customData,
        });
        this._vm = vm;
        this._propagator = propagator;
    }
}
```

**Usage:**

```JavaScript
// await is safe — returns undefined if no async onAssigned hooks exist
await customElements.assignFeatures(MyElement, {
    roundabout: {
        spawn: RoundaboutFeature,
        customData: raConfig
    }
});

// Now define — class is fully set up, connectedCallback will be synchronous
customElements.define('my-element', MyElement);
```

**How it works:**

- `assignFeatures` checks if the spawn class defines `static onAssigned` (via `Object.hasOwn`).
- If found, calls `SpawnClass.onAssigned(ctr, featureConfig, key)` after installing the getter.
- If `onAssigned` returns a Promise, it is **awaited sequentially** before processing the next feature. This guarantees that features declared earlier complete their setup before later features run.
- This sequential ordering enables inter-feature communication: Feature A can post configuration (via `suggestFeatureInfo`) that Feature B reads in its own `onAssigned`.
- If no features have `onAssigned`, `assignFeatures` runs synchronously and returns `undefined` (backward compatible).
- Only applies to synchronous spawners (the class must be available at registration time). Async spawners can't define `onAssigned` since the class isn't loaded yet.

**Sequential ordering guarantee:**

```JavaScript
await customElements.assignFeatures(MyElement, {
    featureA: { spawn: FeatureA },  // FeatureA.onAssigned runs first, completes
    featureB: { spawn: FeatureB }   // FeatureB.onAssigned runs second, can read A's output
});
```

Features are processed in declaration order. If Feature A's `onAssigned` is async, it fully completes before Feature B's `onAssigned` starts. This makes it safe for features to communicate via `suggestFeatureInfo` / `getFeatureInfoSuggestions`.

For full documentation on inter-feature communication, see [docs/inter-feature-communication.md](docs/inter-feature-communication.md).

**`await` is always safe:**

```JavaScript
// These are equivalent for sync features (no onAssigned or sync onAssigned):
customElements.assignFeatures(MyElement, { feature: { spawn: SyncFeature } });
await customElements.assignFeatures(MyElement, { feature: { spawn: SyncFeature } });
// Both work — await on undefined is a no-op
```

### Declarative element definition with `defineWithFeatures`

`defineWithFeatures` enables defining custom elements from JSON-serializable configuration — no class authoring needed for derived elements:

```JavaScript
import { defineWithFeatures } from 'assign-gingerly/defineWithFeatures.js';

await defineWithFeatures('time-ticker', 'el-maker', {
    assignFeatures: {
        roundabout: {
            customData: { template: myTemplate },
            withAttrs: { base: 'ra', mode: '${base}-mode' },
            callbackForwarding: ['connectedCallback']
        },
        truthSourcer: {
            callbackForwarding: ['connectedCallback', 'attributeChangedCallback']
        }
    }
});
```

It resolves async `fallbackSpawn` implementations from the base class, creates a subclass, wires up features, and defines the element. Designed for use with [mount-observer cede scripts](https://github.com/bahrus/mount-observer#custom-element-definition-cede-scripts) but works standalone.

For full documentation, see [docs/defineWithFeatures.md](docs/defineWithFeatures.md).

### Resolving async spawns with `resolveAndAssignFeatures`

When defining a custom element via a traditional JS module (rather than declaratively via cede scripts), `resolveAndAssignFeatures` handles the boilerplate of resolving async `fallbackSpawn` implementations before calling `assignFeatures`:

```JavaScript
import { resolveAndAssignFeatures } from 'assign-gingerly/resolveAndAssignFeatures.js';

export async function wireFeatures(ElementClass, cfg) {
    const { roundabout } = cfg.features;
    const { customData, withAttrs } = roundabout;

    await resolveAndAssignFeatures(ElementClass, {
        timeTicker: { spawn: TimeTicker },  // explicit spawn — used as-is
        faceUp: {                           // no spawn — resolved from fallbackSpawn
            callbackForwarding: ['connectedCallback', 'disconnectedCallback']
        },
        roundabout: {                       // no spawn — resolved from fallbackSpawn
            customData,
            withAttrs,
            callbackForwarding: ['connectedCallback']
        }
    });
}
```

**What it does:**

For each feature in the config that doesn't have an explicit `spawn`, it resolves the async `fallbackSpawn` from the class's `static supportedFeatures`, sets it as the spawn, then calls `assignFeatures`. Features with an explicit `spawn` are left untouched.

**When to use it:**

- Defining custom elements via JS modules (the traditional `import` + `define` pattern)
- When the base class uses async `fallbackSpawn` for lazy loading but you want synchronous feature access after registration
- As a reusable `wireFeatures` function that multiple element definitions can share

See [time-ticker/wireFeatures.js](https://github.com/bahrus/time-ticker/blob/baseline/wireFeatures.js) for a real-world example.

<details>
<summary>Catalog of Published Custom Element Features</summary>

| Package | Description | Source |
|---------|-------------|--------|
| [truth-sourcer](https://www.npmjs.com/package/truth-sourcer) | Attribute/property binding and truth-sourcing for custom elements | [GitHub](https://github.com/bahrus/truth-sourcer) |
| [be-reflective](https://www.npmjs.com/package/be-reflective) | CSS custom state reflection from computed styles | [GitHub](https://github.com/bahrus/be-reflective) |
| [face-up](https://www.npmjs.com/package/face-up) | Form Associated Custom Element behavior via ElementInternals | [GitHub](https://github.com/bahrus/face-up) |
| [roundabout](https://www.npmjs.com/package/roundabout) | Reactive view-model binding with template rendering and computed property orchestration | [GitHub](https://github.com/bahrus/roundabout#using-roundaboutfeature-with-assignfeatures) |
| [time-ticker](https://www.npmjs.com/package/time-ticker) | Web component that fires events periodically (example of a feature-based component with no code in the class) | [GitHub](https://github.com/bahrus/time-ticker) |
| [templ-maker](https://www.npmjs.com/package/templ-maker) | Extracts a DOM fragment into a reusable template and clones it per instance (works with cede scripts) | [GitHub](https://github.com/bahrus/templ-maker) |

</details>

### Roadmap (future phases)

- **Nested features**: Support `?.path?.notation` keys directly in `assignFeatures` (without requiring `PropertyBag`).
- **`@each` + async interaction**: Combine async methods with iteration.
