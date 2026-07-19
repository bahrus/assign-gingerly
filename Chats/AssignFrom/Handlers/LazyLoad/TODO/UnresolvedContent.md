# Unresolved Content

---

## Human Ask

First, feel very free to push back on this.  This added complexity might be better achieved by lazyload / lazyloadswitches themselves.

What if we want some "loading..." type content to appear before the lazy load logic has executed, for example in server streamed html?

This also ties in with a desire to kind of support an "else" display, but where that else content is minimal, so that lazy loading is overkill.

```html
<html>
    <head>...</head>
    <body>
        <div .mainView>
            My Mood:
            <div .mainView>
                <?start name=elseMood>
                    Waiting for a mood to be determined
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

```JS
assignFrom(myDomElement, {
    '?.querySelector?..mainView =>': [
        {
            do: 'builtIns.lazyLoadSwitch',
            get:{
                lhs: '?.lhs',
                op: '===', //default
                rhs: '?.rhs',
                instantiate: 'globalThis://happyMood',
                method: 'appendChild', //default,
                elseMarker: 'elseMood',
            }
        },
        {
            do: 'builtIns.lazyLoadSwitch',
            get:{
                lhs: '?.lhs',
                op: '!==',
                rhs: '?.rhs',
                instantiate: 'globalThis://sadMood',
                method: 'appendChild', //default
                elseMarker: 'elseMood',
            }
        }
    ]
}, {
    withMethods: ['querySelector'],
    from: myVM
})
```

Maybe using markers for this doesn't make sense, and it would make more sense to specify an id of an element?

Is this a valid use case?

---

## AI Response

This is a valid use case — and it's one that comes up often in progressively-enhanced SSR patterns. The "placeholder content that disappears once real content loads" is a well-established pattern (skeleton screens, loading spinners, "connecting..." messages). Let me break it down:

### The core need

You have two distinct scenarios here, and they're worth separating:

1. **Loading placeholder** — content that shows *before* the JS has run (SSR/streamed HTML), then disappears permanently once the real content is cloned in.

2. **Else branch** — content that shows when the condition is *false*, as a lightweight alternative to lazy-loading a whole template for the "off" state.

Both share the same mechanic: "remove/hide this pre-existing content when the handler activates." But their lifecycles differ:
- A loading placeholder is one-shot (once gone, never comes back)
- An else branch toggles with the condition

### Pushback (as invited)

I'd push back mildly on the **complexity location**, not the feature itself.

The `lazyLoad` handler already has a natural place for this: it manages markers, it tracks show/hide state, and it already knows how to remove nodes between markers. Adding "also hide/remove nodes between a *different* named marker pair" is a small extension of existing logic.

But `elseMarker` as a name is slightly confusing because it conflates two different use cases (loading vs. else). Consider:

- **`placeholder`** — "remove this pre-existing placeholder when I first activate" (one-shot)
- **`else`** — "show this when my condition is false, hide when true" (toggling)

These could be one parameter if you accept that the placeholder is just the initial state of an "else" — which is actually true. Before JS runs, the condition hasn't been evaluated yet, so the "else" content is showing by default. Once the condition becomes true, the else content hides. If the condition later becomes false again, it re-shows.

### Markers vs. element ID

Your instinct about IDs is worth considering:

**Markers (`<!--?start name=X-->...<!--?end-->`):**
- Already the internal mechanism lazyLoad uses
- Server can stream them without adding real DOM nodes
- No styling side effects
- But: comment markers in authored HTML feel unusual — they're typically an implementation detail

**Element with ID (e.g., `<div id="elseMood">...</div>`):**
- More familiar to authors
- Easily styled (transitions, opacity)
- But: the handler needs to find and hide/show a sibling or child element by ID, which is a slightly different operation than managing marker pairs

**My recommendation:** Use markers, but for a DX reason — the handler already operates in terms of markers. Finding an existing named marker pair and hiding its content is zero new concepts. The server just needs to emit the markers, which is trivially embeddable in any template language:

```html
<!--?start name="placeholder"-->
<div class="loading-spinner">Loading...</div>
<!--?end-->
```

### Suggested API

Rather than `elseMarker`, I'd suggest `placeholder` for the one-shot case and simply relying on the existing `forget` behavior for toggle:

```JS
{
    do: 'builtIns.lazyLoadSwitch',
    get: {
        lhs: '?.mood',
        rhs: 'happy',
        instantiate: 'globalThis://happyMood',
        placeholder: 'elseMood',  // remove content in this marker pair on first activation
    }
}
```

**Behavior:**
- On first call where condition is true: find `<!--?start name="elseMood"-->...<!--?end-->`, remove its contents (one-shot), then clone the template into the handler's *own* markers as usual.
- If condition is false: the placeholder content remains visible (it was there from SSR). No template is cloned.
- For true "else" toggling (show placeholder when condition is false, hide when true): that's just `builtIns.lazyLoad` on the placeholder markers with the *negated* condition — you'd use two handlers in the array, which is what your example already does.

### Is it worth building?

Yes, but the scope is small. It's essentially: "on first clone, also nuke content in a named marker pair." That's ~5 lines in the `cloneAndInsert` path. The "else" toggling is already achievable today with two handlers (one for true-state template, one for false-state template). The missing piece is just the one-shot placeholder removal.

Whether to call it `placeholder`, `replaces`, or `elseMarker` is a naming question. I lean toward `replaces` — it reads naturally: "this handler's content *replaces* the content in marker X."

---

## Human Response I

> **Markers (`<!--?start name=X-->...<!--?end-->`):**
> - Already the internal mechanism lazyLoad uses
> - Server can stream them without adding real DOM nodes
> - No styling side effects
> - But: comment markers in authored HTML feel unusual — they're typically an implementation detail

Not necessarily germane to the subject at hand (actually I think it strengthens your arguments), but I'm hoping they start feeling less unusual as [out of order streaming](https://developer.chrome.com/blog/declarative-partial-updates) rolls out.

Anyway, I think I like your approach.  "placeholder" seems like a good name, given the precedence with input elements.

Please implement and document.

