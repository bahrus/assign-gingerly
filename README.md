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
interface BaseRepository<T> {
    spawn: {new(): T} | Promise<{new(): T}>
    map: {[key: string | symbol]: keyof T}
}
```
