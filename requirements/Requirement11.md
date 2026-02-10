# Shared spawn instances

Requirement7 has another fundamental flaw I overlooked.

Whether or not the registryItem has an enhKey, at most only one instance should be spawned from the class per element.  

object-extension.ts line 105 should really be checking getInstanceMap from line 31 of assignGingerly.  

The entire handshake with enhKey in object-extension should also happen in assignGingerly.ts around line 365 or later *if registryItem has the optional enhKey config setting to a sting or symbol.*.  It would be nice if common code could be share between object-extension.ts and assignGingerly.ts, but not required.  The rest of the logic, with holding on to the spawned instance via const instanceMap = getInstanceMap(); needs to continue to take place.

And vice-versa -- when object-extension''s set logic takes place, we should be storing the spawned instance in (globalThis as any)[INSTANCE_MAP_GUID] in the same place.  So probably some exported functions or constants need to be added to assignGingerly.ts for this to happen.