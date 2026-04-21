# Value Symbol

assign gingerly supports a way to (please confirm that these are all true):

1.  Register a function prototype or class in the custom element registry (global or scoped) and then:
2.  Assuming object-extension.js is imported, the "set" property is added to proxy to all objects?  all Elements?  Definition around line 778 of assignGingerly.ts

There's a really common requirement that has come up with a number of enhancements that have come up.  I just want to set the "value" of an Element, without worrying too much about what the specific property should be to set the value.

I think for this requirement, we may also need get added to 

This is Kiro's advice:  https://raw.githubusercontent.com/bahrus/do-toggle/refs/heads/baseline/kiroAdvice.md

I actually ended up with much more complex logic than what is shown there:

https://raw.githubusercontent.com/bahrus/trans-render/refs/heads/baseline/asmr/shareTo/StIn.ts

So this requirement is to something like that, but making use of an extension object:

```TypeScript
import {value} from 'assign-gingerly/somewhere.js';

oElement.set[value] = 'hello'
//if oElement is an input with type=text or password or submit, sets .value = 'hello'
// a bunch of other special conditins
// otherwise sts oElement's textContent = 'hello';
```