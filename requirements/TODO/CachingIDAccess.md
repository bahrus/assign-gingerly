# Caching ID Access

---
## Human Ask

The page /demos/experiments/getElementById-vs-querySelector-perf.html largely confirms what we might expect as far how to optimize repeated access to an element, starting from the shadowRoot, say:

Chrome 150:

<table>
                    <tbody><tr>
                        <th>Method</th>
                        <th>10 elements</th><th>100 elements</th><th>1000 elements</th><th>5000 elements</th>                    </tr>
            <tr><td>shadowRoot.getElementById(id)</td><td class="fastest">46.0 ns</td><td class="">47.0 ns</td><td class="">106.0 ns</td><td class="">100.0 ns</td></tr><tr><td>shadowRoot.querySelector(#id)</td><td class="">46.0 ns</td><td class="fastest">44.0 ns</td><td class="">144.0 ns</td><td class="">144.0 ns</td></tr><tr><td>shadowRoot.querySelector(.class)</td><td class="fastest">36.0 ns</td><td class="">167.0 ns</td><td class="">3760.0 ns</td><td class="">9660.0 ns</td></tr><tr><td>WeakRef.deref() (single cached ref)</td><td class="">13.0 ns</td><td class="">17.0 ns</td><td class="">20.0 ns</td><td class="fastest">11.0 ns</td></tr><tr><td>Map&lt;id, WeakRef&gt;.get(id).deref()</td><td class="">16.0 ns</td><td class="">17.0 ns</td><td class="">24.0 ns</td><td class="fastest">12.0 ns</td></tr><tr><td>Direct reference (baseline)</td><td class="">3.0 ns</td><td class="">3.0 ns</td><td class="">6.0 ns</td><td class="">2.0 ns</td></tr></tbody></table>


Firefox 152:

<table>
                    <tbody><tr>
                        <th>Method</th>
                        <th>10 elements</th><th>100 elements</th><th>1000 elements</th><th>5000 elements</th>
                    </tr>
            <tr><td>shadowRoot.getElementById(id)</td><td class="fastest">20.0 ns</td><td class="fastest">20.0 ns</td><td class="fastest">20.0 ns</td><td class="fastest">20.0 ns</td></tr><tr><td>shadowRoot.querySelector(#id)</td><td class="fastest">40.0 ns</td><td class="fastest">40.0 ns</td><td class="fastest">40.0 ns</td><td class="fastest">40.0 ns</td></tr><tr><td>shadowRoot.querySelector(.class)</td><td class="fastest">50.0 ns</td><td class="">130.0 ns</td><td class="">1250.0 ns</td><td class="">6810.0 ns</td></tr><tr><td>WeakRef.deref() (single cached ref)</td><td class="fastest">20.0 ns</td><td class="fastest">20.0 ns</td><td class="">30.0 ns</td><td class="fastest">20.0 ns</td></tr><tr><td>Map&lt;id, WeakRef&gt;.get(id).deref()</td><td class="fastest">20.0 ns</td><td class="">30.0 ns</td><td class="fastest">20.0 ns</td><td class="">40.0 ns</td></tr><tr><td>Direct reference (baseline)</td><td class="">0.0 ns</td><td class="">0.0 ns</td><td class="">0.0 ns</td><td class="">0.0 ns</td></tr></tbody></table>

Playwright Safari on Windows:

<table>
    <tbody>
        <tr>
            <th>Method</th>
            <th>10 elements</th>
            <th>100 elements</th>
            <th>1000 elements</th>
            <th>5000 elements</th>
        </tr>
        <tr>
            <td>shadowRoot.getElementById(id)</td>
            <td class="">20.0 ns</td>
            <td class="">10.0 ns</td>
            <td class="">10.0 ns</td>
            <td class="fastest">10.0 ns</td>
        </tr>
        <tr>
            <td>shadowRoot.querySelector(#id)</td>
            <td class="">320.0 ns</td>
            <td class="">300.0 ns</td>
            <td class="">310.0 ns</td>
            <td class="fastest">260.0 ns</td>
        </tr>
        <tr>
            <td>shadowRoot.querySelector(.class)</td>
            <td class="fastest">290.0 ns</td>
            <td class="">880.0 ns</td>
            <td class="">7390.0 ns</td>
            <td class="">17770.0 ns</td>
        </tr>
        <tr>
            <td>WeakRef.deref() (single cached ref)</td>
            <td class="fastest">10.0 ns</td>
            <td class="fastest">10.0 ns</td>
            <td class="fastest">10.0 ns</td>
            <td class="fastest">10.0 ns</td>
        </tr>
        <tr>
            <td>Map&lt;id, WeakRef&gt;.get(id).deref()</td>
            <td class="">40.0 ns</td>
            <td class="">30.0 ns</td>
            <td class="fastest">10.0 ns</td>
            <td class="fastest">10.0 ns</td>
        </tr>
        <tr>
            <td>Direct reference (baseline)</td>
            <td class="">10.0 ns</td>
            <td class="">0.0 ns</td>
            <td class="">10.0 ns</td>
            <td class="">0.0 ns</td>
        </tr>
    </tbody>
</table>

To summarize:

Safari is the most dramatic result:

- **`getElementById` — 10ns flat.** Fastest of the three engines for DOM ID lookup.
- **`querySelector('#id')` — 260-320ns.** Surprisingly, Safari's `querySelector` with an ID selector is **30x slower** than `getElementById`. Unlike Chrome/Firefox where they're in the same ballpark, WebKit clearly doesn't optimize `querySelector('#id')` into an ID lookup.
- **`querySelector('.class')` — scales to 17,770ns at 5000 elements.** Worst of all three engines at scale.
- **WeakRef/Map — 10ns.** Matches `getElementById` exactly. At the timer resolution floor.

### Cross-Engine Summary

| Method | Chrome (5000) | Firefox (5000) | Safari (5000) |
|--------|--------------|----------------|---------------|
| getElementById | 100ns | 20ns | 10ns |
| querySelector(#id) | 144ns | 40ns | 260ns |
| querySelector(.class) | 9,660ns | 6,810ns | 17,770ns |
| WeakRef (single) | 11ns | 20ns | 10ns |
| Map<id, WeakRef> | 12ns | 40ns | 10ns |

**Conclusions:**

1. **Never use `querySelector('.class')` in a hot path.** All engines agree — it's 100-1700x slower than alternatives at scale.
2. **`querySelector('#id')` is NOT equivalent to `getElementById`** — Safari proves this definitively (30x difference). Always prefer `getElementById`.
3. **WeakRef caching is universally optimal** — matches or beats `getElementById` on every engine. The Map lookup overhead is negligible.
4. **The WeakRef + Map strategy is the clear winner** for any handler that repeatedly resolves elements: ~10-12ns across all engines, with automatic GC cleanup and a cheap `getElementById` fallback on cache miss.

So for this package to be optimal for repeated calls, ideally there would be a way to point to DOM elements by id and cache them with weak maps, especially the lhs of all the functions (assign-gingerly, assign-tentatively, and assign-from).

## Very Tentative Proposal:

Scenario I.  Element without an ID

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

assignFrom(document.body, {
    '#[x] =>': {
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
    withIds: {
        x: {
            qry: '.mainView',
        }
    }
})
```

The id will *not* be set to x, that's like a variable.  It will be set to as predictable and small an id as possible, unique within the rootNode.