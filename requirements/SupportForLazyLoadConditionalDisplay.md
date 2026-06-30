# Support for Lazy Load Conditional Display Assign From Handler

Now that we have a [formal mechanism by which assignFrom](Done/AssignFrom/AssignFromDefine.md) can utilize common plugins via handlers, let's start with a much simpler built-in handler than the eventual goal of [support for repeated template instantiation](../thoughtExperiments/SupportForMergingInTemplateInstantiation.md).

A significant use case for this is routing.

```html
<html>
    <head>...</head>
    <body>
        <div .mainView>
            My Mood:
            <div .mainView></div>
        </div>

...
        <template id=happyMood>
            I am happy
        </template>
    </body>
</html>
```

```JavaScript
const myVM = {
    isHappy: true
}

assignFrom(myDomElement, {
    '?.querySelector?..mainView =>': {
        do: 'builtIns.lazyLoad',
        resolve:{
            if: '?.isHappy'
            instantiate: 'globalThis://happyMood'
            method: 'appendChild' //default
        }
    }
}, {
    withMethods: ['querySelector'],
    from: myVM
})
```