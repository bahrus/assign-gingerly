# Shared spawn instances

Requirement7 had a fundamental flaw I overlooked.

Whether or not the registryItem has an enhKey, at most only one instance should be spawned from the class per element.  

object-extension.ts line 105 should really be checking getInstanceMap from line 31 of assignGingerly.  

The transfer of any previous passed object properties to the enhKey of the element:

```JavaScript
oElement.enh[enhKey]
```

 needing to be passed to the  