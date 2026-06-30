# More flexibility with Resolving data in Handlers

---

## Human Ask

I'm finding, as I work with the first built in example, that the "from" parameter is far too limiting.

I think instead it should like this:

```TypeScript
export type ChainedAccessorString = string
interface HandlerConfig {
    do: string,
    resolve?: Record<string, ChainedAccessorString>
}
interface MyHandlerConfig extends HandlerConfig {
    do: string,
    resolve: { // this is what is new with this requirement
        list: string,
    }
}

import {AssignFrom} from 'assign-gingerly/assignFrom.js';

class MyHandler<MyHandlerConfig extends HandlerConfig> { //maybe extends some base class?
    //this constructor is called the first time the rhs is encountered
    //based on a map lookup
    //might be useful for some caching?
    constructor(config: TMacroConfig){
        ...
    }

    async assign(
        lhsTarget: any,
        resolvedParams: any, // based on the optional resolve expression
        options: AssignFromOptions){
            // this is what is new with this requirement
            const list = resolvedParams.list 
        ...
    }

}

AssignFrom.define('my-macro', MyMacro);

const myVM = {...}

assignFrom(myDomElement, {
    '?.querySelector?.div =>': {
        do: 'my-macro',
        resolve: {
            list: '?.myList' // this is what is new with this requirement
        },
        myCustomData: {
            ...
        } 
    }
}, {
    withMethods: ['querySelector'],
    from: myVM
})
```


---

## Kiro's Comments

This is a natural evolution. `from` gives you one resolved value; `resolve` gives you a named bag of resolved values. Much more flexible — handlers that need multiple data sources (a list, a template ref, a config object) can declare them all declaratively.

### No concerns — this is clean

The change is:
- Replace `from?: string` with `resolve?: Record<string, string>` on the handler config
- In `processHandlerCommands`, resolve each value in the `resolve` map against `options.from` and pass the resulting object to `handler.assign` as `resolvedParams`

### One question: backward compatibility with `from`

Should we keep `from` as a shorthand for `resolve: { from: '...' }`? Or drop it entirely since there are no consumers yet?

I'd say **drop `from` entirely** — it was never documented in the README, there are no external consumers, and `resolve` subsumes it cleanly. One less concept to maintain.

### Implementation

The change to `processHandlerCommands.ts` is small:

```typescript
// Before (old):
let resolvedFrom = undefined;
if (config.from) {
    resolvedFrom = resolveValue(config.from, options.from);
}
await handler.assign(lhsTarget, resolvedFrom, options);

// After (new):
let resolvedParams: Record<string, any> = {};
if (config.resolve) {
    for (const [paramName, path] of Object.entries(config.resolve)) {
        if (typeof path === 'string' && path.startsWith('?.')) {
            resolvedParams[paramName] = resolveValue(path, options.from);
        } else {
            resolvedParams[paramName] = path; // pass through non-path values
        }
    }
}
await handler.assign(lhsTarget, resolvedParams, options);
```

### Should `resolve` values also support protocols?

Since `resolveValues` now supports `protocols`, should the `resolve` map also support protocol-prefixed values (e.g., `'globalThis://myConfig'`)? If so, we'd use `resolveValues` instead of individual `resolveValue` calls — which would make it async (it already is in `processHandlerCommands`).

I'd say **yes** — use `resolveValues` for the `resolve` map. It's already async, and you get protocol support for free:

```typescript
let resolvedParams: Record<string, any> = {};
if (config.resolve) {
    resolvedParams = await resolveValues(config.resolve, options.from, {
        withMethods: options.withMethods,
        aka: options.aka,
        protocols: options.protocols
    });
}
await handler.assign(lhsTarget, resolvedParams, options);
```

This means `resolve` values can be `?.` paths, protocol strings, or plain literals — full power of `resolveValues`.

### Ready to implement

Shall I proceed? The changes are:
1. Remove `from` handling from `processHandlerCommands.ts`
2. Add `resolve` map processing via `resolveValues`
3. Update the `AssignFromHandler` interface: `assign(lhsTarget, resolvedParams: Record<string, any>, options)`

---

## Human Response I

Yes, please proceed.
