# Support for Custom Element Registry

Google Canary Chrome now supports scoped custom element registries.

Among other features of this new standard is that all elements that are an instanceof Element will have property customElementRegistry of type CustomElementRegistry.

Please add a global interface for CustomElementRegistry in object-extension.ts:

```TypeScript
declare global {
  interface CustomElementRegistry {
    "assignGingerlyRegistry": typeof BaseRegistry | BaseRegistry;
  }
}
```

The type should match the existing IAssignGingerlyOptions.registry type exactly.

Please add assignGingerlyRegistry to the CustomElementRegistry prototype with an instance of new BaseRegistry().  Because this is part of a polyfill implementation for standard proposal, no effort should be made to shield the developer from future platform API's.

Because Playwright doesn't yet support Chrome 146, we cant yet playwright unit tests automatically.  Please create test html pages, but no *.spec.ts files for now until Playwright catches up.

For now, this is the requirements for Requirement6:

object-extension.js has the following function added to the Object prototype

```JavaScript
/**
 * Adds assignGingerly method to all objects via the Object prototype
 */
Object.defineProperty(Object.prototype, 'assignGingerly', {
  value: function <T extends object>(
    this: T,
    source: Record<string | symbol, any>,
    options?: IAssignGingerlyOptions
  ): T {
    assignGingerly(this, source, options);
    return this;
  },
  writable: true,
  enumerable: false,
  configurable: true,
});
```

The options parameter has an option for a registry:

```TypeScript
/**
 * Interface for the options passed to assignGingerly
 */
export interface IAssignGingerlyOptions {
  registry?: typeof BaseRegistry | BaseRegistry;
}
```

If:

1.  assignGingerly is called an instanceof Element, and
2.  options is undefined or options.registry is undefined, then

call assignGingerly with:

```JavaScript
options.registry = this.customElementRegistry.assignGingerlyRegistry;
```