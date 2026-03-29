```TypeScript
/**
 * Interface for the options passed to assignGingerly
 */
export interface IAssignGingerlyOptions {
  ...
  NoSupportForSubClassPrioritization
}
```

When assigning a property of an object with a new value, there are a number of scenarios:

1.  The existing property value is an object, and the new value is an object, and the prototype of the object is neither a subclass nor a superclass of the new value