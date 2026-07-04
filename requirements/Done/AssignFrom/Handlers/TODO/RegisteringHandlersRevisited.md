# Registering Handlers, Revisited

---
## Human Ask

The AssignFrom.define doesn't feel like the right way to register an assignFromHandler.

When I first proposed it, Kiro responded:

>  **1. Where does the registry live?**

> `AssignFrom.define(...)` as a static method is fine for global macros. But should it also support scoped registries (per `CustomElementRegistry`, like everything else)? Probably not initially — these macros are likely application-wide. Can add scoping later if needed.

When invoking assignFrom programmatically, there doesn't seem to be that large an advantage of defining a string name that can be used throughout the application.

On the other extreme, we have [this use case for assign-from](https://raw.githubusercontent.com/bahrus/do-merge/refs/heads/baseline/README.md).

with the latter case in mind, here's my proposal:

1.  Remove AssignFrom.define from the code and documentation.  Maybe later we will introduce a registry for it.  For now, it doesn't feel like the right fit.

2.  Move AssignFromOptions from assignFrom to types/assig-gingerly/types.d.ts

3.  Add another option to AssignFromOptions:

```Typescript
//Can't really represent this with TypeScript I don't think
export type BareImportSpecifier = string;
export type NonCrossDomainImportPath = 
    | `./${string}`
    | `../${string}`
    | `/${string}`
    | BareImportSpecifier
;
export type DoKey = string;
export interface AssignFromOptions extends IAssignGingerlyOptions, ResolveValuesOptions {
    ...
    //feel free to improve
    handlers: Record<DoKey, NonCrossDomainImportPath | ClassCtr>
}
```

So only local package references and importMap endorsed paths, or a class constructor are allowed.

If a string is provided, a dynamic import is done to that path on demand (arfter confirming it matches the string pattern), and then search the module for a default export first that is a class instance, and if not, search for the first class instance found.

That handler then becomes "registered" within the scope of the assignFrom call only.



