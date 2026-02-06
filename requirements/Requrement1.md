## No more asynchronous

Let's simply this package by:

1.  No longer allowing asynchronous spawns

```TypeScript
export interface IBaseRegistryItem<T = any> {
  spawn: { new (): T } | Promise<{ new (): T }>;
  map: { [key: string | symbol]: keyof T };
  enhKey?: string;
}
```

becomes:

```TypeScript
export interface IBaseRegistryItem<T = any> {
  spawn: { new (): T };
  map: { [key: string | symbol]: keyof T };
  enhKey?: string;
}
```

2.  Remove all conditional logic based on spawn being possibly asynchronous.

3.  Make assignGingerly synchronous.