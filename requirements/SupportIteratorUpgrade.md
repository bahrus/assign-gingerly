# Support Iterator Upgrade

With [Automatic Class Instance Preservation](https://github.com/bahrus/assign-gingerly?tab=readme-ov-file#example-3b---automatic-class-instance-preservation), we don't want to replace a class instance with a simple object.

But there's another scenario we should take an exception to:

In line 567 of assignGingerly.ts:

```TypeScript
if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    if (key in target && (isReadonlyProperty(target, key) || isClassInstance(target[key]))) {
        ...
    }
    ...
}
```

we should reorganize this a it add another condition:

```TypeScript
if (typeof value === 'object' && value !== null){
    if(Array.isArray(value)){
        //new stuff goes here
    }else{
        //do what it is currently doing
    }
} && !Array.isArray(value)) {
    if (key in target && (isReadonlyProperty(target, key) || isClassInstance(target[key]))) {
        ...
    }
    ...
}
```

What should happen is this:

```TypeScript
ctr.prototype[Symbol.iterator] = function () {
    var index = -1;
    var data = this[secretKey];
    return {
        next: function () {
            return {
                value: data === undefined ? undefined : data[++index],
                done: data === undefined || !(index in data)
            };
        }
    };
};
```