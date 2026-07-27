# Event Binding with `+=` Operator

When the `+=` operator resolves a DOM Element on the LHS and the RHS is an object with an `on` property, it attaches an event listener that executes declarative assignment vectors when the event fires.

## Basic Usage

```JavaScript
assignFrom(this.shadowRoot, {
    '?.querySelector?.button +=': {
        on: 'click',
        '?.isHappy =!': '.',           // toggle host.isHappy on click
        fromLHS: {
            '?.age +=': '?.dataset.diff'  // read button's dataset.diff, add to host.age
        }
    }
}, { from: this, withMethods: ['querySelector'] });
```

## Concepts

| Term | Meaning |
|------|---------|
| **Target** | First argument to `assignFrom` (often `shadowRoot`) |
| **Host** | `options.from` — the source/view model (often the custom element `this`) |
| **LHS** | The element resolved by the left-hand-side path — receives the event listener |

## Assignment Vectors

### Static assignments (no `from` source)

Top-level keys that aren't reserved become implicit `toHost` assignments using `assignGingerly` (no path resolution):

```JavaScript
'?.querySelector?.button +=': {
    on: 'click',
    '?.isHappy =!': '.',         // toggles host.isHappy
    toTarget: { '?.dirty': true },  // explicit: assign to target
    toLHS: { '?.disabled': true },  // explicit: assign to the button itself
}
```

### Dynamic assignments (with `from` source)

Use `fromLHS`, `fromHost`, `fromTarget`, or `fromEvent` to resolve `?.` paths at event time:

```JavaScript
'?.querySelector?.input +=': {
    on: 'input',
    fromLHS: {
        '?.username': '?.value'       // implicit toHost: read input.value → host.username
    },
    fromEvent: {
        toTarget: {
            '?.lastEventType': '?.type'  // read event.type → target.lastEventType
        }
    }
}
```

| Source block | `from` resolves against | Use case |
|-------------|------------------------|----------|
| `fromLHS` | The element with the listener | Read element state (value, dataset, etc.) |
| `fromHost` | `options.from` (view model) | Re-resolve VM state at event time |
| `fromTarget` | First arg to assignFrom | Two-way binding (target → host) |
| `fromEvent` | The Event object | Read event.detail, event.target, etc. |

### Destination targets

Within each source block (or at the top level for static assignments):

| Key | Destination | Default? |
|-----|-------------|----------|
| (shorthand — any non-reserved key) | Host | ✓ Yes |
| `toHost` | `options.from` | Explicit form of shorthand |
| `toTarget` | First arg to assignFrom | |
| `toLHS` | The element with the listener | |

## `get` Configuration

```JavaScript
'?.querySelector?.button +=': {
    on: 'click',
    get: {
        abortController: '?.myController',  // resolved from host — for manual cleanup
        key: 'uniqueId123',                  // dedup: aborts previous listener with same key
        nudge: true,                         // remove 'disabled' attribute after binding
        options: { capture: true },          // addEventListener options
        stopPropagation: true,
        preventDefault: true,
    },
    '?.count +=': 1
}
```

### Dedup with `key`

When the same `assignFrom` call is repeated (e.g., on re-render), a `key` ensures the previous listener is aborted before the new one is attached. Internally uses `WeakMap<Element, Map<key, AbortController>>`.

### `nudge`

Removes the `disabled` attribute from the element after the listener is attached — useful for progressive enhancement where buttons start disabled until JS hydrates.

## Dispatching Custom Events

```JavaScript
'?.querySelector?.button +=': {
    on: 'click',
    get: {
        dispatch: {
            type: 'mood-changed',
            detail: { source: 'button' },
            bubbles: true,
            composed: true
        }
    }
}
```

After processing all assignment vectors, dispatches the configured CustomEvent from the LHS element.

## Options Inheritance

Parent `assignFrom` options (`withMethods`, `aka`, `protocols`) flow into all inner assignments automatically. Use `withOptions` inside any vector to override specific fields:

```JavaScript
fromLHS: {
    '?.data': '?.dataset?.info',
    withOptions: { withMethods: ['querySelector'] }  // override for this vector only
}
```

## How It Works

1. `assignGingerly` detects `+=` with Element LHS + object RHS containing `on`
2. Dynamically imports `handlers/addEventListener.js` (fire-and-forget — no blocking)
3. Attaches the event listener with `AbortController` for cleanup
4. On event fire: processes static vectors via `assignGingerly`, dynamic vectors via `assignFrom` (also lazily imported)
5. Zero payload until first event binding is encountered
