# assign-gingerly

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
    define(IBaseRegistryItem | IBaseRegistryItem[]){
        ...
    }
}

//Here's where the dependency injection mapping takes place
const baseRegistry = new BaseRegistry;
baseRegistry.define([
    {
        map: {
            [isHappy]: 'isHappy'
        },
        spawn: MyEnhancement
    },{
       enhKey: 'mellowYellow',
       map: {
           [isMellow]: 'isMellow'
       },
       spawn: YourEnhancement
    }
]);
//end of dependency injection

assignGingerly({
    [isHappy]: true,
    [isMellow]: true,
    '?.style.height': '40px',
    '?.enhancements?.mellowYellow?.madAboutFourteen': true
}, baseRegistry);
inputEl.set[isMellow] = false;
divContainer.appendChild(inputEl);
document.body.appendChild(divContainer);
```

The platform would search the registry for any enhancements that has a mapping with a matching symbol of isHappy and isMellow, and if found, instantiate the instance if needed, then set the property value.

The suggestion to use Symbol.for with a guid, as opposed to just Symbol(), is based on some negative experiences I've had with multiple versions of the same library being referenced, but is not required. Regular symbols could also be used when that risk can be avoided.


