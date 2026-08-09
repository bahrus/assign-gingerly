# Small Penalty for Unused Permission Support

The module [restrictedProps](/assignPermissions/restrictedProps.js) is getting quite large, and is only anticipated to be used for a minority of use cases -- cases where the assignment rules cannot be properly vetted, such as from HTML attributes.

Because the three main assign* functions are synchronous, they cannot conditionally import the module on demand.

I think a better approach to this dilemma is to allow for externally passing that module.  Or perhaps it would be cleaner to turn the module into a self contained class (with static methods?):

```JS
{
    PermissionProcessor: ctr
}
```

I don't think it matters too much what form it takes, so unless you think there's a meaningful and important "fork in the road" decision to make, what approach would you recommend taking?



