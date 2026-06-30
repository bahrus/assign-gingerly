# Support for Lazy Load Conditional Display Assign From Handler Part I

Now that we have a [formal mechanism](Done/AssignFrom/Handlers/AssignFromDefine.md) [by which assignFrom](Done/AssignFrom/Handlers/MoreFlexibilityWithResolvingDataInHandlers.md) can utilize common plugins via handlers, let's start with a much simpler built-in handler than the eventual goal of [support for repeated template instantiation](../thoughtExperiments/SupportForMergingInTemplateInstantiation.md).

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
            <div>I am happy</div>
            <div>I am healthy</div>
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


---

## Kiro's Comments

### Overall assessment

This is a well-scoped first handler. It covers a real, common pattern (conditional rendering / routing) and the three scenarios (load, hide, remove) cover the full lifecycle cleanly.

### The processing instruction markers (`<?start?>` / `<?end?>`)

This is clever — using XML processing instructions as range markers. They're valid in HTML (browsers preserve them as Comment-like nodes), they don't affect layout, and they provide a way to identify "which cloned content belongs to which template" without wrapper elements.

**One note:** In HTML, `<?...>` is parsed as a comment node (not a true PI like in XML). The browser creates a `Comment` node whose `data` starts with `?`. So you'd be working with `document.createComment('?start name="happyMood"')` etc. This works but is worth documenting — it's not a real Processing Instruction in the DOM sense.

### The `resolve` field usage

```javascript
resolve: {
    if: '?.isHappy',
    instantiate: 'globalThis://happyMood',
    method: 'appendChild',
}
```

I notice `method` and `forget` are in `resolve` — but they're not paths to resolve, they're static config. Should they be in `resolve` (and thus resolved against the `from` source) or directly on the config object?

If they're in `resolve`:
- `method: 'appendChild'` — resolveValues would pass this through as a literal string (doesn't start with `?.` or have a protocol). So it works fine.
- `forget: true` — same, passes through as-is.
- `if: '?.isHappy'` — resolved against the source. ✓
- `instantiate: 'globalThis://happyMood'` — resolved via protocol. ✓

So putting everything in `resolve` actually works cleanly — static values pass through, paths get resolved, protocols get resolved. The handler just reads `resolvedParams.if`, `resolvedParams.instantiate`, `resolvedParams.method`, `resolvedParams.forget`. Simple.

### The `instantiate` field

This resolves to what — an `HTMLTemplateElement`? A string ID? The protocol `globalThis://happyMood` suggests looking up `globalThis['happyMood']`... but that would require the template to be stored on `globalThis`. More likely it should be `document.getElementById('happyMood')` or a querySelector.

Maybe the intent is:
- The `weave` library (from the earlier thought experiment) stores resolved templates on globalThis by GUID
- Or it's a shorthand for "find a template with this ID in the document"

**Suggestion:** Could the protocol handler for this be something like `template://happyMood` → `document.getElementById('happyMood')` (a built-in protocol for template lookup)? Or is `globalThis://` the right convention because the template ref was pre-stored there?

### Implementation concerns (all minor)

1. **Finding existing content by marker:** The handler needs to search for `<?start name="X">` comment nodes inside the target. This is a DOM tree walk — not expensive for typical use, but worth noting.

2. **Hidden vs removed:** Scenario IIa (hide) adds `hidden` attribute to each child between the markers. Scenario IIb (forget/remove) removes them entirely. Clear distinction via the `forget` flag.

3. **Re-showing:** If `if` becomes true again after hiding, the handler removes the `hidden` attributes. No re-cloning needed — the nodes are still there.

4. **Re-loading after forget:** If `forget: true` was used and `if` becomes true again, the handler clones the template again (since the nodes were removed). The markers would need to persist even after removal so the handler knows where to re-insert.

### No show-stoppers

This is implementable with the current handler infrastructure. The handler class would be something like:

```javascript
class LazyLoadHandler {
    constructor(config) { this.config = config; }
    
    async assign(lhsTarget, resolvedParams, options) {
        const { if: condition, instantiate, method = 'appendChild', forget } = resolvedParams;
        const templateEl = instantiate; // already resolved via protocol
        
        // Find or create markers
        // If condition: clone + insert (or show existing)
        // If !condition: hide (or remove if forget)
    }
}

defineHandler('builtIns.lazyLoad', LazyLoadHandler);
```

### One question

Should this handler be registered automatically when `assignFrom.js` is imported, or should the consumer explicitly import a built-ins module?

I'd suggest: **separate import** — `import 'assign-gingerly/builtInHandlers.js'` — so the handler code isn't loaded unless needed. Keeps the base `assignFrom.js` lean.

### Ready to implement when you confirm the approach.

---

## Human Response I

I'd like to leave method and forget in the resolve, because I could see some scenarios where we might want these values to be dynamic.

>  This resolves to what — an `HTMLTemplateElement`? A string ID? The protocol `globalThis://happyMood` suggests looking up `globalThis['happyMood']`... but that would require the template to be stored on `globalThis`. More likely it should be `document.getElementById('happyMood')` or a querySelector.

There's a not well-known fact, that this example relies on, that dom elements with id's outside any ShadowRoot become global constants, available via globalThis.

Let's make it a separate import, but I think for now each built in handler should be a separate import, so assign-gingerly/handlers/tbd.js


