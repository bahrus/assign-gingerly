# Be Vigilant

---

## Human Ask

The document that led to [inferred assignments](../SubObjectDistributing.md) mentioned a phase 2+ requirement (slightly revised below):

```ts
assignFrom(outerDiv, {
    // other assignments...
}, {
    from: vm,
    inferredAssignments: {
      byItemprop: ['user'] // or true for all matching keys,
      //byName: // phase II
      beVigilant: false, //phase II -- add a mutation observer for new matching 
    },
    elements.  
});
```

This document is the formal request for the beVigilant feature.

I don't know if this could share any code with the @eachTime feature that this package supports.

I would definitely want this extra logic to be conditionally loaded on demand.

---

## Feedback

### What `beVigilant` Does

When `beVigilant: true`, a `MutationObserver` watches the target element for newly added child elements. When a new element appears that matches one of the inferred assignment keys (e.g., `[itemprop="name"]`), the value from `options.from` is applied to it automatically — same as the initial pass.

This covers the case where DOM content is loaded/rendered lazily (e.g., via `lazyLoad` handler, dynamic template cloning, or third-party rendering) after the initial `assignFrom` call.

### Relationship to `@eachTime`

| | `@eachTime` | `beVigilant` |
|---|---|---|
| **Trigger** | `mount` events from an EventTarget (e.g., mount-observer) | `MutationObserver` on childList/subtree |
| **Source** | External mount-observer emitting custom events | Built-in DOM MutationObserver |
| **Scope** | A single path expression | All keys in `inferredAssignments` |
| **Cleanup** | `AbortSignal` | `AbortSignal` (same pattern) |
| **What it applies** | A single value to each mounted element via path evaluation | Inferencer-based property setting per itemprop match |

**Shared code potential:** Both need:
1. An `AbortSignal` for cleanup (disconnect observer / remove listener)
2. A "when new element appears, do something" pattern
3. Conditional dynamic loading

But the mechanics differ enough that sharing implementation code would add coupling without much savings. `@eachTime` listens to custom `mount` events on an EventTarget. `beVigilant` uses a `MutationObserver` on the DOM. The callback logic is completely different too (path evaluation vs inferencer-based assignment).

**My recommendation:** Don't share code with `@eachTime`. Keep them as independent modules with a shared *pattern* (AbortSignal cleanup, dynamic loading) but separate implementations.

### Implementation Sketch

```ts
// beVigilant.ts — dynamically imported when beVigilant: true

export function setupVigilantObserver(
    target: Element,
    from: any,
    config: { byItemprop?: string[] | true },
    signal: AbortSignal
): void {
    const keys = config.byItemprop === true ? null : new Set(config.byItemprop);

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (!(node instanceof Element)) continue;
                processNewElement(node, from, keys, target);
            }
        }
    });

    observer.observe(target, { childList: true, subtree: true });

    // Cleanup on abort
    signal.addEventListener('abort', () => observer.disconnect(), { once: true });
}

function processNewElement(
    element: Element,
    from: any,
    keys: Set<string> | null,
    scopeRoot: Element
): void {
    const itemprop = element.getAttribute('itemprop');
    if (!itemprop) return;
    if (keys && !keys.has(itemprop)) return;
    if (!(itemprop in from)) return;

    // Check scope perimeter
    if (!withScopePerimeter(scopeRoot, element, '[itemscope]')) return;

    const infer = new Infer(element, itemprop);
    infer.value = from[itemprop];

    // Also check children of added nodes (subtree additions)
    // ... recursive or querySelectorAll on the added node
}
```

### API Integration

```ts
await assignFrom(outerDiv, {}, {
    from: vm,
    signal: controller.signal,  // Required for cleanup
    inferredAssignments: {
        byItemprop: ['user', 'name', 'email'],
        beVigilant: true,
    }
});

// Later: cleanup
controller.abort();
```

**`signal` is required when `beVigilant: true`** — same pattern as `@eachTime`. Without a signal, the observer would leak. Throw if missing.

### Questions

1. **Should `beVigilant` also observe attribute changes?** If an existing element's `itemprop` attribute is *added* or *changed*, should it be processed? This would require `attributes: true, attributeFilter: ['itemprop']` on the observer. Adds cost but covers more edge cases.

2. **Should the observer also process child elements of added nodes?** If a `<template>` is cloned in, the added nodes may contain deeply nested `[itemprop]` elements. The observer sees the top-level addition — should it `querySelectorAll('[itemprop]')` on added nodes to catch nested matches?

3. **Should `from` be read at observation time or captured at setup time?** If `from` is a live object (VM that changes over time), reading at observation time gives the latest value. If it's a snapshot, captured at setup is fine. For roundabout use cases where the VM is a live proxy/object, reading at observation time seems right.

4. **Does this need to integrate with the WeakRef caching from `#[x]`/`withIds`?** Probably not — `beVigilant` is about *new* elements, not repeated access to existing ones.

5. **Should this be implemented now or parked?** It's a clean feature with clear semantics, but it adds a MutationObserver which has performance implications for large/frequently-mutating DOMs.

---

## Human Response I

> **Should `beVigilant` also observe attribute changes?**

Yes, I guess it should, even if I can't think of a good use case, but I think that would be the expectation.  Good point

> **Should the observer also process child elements of added nodes?**

Yes, outside of inner itemscope attributed elements.

>  **Should `from` be read at observation time or captured at setup time?**

This is an interesting question, and my answer could raise eyebrows.  The ability to reapply changes to the live object is supported by the [roundabout package](https://raw.githubusercontent.com/bahrus/roundabout/refs/heads/baseline/README.md), which builds on this package..  So without the roundabout package usage, there could end up being newly added itemprop elements which have a later value of the live object.  The round about package would "smooth/even things out".  Maybe that's strange?

The question is making me wonder if I should do something similar to what we did with inferencer -- add a git submodule folder for roundabut lib, and make beVigilant use that reference.  I'm very open to your thoughts on that.

>  **Does this need to integrate with the WeakRef caching from `#[x]`/`withIds`?**

Actually, yes, I was thinking that newly discovered elements would need to be added to the cache, so that later updates to the vm could more speedily propagate to all the dependent elements.

> **Should this be implemented now or parked?**

I think because it is an optional parameter, and it defaults to false, and hopefully loads 98% of the needed code only on demand, I think if the usage documentation features enough caveats about only use it if it is needed might be enough deterrence to overuse?