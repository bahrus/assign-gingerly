# Restricted Prop Settings Phase III


---

## Human Ask

```JS
{   
    ...
        //Phase III
        {
            prop: 'src',
            //if not specified, don't check for calls to setAttribute
            attr: 'src', //watches for setAttribute method call
            allowFromSameHost: true, //use isAllowedImportPath?  change name to more generic?
            allowCrossDomain: false, //no holds barred
        }
    ...
}
```