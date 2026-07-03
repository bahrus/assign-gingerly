# Lazy Load Switch

---

## Human Ask

I'm open to this being combined with the already implemented [Lazy Load Conditional Display Part I](../LazyLoad/SupportForLazyLoadConditionalDisplayP1.md). This was going to be Part II, but now I'm thinking it might be cleaner if this is treated as a separate, related handler, perhaps with some shared modules.

I'm also open to renaming the original lazyLoad handler, in light of this one.  No external package has used these yet, so no concerns about backwards compatible.

This one would also be used for routing (among other purposes)

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
            <div>I am happy</div>
            <div>I am healthy</div>
        </template>
        <template id=sadMood>
            <div>I am sad</div>
            <div>I am ill</div>
        </template>
    </body>
</html>
```

```JavaScript
const myVM = {
    lhs: 37,
    rhs: 38
}

assignFrom(myDomElement, {
    '?.querySelector?..mainView =>': [
        {
            do: 'builtIns.lazyLoadSwitch',
            resolve:{
                lhs: '?.lhs',
                op: '===', //default
                rhs: '?.rhs',
                instantiate: 'globalThis://happyMood',
                method: 'appendChild', //default
            }
        },
        {
            do: 'builtIns.lazyLoadSwitch',
            resolve:{
                lhs: '?.lhs',
                op: '!==',
                rhs: '?.rhs',
                instantiate: 'globalThis://sadMood',
                method: 'appendChild', //default
            }
        }
    ]
}, {
    withMethods: ['querySelector'],
    from: myVM
})
```

Results in:

```html
<html>
    <head>...</head>
    <body>
        <div .mainView>
            My Mood:
            <div .mainView>
                <?start name="sadMood">
            <div>I am sad</div>
            <div>I am ill</div>
                <?end>
            </div>
        </div>

...
        <template id=happyMood>
            <div>I am happy</div>
            <div>I am healthy</div>
        </template>
        <template id=sadMood>
            <div>I am sad</div>
            <div>I am ill</div>
        </template>
    </body>
</html>
```

Support for everything that lazyLoad supports, where it makes sense, like onInstantiated would also be provided.