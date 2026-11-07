# More ironclad guarantee of spawned instance lookup

The instanceMap in line 24 of assignGingerly has a fundamental problem.

If there are different versions of this package floating around, they will each get their own instance.  The uniqueness requirement is too important to allow this to happen.

The instanceMap should instead be stored in globalThis[guid].

