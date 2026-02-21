#  Support for ValIfNull

While parsing the withAttrs in order to create the initVals object, what to do if the attribute isn't present may in some cases be useful to specify a default value.

So we should enhance AttrConfig with:

```TypeScript
export interface AttrConfig<T = any> {
  valIfNull?: 'nothing'
}
```