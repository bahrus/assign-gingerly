# Support for View Transition for LazyLoad and LazyLoadSwitch.


---

## Human Ask

The lazy-load and especially LazyLoadSwitch are heavily influenced by the [be-switched](https://raw.githubusercontent.com/bahrus/be-switched/refs/heads/baseline/README.md)

One feature that enhancement supports that the LazyLoad handlers don't yet support is [view transitions](https://github.com/bahrus/be-switched/tree/baseline#use-view-transitions).

The implementation took quite a few iterations to get right, implemented by Kiro.  I wish I had asked kiro to document a "lessons learned" from the experience, but in the absence of that, a [deep study of the code](https://raw.githubusercontent.com/bahrus/be-switched/refs/heads/baseline/be-switched.js) will have to suffice, and is deeply recommended before embarking.  Also, I definitely want a demo and/or test page I can open and test visually for this feature.

be-switched as a single configurable property, transitional, to specify to engage in this api.  The rest relies on css (conventions) to configure how the transition should behave, and does use some "namespaced" css defaults for this, as I recall.

I'm not an expert at all in view transitions, so I open the floor to how you recommend configuring and implementing this feature below.


---

## Feedback / Analysis

### How `be-switched` Does It

After studying the source, here's the pattern:

1. **Detection:** A CSS custom property `--be-transitional: true` (read via `getComputedStyle`) or a `transitional` property on the instance determines whether transitions are enabled.

2. **Show transition (`onTrue`):**
   ```js
   this.#activeTransition?.skipTransition();  // cancel any in-flight transition
   this.#activeTransition = document.startViewTransition(() => {
       // DOM mutation happens inside the callback
       enhancedElement.after(clone);  // or: changeVisibility(children, 'remove')
   });
   ```

3. **Hide transition (`onFalse`):**
   ```js
   this.#activeTransition?.skipTransition();
   this.#activeTransition = document.startViewTransition(() => {
       changeVisibility(children, toggleInert, 'add');  // adds .be-switched-hide class
   });
   ```

4. **Concurrency control:** Uses `#showPending` / `#hidePending` flags to prevent duplicate transitions. If a show is already pending, a new show request is ignored. If a hide arrives while a show is pending, it cancels the show first (via `skipTransition()`).

5. **CSS-driven animation:** The actual animation is pure CSS. `be-switched` adds/removes a `.be-switched-hide` class (whose styling defaults to `display: none` but can be customized to use opacity, transforms, etc.). The View Transition API captures the before/after states and animates between them.

6. **Fallback:** If `document.startViewTransition` is unavailable, DOM mutations happen directly without animation.

### Key Lessons from `be-switched`

1. **Always cancel in-flight transitions** before starting a new one (`skipTransition()`). Rapid state changes (e.g., route flipping back and forth) would otherwise queue up multiple transitions that fight each other.

2. **Pending flags prevent re-entry.** If a show transition is already in progress, don't start another show. Only allow the opposite operation (hide) to interrupt.

3. **Use CSS classes for visibility** (not `hidden` attribute). The View Transition API needs to capture the visual state — `hidden` completely removes the element from rendering, which doesn't give the API anything to animate from/to. A class like `.be-switched-hide { opacity: 0; }` or `{ display: none; }` gives CSS full control over the transition.

4. **Style injection:** `be-switched` lazily injects a `<style>` element into the rootNode with the `.be-switched-hide` class definition. This only happens once per rootNode.

### Proposed Design for `lazyLoad` / `lazyLoadSwitch`

**Configuration — keep it simple:**

Add a `transitional` field to the handler's `resolve` map (or config):

```js
'#[outlet] =>': {
    do: 'builtIns.lazyLoad',
    resolve: {
        if: '?.isVisible',
        instantiate: 'globalThis://myTemplate',
        transitional: true,    // enable view transitions
    }
}
```

That's it from the config side. The animation itself is controlled via CSS (which template/page authors already know).

**CSS conventions:**

The handler injects a minimal default style into the rootNode (once):

```css
.ag-hide {
    display: none;
}
```

Authors can override with their own transition styles:

```css
/* Fade transition */
.ag-hide {
    opacity: 0;
    transition: opacity 0.3s;
}

/* Or use view-transition-name for element-specific animations */
[id^="_ag"]::view-transition-old(*),
[id^="_ag"]::view-transition-new(*) {
    animation-duration: 0.3s;
}
```

**Implementation changes to `LazyLoadHandler`:**

```ts
class LazyLoadHandler {
    #activeTransition?: ViewTransition;
    #showPending = false;
    #hidePending = false;

    async assign(lhsTarget, resolvedParams) {
        const { if: condition, transitional, ... } = resolvedParams;
        
        if (condition) {
            await this.show(lhsTarget, resolvedParams);
        } else {
            await this.hide(lhsTarget, resolvedParams);
        }
    }

    private async show(target, params) {
        const { transitional } = params;
        // ... find/create markers, determine if clone needed ...

        if (transitional && document.startViewTransition) {
            this.#hidePending = false;
            if (this.#showPending) return;
            this.#showPending = true;
            this.#activeTransition?.skipTransition();
            this.#activeTransition = document.startViewTransition(() => {
                // Clone and insert, or remove .ag-hide class
                this.doShow(target, params);
            });
            this.#activeTransition.finished.finally(() => { this.#showPending = false; });
        } else {
            this.doShow(target, params);
        }
    }

    // Similar pattern for hide...
}
```

**Wait — stateful handler instances?**

There's a problem. Currently handlers are instantiated fresh on every `assign()` call:

```ts
const handler = new HandlerClass(config);
await handler.assign(lhsTarget, resolvedParams, options);
```

The `#activeTransition`, `#showPending`, `#hidePending` state needs to persist across calls for the same element/template pair. `be-switched` solves this because it's a long-lived class instance attached to the element.

**Options:**

1. **Cache handler instances per lhsTarget + template name.** The first time a handler fires for a given target+template combo, the instance is cached. Subsequent calls reuse it.

2. **Store transition state on the target element.** Use a WeakMap keyed by the marker comment node (which persists). The handler reads/writes transition state from there on each call.

3. **Store on the handler config object.** Since the same config object is reused across calls (it's the literal from the pattern), state could be attached to it. But this breaks if the same config is used for different targets.

**My recommendation: Option 2 — WeakMap keyed by marker node.**

```ts
const transitionState = new WeakMap<Comment, {
    activeTransition?: ViewTransition;
    showPending: boolean;
    hidePending: boolean;
}>();
```

The start marker comment is unique per template-in-target pair and persists across calls. This gives each (target, template) combo its own transition state without requiring handler instance caching.

### Visibility: CSS Class vs `hidden` Attribute

Currently `lazyLoad` uses the `hidden` attribute. For view transitions to work, we'd need to switch to a CSS class approach (like `be-switched` does with `.be-switched-hide`). This is a behavioral change:

- `hidden` attribute: element is completely hidden from rendering + accessibility tree
- CSS class (`.ag-hide { display: none }`): same visual effect, but CSS-customizable

**Suggestion:** When `transitional: true`, use the CSS class approach (`.ag-hide`). When `transitional` is falsy (default), keep using the `hidden` attribute for backward compatibility.

### Questions

1. **Class name:** `.ag-hide` (short for assign-gingerly) or something else? `be-switched` uses `.be-switched-hide`.

2. **Should `transitional` also support a string value?** e.g., `transitional: 'fade'` that sets a `view-transition-name` on the elements. Or keep it boolean and let CSS handle everything.

3. **The `forget: true` case** (remove nodes entirely) — should this also support transitions? Animating before removal is natural (fade out, then remove). `be-switched` doesn't support `forget`, so no prior art there.

4. **Handler instance persistence** — confirm Option 2 (WeakMap on marker node) is acceptable.

5. **Test page** — I'll create a visual demo HTML page. Should it live in `demos/` or `tests/`?


---

## Human Response I

A few questions:

1.  Does using a mostly stateless handler for this use case seem like a hack, as opposed to the stateful enhancement like be-switched? It might be useful if it doesn't seem like a hack to make the pattern easy to adopt for other handlers. 
2.  I forgot to mention that one of my ambitions is for the  be-switched enhancement  to be able to reuse this handler where possible.  It already depends on this package.  I would actually like it if you can provide some guidance on how this code reuse could happen.

---

## Response to Human Response I

### 1. Stateless Handler + External State: Hack or Pattern?

It's not a hack — it's actually a well-established pattern: **externalized state with a stateless processor**. The handler is a pure function of (target, config, state) → side effects. The state just lives in a different place (WeakMap) rather than on the handler instance.

Think of it like a Redux reducer: the reducer is stateless, but it operates on externalized state. Or a database-backed web handler: the handler is stateless per request, but persistent state lives in the DB.

**Why it works well here:**

- Handlers are designed to be declarative config objects (`{ do: 'builtIns.lazyLoad', resolve: {...} }`). The "stateless instantiation" model aligns with this — the config is data, the handler is a processor.
- The state naturally belongs to the *DOM location* (the marker pair), not to the handler class. If two different configs target the same markers, they should share transition state (don't start a show transition if a hide is already animating those same nodes).
- It's easy to make reusable — any handler that needs transition support just accesses the same WeakMap utility.

**Making it a reusable pattern for other handlers:**

Extract the transition coordination into a utility:

```ts
// transitionHelper.ts
export interface TransitionState {
    active?: ViewTransition;
    showPending: boolean;
    hidePending: boolean;
}

const stateMap = new WeakMap<Node, TransitionState>();

export function getTransitionState(markerNode: Node): TransitionState {
    let state = stateMap.get(markerNode);
    if (!state) {
        state = { showPending: false, hidePending: false };
        stateMap.set(markerNode, state);
    }
    return state;
}

export function withTransition(
    markerNode: Node,
    direction: 'show' | 'hide',
    transitional: boolean,
    domMutation: () => void
): void {
    const state = getTransitionState(markerNode);

    if (!transitional || !document.startViewTransition) {
        domMutation();
        return;
    }

    if (direction === 'show') {
        state.hidePending = false;
        if (state.showPending) return;
        state.showPending = true;
        state.active?.skipTransition();
        state.active = document.startViewTransition(domMutation);
        state.active.finished.finally(() => { state.showPending = false; });
    } else {
        state.showPending = false;
        if (state.hidePending) return;
        state.hidePending = true;
        state.active?.skipTransition();
        state.active = document.startViewTransition(domMutation);
        state.active.finished.finally(() => { state.hidePending = false; });
    }
}
```

Any handler (lazyLoad, lazyLoadSwitch, future handlers) just calls:
```ts
withTransition(startMarker, 'show', resolvedParams.transitional, () => {
    // actual DOM changes
});
```

That's the entire integration cost — one function call wrapping the mutation. No inheritance, no mixin, no complex state management. Other handlers that need transitions get it for free.

### 2. Reuse from `be-switched`

`be-switched` already depends on `assign-gingerly`. The reuse path is straightforward:

**Option A: `be-switched` uses the handler directly**

`be-switched` could delegate its show/hide logic to the `LazyLoadHandler` (or the shared `transitionHelper` utility) rather than implementing its own clone/hide/show logic:

```js
// In be-switched's onTrue/onFalse:
import { LazyLoadHandler } from 'assign-gingerly/handlers/lazyLoad.js';

// Create a handler instance and call assign directly
const handler = new LazyLoadHandler({ /* config */ });
await handler.assign(targetElement, {
    if: true,
    instantiate: templateElement,
    transitional: this.#transitional,
});
```

This works because `LazyLoadHandler` is exported as a class — `be-switched` doesn't need to go through the `assignFrom` pipeline. It can instantiate and call the handler directly.

**Option B: Share the transition utility only**

If `be-switched` wants to keep its own DOM logic (which is more specialized — it handles `remoteContent`, `idRefAttr`, `toggleInert`, etc.) but reuse the transition coordination, it just imports `withTransition`:

```js
import { withTransition } from 'assign-gingerly/transitionHelper.js';

// In onTrue:
withTransition(this.#markerNode, 'show', this.#transitional, () => {
    enhancedElement.after(clone);
});

// In onFalse:
withTransition(this.#markerNode, 'hide', this.#transitional, () => {
    changeVisibility(idRefChildren, toggleInert, 'add');
});
```

This lets `be-switched` keep its specialized logic while sharing the "cancel in-flight, prevent re-entry, wrap in startViewTransition" pattern.

**Option C: Share the visibility CSS injection**

Both `be-switched` and the lazyLoad handler need to inject a hide-class style into the rootNode once. This could be a shared utility:

```js
import { ensureHideStyle } from 'assign-gingerly/transitionHelper.js';

ensureHideStyle(rootNode, '.ag-hide', 'display: none');
```

### My Recommendation

**Extract `transitionHelper.ts`** as a shared module with:
- `getTransitionState(node)` — WeakMap-backed state
- `withTransition(node, direction, enabled, mutation)` — the coordination wrapper
- `ensureHideStyle(rootNode, className, css)` — one-time style injection

Then:
- `lazyLoad` / `lazyLoadSwitch` use it internally
- `be-switched` can import and use the same utilities, replacing its own transition logic
- Future handlers get transitions with one function call

This keeps the handler pattern clean (stateless processors + externalized state) while making transition support trivially reusable.

### Questions

1. **Does extracting `transitionHelper.ts` as the shared module make sense?** It would be exported from `assign-gingerly/transitionHelper.js`.
2. **For the hide class name**, should it be `.ag-hide` (generic to this package) or should each consumer get to name it? `be-switched` uses `.be-switched-hide` — if it migrates to the shared utility, does it keep its own class name or switch to `.ag-hide`?
3. **Ready to implement once you confirm the approach.** I'll create `transitionHelper.ts`, update `lazyLoad` to use it, and build a visual demo page.

---
## Human Response II

>  **Does extracting `transitionHelper.ts` as the shared module make sense?**

Makes sense.  Let's do it.

> **For the hide class name**

Let's default to that but allow for another optional config setting in addition to "transitional"

If that seems clear, please implement.
