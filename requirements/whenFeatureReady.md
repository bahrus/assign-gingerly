# Support for life cycle keys

---

## Human Ask

This proposal is advocating adding a section "lifecycleKeys" to the SupportedFeatureConfig interface:

```Typescript
export interface SupportedFeatureConfig {
  ...

  lifecycleKeys?: {
    whenFeatureReady: 'whenFeatureReady'
  }
}
```

If present, a method is added to the constructor prototype with the specified name ('whenFeatureReady' in this case):

```Javascript
//I don't recall the syntax for dynamically adding a method to the class prototype
Object.defineProperty(ctr, 'whenFeatureReady', {

});
```

that would do the equivalent of the following:

```JavaScript
class MyCustomElement{
    async whenFeatureReady<TFeatures>(featureName: keyof TFeatures){
        //see if spawn is synchronous.  If so, get the instance, making sure it passes through the ceremony as far as getting the initVals, etc.  pass it back after the instance is stored in storage
        //if not, do whatever is needed to asynchronously place the feature in storage.
        //either way, pass back the instance when ready
    }
}
```