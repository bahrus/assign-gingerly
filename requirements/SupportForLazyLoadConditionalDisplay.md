# Support for Lazy Load Conditional Display Assign From Handler

Now that we have a [formal mechanism by which assignFrom](Done/AssignFrom/AssignFromDefine.md) can utilize common plugins via handlers, let's start with a much simpler built-in handler than the eventual goal of [support for repeated template instantiation](../thoughtExperiments/SupportForMergingInTemplateInstantiation.md).

```html
<html>
    <head>...</head>
    <body>
        <div>
            <?start name=myTemplateTarget>
              Not sure what mood is...
            <?end>

            ...
            <template id=myTemplate>
                I am happy
            </template>
        </div>
    </body>
</html>
```

```JavaScript
const myVM = {
    isHappy: true
}

assignFrom(myDomElement, {
    '?.querySelector?.div =>': {
        do: 'my-macro',
        from: '?.myList',
        myCustomData: {
            ...
        } 
    }
}, {
    withMethods: ['querySelector'],
    from: myVM
})
```