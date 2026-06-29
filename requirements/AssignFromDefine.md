# AssignFrom Define of Macros

---

## Human Ask

As a developer, I would like to be able to create reusable ways of doing complex assignment "macros" when calling the assignFrom function.  I'm not sure "macro" is the best term. Also, there are some scenarios that are so useful, that I would like to include them as built-in macros that the assign-gingerly package provides.  One such Macro would be one that is loosely defined in [Support For Merging In Template Instantiation](../thoughtExperiments/SupportForMergingInTemplateInstantiation.md), which indicates how much "power" we need these macros to possess.

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