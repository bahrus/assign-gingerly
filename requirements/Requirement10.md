# No adding properties directly to built in OOM elements

I major oversight of Requirement7 is that we should not be writing willy-nilly to any property name of DOM elements, as this could conflict with future properties added by the platform.

Instead, a proposal made to WHATWG that this is part of is advocating adding a special property to the Element prototype, called "enh", similar to dataset, but which allows for spawned classes.

So this working in Requirement 7:

```JavaScript
oElement.set.myEnh.myEnhProp = 'hello'
```

does the following:

Checks if there's a registry item in oElement.customElementRegistry.assignGingerlyRegistry which has enhKey === 'myEnh'.

If so,

     checks if oElement.myEnh already exists as an instance of class constructor.

```JavaScript
if (oElement[enhKey] && oElement[enhKey] instanceof SpawnClass) {
  // Already exists, just use it
} else {
  // Need to spawn
}
```

should have been:

```JavaScript
oElement.enh.set.myEnh.myEnhProp = 'hello'
```

does the following:

Checks if there's a registry item in oElement.customElementRegistry.assignGingerlyRegistry which has enhKey === 'myEnh'.

If so,

     checks if oElement.enh.myEnh already exists as an instance of class constructor.

```JavaScript
if (oElement.enh.[enhKey] && oElement.enh.[enhKey] instanceof SpawnClass) {
  // Already exists, just use it
} else {
  // Need to spawn
}
```

So far starters, please add a lazy property getter to the element prototype "enh" which should probably be a class with a lazy "set" property, which does what you implemented with requirement7.

Please update all the code and the WPT tests accordingly.