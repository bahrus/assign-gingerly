# Support for defer-[base]

---

## Human Ask

[id generation](https://github.com/bahrus/id-generation) is one of several scenarios where we need to do some prior work before an enhancement should be activated:

```html
<fieldset disabled>
    <label>
        LHS: <input data-id={{lhs}}>
    </label>
    
    <label for=rhs>
        RHS: <input data-id={{rhs}}>
    </label>
    
    <template -id defer-🎚️ 🎚️='on if isEqual, based on #{{lhs}} and #{{rhs}}.'>
        <div>LHS === RHS</div>
    </template>
</fieldset>
<div itemscope>
    <label>
        LHS: <input data-id={{lhs}}>
    </label>

    <!-- not the last streamed child of the closest [itemscope] ancestor
     but use at your own risk, since the element below may not have streamed
     in before the id generating begins
     -->
    <template -id defer-🎚️ 🎚️='on if isEqual, based on #{{lhs}} and #{{rhs}}.'>
        <div>LHS === RHS</div>
    </template>
    
    <label for=rhs>
        RHS: <input data-id={{rhs}}>
    </label>
    

</div>
```

The question is should assign-gingerly be responsible for blocking enhancements from being activated when defer-[base] attribute is present?  It adds another asynchronous wrinkle to what we've tried to keep as synchronous as possible (but there are other exceptions).

The other alternative is that all the enhancements that want to honor the defer-[base] be provided a common mechanism by which the enhancement can be notified when the defer-[base] attribute has been removed.



---

## Kiro's Comments

### Should assign-gingerly own this?

I'd lean toward **no** — this feels like mount-observer's responsibility, not assign-gingerly's. Here's my reasoning:

**assign-gingerly's role** is property assignment, dependency injection, and feature wiring. It doesn't observe the DOM, watch for attribute changes, or manage element lifecycle timing. It's a synchronous (mostly) utility that operates on objects when called.

**mount-observer's role** is DOM discovery — deciding *when* to spawn/attach enhancements based on element presence, attributes, and conditions. `defer-[base]` is fundamentally a "don't attach yet" signal — that's a discovery/timing concern, not an assignment concern.

If assign-gingerly starts checking for `defer-*` attributes in its getter or during `assignFeatures`, it takes on DOM observation responsibility that doesn't belong to it. It would also mean the feature getter (currently synchronous for sync spawns) would need to become async or return undefined conditionally, breaking the clean "access = spawn" contract.

### The alternative: provide a utility, not enforcement

What assign-gingerly *could* provide is a small utility that enhancements use to honor `defer-[base]`:

```javascript
import { whenDeferRemoved } from 'assign-gingerly/deferSupport.js';

class MyEnhancement {
    constructor(element, ctx) {
        const { baseAttr } = ctx.config.withAttrs;
        // Returns immediately if no defer-[base] attribute exists
        // Otherwise returns a Promise that resolves when it's removed
        this.ready = whenDeferRemoved(element, baseAttr);
    }

    async activate() {
        await this.ready;
        // Now safe to proceed
    }
}
```

The utility would:
1. Check if `defer-${base}` attribute exists on the element.
2. If not, resolve immediately (or return `undefined`).
3. If yes, set up a `MutationObserver` (or use mount-observer's infrastructure) to watch for its removal, and return a Promise.

### But even that might belong in mount-observer

mount-observer already has the DOM observation infrastructure. It could:
- Simply not spawn the enhancement while `defer-[base]` is present.
- Spawn it once the attribute is removed (same as how it spawns on attribute appearance).

This is purely a "when to mount" decision — exactly what mount-observer does.

### What assign-gingerly could reasonably provide

If you want *something* in assign-gingerly for this, I'd suggest the lightest possible touch:

**Option A: A `deferAttr` field on `EnhancementConfig`**

```javascript
registry.push({
    baseAttr: '🎚️',
    spawn: SliderEnhancement,
    deferAttr: 'defer-🎚️'  // mount-observer checks this before spawning
});
```

This is just metadata — assign-gingerly stores it on the config, mount-observer reads it. No behavior change in assign-gingerly itself.

**Option B: A `canSpawn` static method (already exists!)**

Looking at the existing types, `EnhancementConfig.spawn` already supports `canSpawn`:

```typescript
export type Spawner<T = any, Obj = Element> = {
    new (obj?: Obj, ctx?: SpawnContext<T>, initVals?: Partial<T>): T;
    canSpawn?: (obj: any, ctx?: SpawnContext<T>) => boolean;
}
```

The enhancement class can define:

```javascript
class SliderEnhancement {
    static canSpawn(element, ctx) {
        const base = ctx.config.withAttrs?.base;
        return !element.hasAttribute(`defer-${base}`);
    }
}
```

mount-observer (or `enh.get()`) already checks `canSpawn` before spawning. This means **defer support already works** — the enhancement just needs to implement `canSpawn` to check for the defer attribute.

The missing piece: re-checking when the defer attribute is removed. That's a mount-observer concern (re-evaluate the element when attributes change).

### My recommendation

1. **Don't add defer logic to assign-gingerly's core.** Keep it synchronous and DOM-unaware.
2. **Document the `canSpawn` pattern** for enhancements that want to honor defer.
3. **Let mount-observer handle re-evaluation** — when `defer-[base]` is removed, mount-observer should re-check the element and allow spawning.
4. **Optionally** add a `deferAttr` metadata field to `EnhancementConfig` that mount-observer can read, so the defer attribute name is declarative rather than hard-coded in `canSpawn`.

This keeps the separation of concerns clean: assign-gingerly provides the data model, mount-observer provides the timing.
