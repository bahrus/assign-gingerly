# assigning referentially

This feature makes sense to add to assignGingerly, but not to assignTentatively, as it isn't really reversible.

The desire for this pattern emerged when implementing [this library](https://raw.githubusercontent.com/bahrus/be-clonable/refs/heads/baseline/be-clonable.js), that uses assignGingerly heavily (it merges what the methods return into the object using assignGingerly).

For both the enhancedElement, and the trigger property, what I really want to merge into the class is a weakRef to the thing, to prevent memory leaks.

So here's my tentative proposal:

assignGingerly already supports things like:

```JavaScript
'?.a?.b?.c +=': 3,
'?.a?.b?.c =!': '.', 
'?.a?.b -=': 'c',
```

What this proposal is to support another special symbol:

```JavaScript
'?.trigger :=': myTriggerElement
```

What this does:

1.  If the thing being assigned to is a plain old {} JavaScript object, add a dynamic readonly property called "trigger" to the object.  If, instead, it is an instance of a class, add the readonly property to the class prototype.
2.  A weak reference to myTriggerElement is created, and stored in some private location.  The "trigger" readonly property returns the deref() of the ref, similar to the enhancedElement property of the link above.  The difference though is don't throw an error, just return whatever deref() returns. 