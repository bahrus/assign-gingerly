# Built ins

---

## Human Ask

I think being that handlers can be loaded asynchronously, it would be more meaningful if  invoking the built in ones, like lazyLoad, by name automatically dynamically loads the handler, within processHandlerCommands.js.  So these don't get registered in the currently global AssignFrom map (which I plan to adopt your earlier advice of supporting custom element registries for this).

This means we can remove this from the README.md:

```JavaScript
import 'assign-gingerly/handlers/lazyLoad.js';
```