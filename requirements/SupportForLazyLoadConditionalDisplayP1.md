# Support for Lazy Load Conditional Display Assign From Handler

Now that we have a [formal mechanism by which assignFrom](Done/AssignFrom/AssignFromDefine.md) can utilize common plugins via handlers, let's start with a much simpler built-in handler than the eventual goal of [support for repeated template instantiation](../thoughtExperiments/SupportForMergingInTemplateInstantiation.md).

A significant use case for this is routing.

## Scenario I  Binary lazy load

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
            if: '?.isHappy',
            instantiate: 'globalThis://happyMood',
            method: 'appendChild', //default
        }
    }
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
                <?start name="happyMood">
                    <div>I am happy</div>
                    <div>I am healthy</div>
                <?end>
            </div>
        </div>

...
        <template id=happyMood>
            <div>I am happy</div>
            <div>I am healthy</div>
        </template>
    </body>
</html>
```


## Scenario IIa Binary unload - hiding

```html
<html>
    <head>...</head>
    <body>
        <div .mainView>
            My Mood:
            <div .mainView>
                <?start name="happyMood">
                    <div>I am happy</div>
                    <div>I am healthy</div>
                <?end>
            </div>
        </div>

...
        <template id=happyMood>
            <div>I am happy</div>
            <div>I am healthy</div>
        </template>
    </body>
</html>
```

```JavaScript
const myVM = {
    isHappy: false
}

assignFrom(myDomElement, {
    '?.querySelector?..mainView =>': {
        do: 'builtIns.lazyLoad',
        resolve:{
            if: '?.isHappy',
            instantiate: 'globalThis://happyMood',
            method: 'appendChild', //default
        }
    }
}, {
    withMethods: ['querySelector'],
    from: myVM
})
```

results in:

```html
<html>
    <head>...</head>
    <body>
        <div .mainView>
            My Mood:
            <div .mainView>
                <?start name="happyMood">
                    <div hidden>I am happy</div>
                    <div hidden>I am healthy</div>
                <?end>
            </div>
        </div>

...
        <template id=happyMood>
            <div>I am happy</div>
            <div>I am healthy</div>
        </template>
    </body>
</html>
```

## Scenario IIb -- Binary unload

```html
<html>
    <head>...</head>
    <body>
        <div .mainView>
            My Mood:
            <div .mainView>
                <?start name="happyMood">
                    <div>I am happy</div>
                    <div>I am healthy</div>
                <?end>
            </div>
        </div>

...
        <template id=happyMood>
            <div>I am happy</div>
            <div>I am healthy</div>
        </template>
    </body>
</html>
```

```JavaScript
const myVM = {
    isHappy: false
}

assignFrom(myDomElement, {
    '?.querySelector?..mainView =>': {
        do: 'builtIns.lazyLoad',
        resolve:{
            if: '?.isHappy',
            instantiate: 'globalThis://happyMood',
            method: 'appendChild', //default
            forget: true,
        }
    }
}, {
    withMethods: ['querySelector'],
    from: myVM
})
```

results in:

```html
<html>
    <head>...</head>
    <body>
        <div .mainView>
            My Mood:
            <div .mainView>
            </div>
        </div>

...
        <template id=happyMood>
            <div>I am happy</div>
            <div>I am healthy</div>
        </template>
    </body>
</html>
```