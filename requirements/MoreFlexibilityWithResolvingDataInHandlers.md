# More flexibility with Resolving data in Handlers

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