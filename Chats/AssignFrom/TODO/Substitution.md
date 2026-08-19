# Substitution

---

## Bruce's Ask

I was hesitant to propose this, but the use cases for this just seem too compelling to not do.  When resolving the rhs in an assignFromCall, we need the ability to substitute in values from the "from" argument:

Phase I

```JS
const myCustomElement = this;
myCustomElement.inertTarget = '#main';
assignFrom(myCustomElement, {
    inertTargetElements: '?.ownerDocument?.querySelectorAll?.${inertTarget}'
}, {
    from: myCustomElement,
    withMethods: ['querySelectorAll']
})
```

I'm open to something other than ${} if that could seem confusing due to its other uses.  

Phase Maybe Never

I don't think there's a compelling case for Phase II, but I wouldn't be shocked if a (weak) use case does arise to allow chained accessor expressions inside ${}.

Phase Too Hard To Even Consider

If we ever did consider implementing Phase Maybe Never, supporting nested ${}'s inside that seems a step too far.  

Do you think implementing Phase I is achievable?  Any ambiguities that need clarifying first?

