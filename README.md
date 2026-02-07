# assign-gingerly

[![Playwright Tests](https://github.com/bahrus/assign-gingerly/actions/workflows/CI.yml/badge.svg?branch=baseline)](https://github.com/bahrus/assign-gingerly/actions/workflows/CI.yml)
[![NPM version](https://badge.fury.io/js/assign-gingerly.png)](http://badge.fury.io/js/assign-gingerly)
[![How big is this package in your project?](https://img.shields.io/bundlephobia/minzip/assign-gingerly?style=for-the-badge)](https://bundlephobia.com/result?p=assign-gingerly)
<img src="http://img.badgesize.io/https://cdn.jsdelivr.net/npm/assign-gingerly?compression=gzip">

This package provides a utility function for carefully merging one object into another.

It builds on Object.assign.  It adds support for:

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
    '?.enhancements?.mellowYellow?.madAboutFourteen': true
}, {
    registry: BaseRegistry
});
result.set[isMellow] = false;
```

The assignGingerly searches the registry for any items that has a mapping with a matching symbol of isHappy and isMellow, and if found, sees if it already has an instance of the spawn class associated with the first passed in parameter.  If no such instance is found, it instantiates one, associates the instance with the first parameter, then sets the property value.

It also adds a lazy property to the first passed in parameter, "set", which returns a proxy, and that proxy watches for symbol references passed in a value, and sets the value from that spawned instance.  Again, if the spawned instance is not found, it respawns it.

The suggestion to use Symbol.for with a guid, as opposed to just Symbol(), is based on some negative experiences I've had with multiple versions of the same library being referenced, but is not required. Regular symbols could also be used when that risk can be avoided.

## Support for JSON assignment with Symbol.for symbols

```JavaScript
const result = assignGingerly({}, {
    "[Symbol.for('TFWsx0YH5E6eSfhE7zfLxA')]": true,
    "[Symbol.for('BqnnTPWRHkWdVGWcGQoAiw')]": true,
    '?.style.height': '40px',
    '?.enhancements?.mellowYellow?.madAboutFourteen': true
}, {
    registry: BaseRegistry
});
```


