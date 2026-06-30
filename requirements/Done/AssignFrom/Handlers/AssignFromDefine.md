# AssignFrom Define of Macros

---

## Human Ask

As a developer, I would like to be able to create reusable ways of doing complex assignment "macros" when calling the assignFrom function.  I'm not sure "macro" is the best term. Also, there are some scenarios that are so useful, that I would like to include them as built-in macros that the assign-gingerly package provides.  One such macro would be one that is loosely defined in [Support For Merging In Template Instantiation](../thoughtExperiments/SupportForMergingInTemplateInstantiation.md), which indicates how much "power" we need these macros to possess.

To invoke a macro, the lhs must end with ' =>', as the example below shows.

### Proposed Syntax

The developer defines a class (or function prototype if no need to extend a class):

```TypeScript
interface MacroConfig {
    do: string,
    from?: string
}

import {AssignFrom} from 'assign-gingerly/assignFrom.js';

class MyMacro<TMacroConfig extends MacroConfig> { //maybe extends some base class?
    //this constructor is called the first time the rhs is encountered
    //based on a map lookup
    //might be useful for some caching?
    constructor(config: TMacroConfig){
        ...
    }

    async assign(
        lhsTarget: any,
        resolvedRHS: any, // based on the optional from expression
        options: AssignFromOptions){
        ...
    }

}

AssignFrom.define('my-macro', MyMacro);

const myVM = {...}

assignFrom(myDomElement, {
    '?.querySelector?.div =>': {
        do: 'my-macro',
        from: '?.myList',
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

### The concept is sound

This is essentially a plugin/strategy pattern for `assignFrom`. When a LHS key ends with ` =>`, instead of normal assignment, delegate to a registered "macro" class that knows how to handle the RHS config. Clean separation — `assignFrom` handles the plumbing (path resolution, method calls), the macro handles the domain logic (template instantiation, list management, etc.).

### Naming

"Macro" is reasonable but might confuse people thinking of C-style preprocessor macros or Lisp macros. Alternatives:
- **operator** — `AssignFrom.defineOperator('my-op', MyOp)` (but ` =>` is the operator, the class is the handler)
- **handler** — `AssignFrom.defineHandler('my-handler', MyHandler)`
- **strategy** — `AssignFrom.defineStrategy(...)` 
- **action** — `AssignFrom.defineAction(...)`

I'd lean toward **handler** — "when you encounter `=>`, look up and invoke the handler." But "macro" works too. Not a blocker.

### Design feedback

**1. The `do` field as the lookup key**

```javascript
'?.querySelector?.div =>': {
    do: 'my-macro',
    ...
}
```

The `do` string is the key into the registry. This is clean — the RHS is a self-describing config object. The handler class is resolved at runtime from the registry by name.

**2. `from` on the RHS config**

```javascript
{
    do: 'my-macro',
    from: '?.myList'
}
```

This `from` is resolved against the `assignFrom` options' `from` source (the view model). So the handler receives already-resolved data. That's good — the handler doesn't need to know about path resolution.

**3. Constructor vs assign separation**

The constructor receives the raw config (for caching/parsing), and `assign` is called with the resolved target + data. This is a good split — the macro instance can be reused across multiple invocations if the config is the same (e.g., same template across many elements).

**4. The ` =>` command detection**

This follows the pattern of ` +=`, ` =!`, ` -=` — a space + operator suffix on the LHS key. Consistent with existing conventions. `assignFrom` (not `assignGingerly`) would check for this, since it's the one that handles `from` resolution.

### Concerns (minor, not blockers)

**1. Where does the registry live?**

`AssignFrom.define(...)` as a static method is fine for global macros. But should it also support scoped registries (per `CustomElementRegistry`, like everything else)? Probably not initially — these macros are likely application-wide. Can add scoping later if needed.

**2. Should `assignGingerly` also support ` =>`?**

If someone calls `assignGingerly` (not `assignFrom`) with a ` =>` key, should it be ignored? Throw? I'd say ignore — ` =>` is an `assignFrom`-only feature since it needs the `from` source for resolution. Document this clearly.

**3. Async**

The `assign` method is async — matches `assignFrom` being async. The macro does its work (DOM manipulation, async loading, etc.) and the overall `assignFrom` awaits it. No issue here.

**4. Should the macro receive the full path-evaluated target, or the raw path?**

Based on the example, the LHS is path-evaluated first (via `withMethods: ['querySelector']`), then the resolved DOM element is passed to `assign` as `lhsTarget`. That's right — the macro doesn't need to know about path navigation.

### Implementation sketch

```typescript
// In assignFrom.ts or a separate module:
const macroRegistry = new Map<string, { new(config: any): { assign(target: any, resolved: any, options: any): Promise<void> } }>();

export function defineAssignFromHandler(name: string, HandlerClass: any): void {
    macroRegistry.set(name, HandlerClass);
}

// In the assignFrom processing loop, after resolving the LHS path:
if (key.endsWith(' =>')) {
    const lhsPath = key.slice(0, -3); // Remove ' =>'
    const lhsTarget = /* evaluate path */;
    const config = resolved[key]; // the RHS object
    const handlerName = config.do;
    const HandlerClass = macroRegistry.get(handlerName);
    if (!HandlerClass) throw new Error(`Unknown assignFrom handler: "${handlerName}"`);
    
    // Resolve 'from' if present
    const fromData = config.from ? resolveValue(config.from, options.from) : undefined;
    
    const handler = new HandlerClass(config);
    await handler.assign(lhsTarget, fromData, options);
}
```

### Summary

| Aspect | Assessment |
|--------|-----------|
| Fits in assign-gingerly? | Yes — `assignFrom` extension |
| The ` =>` convention | Consistent with existing ` +=`, ` -=` commands |
| Plugin/registry pattern | Clean, extensible |
| Async | Natural (assignFrom is already async) |
| Built-in macros | Good idea — template list management is the first candidate |
| Naming | "handler" or "macro" both work |
| Scoped registry | Defer — global is fine for now |

Ready to implement when you want to move forward.

---

## Human Response I

I agree with all your recommendations.  Let's go with handler.  As far as I can tell, from the developer point of view, the name doesn't matter, but when documenting the feature, and when naming methods, let's use handler where applicable.
