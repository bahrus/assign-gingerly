# Support for asynchronous loading

---

## Human Ask

Up to this point, assign-gingerly has strove to be synchronous as much as possible.  The two major exceptions have been itemscope managers and the @eachTime directive.  When it came to element enhancements, a conscious decision was made to only support "spawn" as a class constructor, and not support spawn to point, for example, to an asynchronous function that returns a constructor.  The thinking was that the asynchronous loading could be accomplished via the mount-observer discovery mechanism.  Since the platform doesn't natively support (synchronous) discovery of all elements satisfying some conditional logic that immediately enables the enhancement (say, for example, based on the presence of one of a suite of enhancement attributes), we could asynchronously load the enhancement configuration, including the potentially heavy spawn code only when applicable, i.e. lazy loading by necessary default when mount-observer discovers an element that needs upgrading based on developer criteria.

But for custom element features, the performance benefits of supporting asynchronous loading of the feature javascript is too signifnicant to sweep under the rug.

Let me address one issue that this library will consciously **not** address:

What happens if assignGingerly or gest regular property setting is applied to a custom element after the the customElementRegistry.define was called, but before customElementRegistry.assignFeatures is defined, and this includes setting properties for one of these features?  Do we need to retroactively find all the custom element instances where data has been passed to the "unknown property", and "upgrade" the property to a getter/setter, and instantiate the spawn instance, and pass what was previously passed in to the instance?

The reason we don't think it is our burden to solve for this is:

We believe a full blown standard from the platform would combine the assignFeatures method into the define method, doing everything in one call.  This polyfill is avoiding that in order to avoid risky surgery, but we don't see any reason why the developer wouldn't want to register the class and register the features in two sequential synchronous lines of code.  If the developer fails to do so, bad on them.

We should, at least, document this clearly, which should be considered part of this proposal.

In fact, in what follows below, I think we will agree we should document that by necessity, the call to assignFeatures should be called before calling the define method.

However, the brunt of this proposal is to enhance the features to support two useful scenarios:

1.  If properties/data was passed to an unknown element, but then the custom element upgrades, the developer of the custom element should have a way to read what data had been passed in, ideally with a single line of code

To support this, for starters, we need to start enhancing the following two types to be as follows

```TypeScript
/**
 * Configuration for a supported feature slot declared via static supportedFeatures
 */
export interface SupportedFeatureConfig {
  /**
   * Optional fallback class to spawn if no implementation is injected
   */
  fallbackSpawn?: { new(hostElement: any, ctx: tbd, initVals: an): any };

  /**
   * Optional runtime shape validation for the spawned instance.
   * Return true if the instance is valid, false to throw.
   */
  validateShape?: (spawnedInstance: any) => boolean;
}

/**
 * Configuration for a feature injection passed to assignFeatures
 */
export interface FeatureInjection {
  /**
   * The class to instantiate for this feature.
   * Constructor receives the host element as its first argument.
   */
  spawn?: { new(hostElement: any, ctx: tbd, initVals: any): any };
}
```

Let's actually stop there with this proposal.  I was thinking this proposal would also talk about supporting asynchronous spawneres, but let's make that Part III, and deal with the second implicit scenario after we fully resolve this first scenario.