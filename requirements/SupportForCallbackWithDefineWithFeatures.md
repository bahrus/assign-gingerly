# Support For Callback with Define With Features

---

## Human Ask

The following issue came up while incorporating DefineWithFeatures in the cede script code of mount observer:

A callback is the right call. The timing concern is real — if `defineWithFeatures` calls `registry.define(tagName, NewCtr)` and any element of that tag already exists in the DOM, the browser will synchronously upgrade it. If the class's `connectedCallback` tries to read `this.constructor.seedRef` during that upgrade, it'll be undefined because we haven't set it yet.

A callback that fires right after subclass creation but before `registry.define` solves this cleanly. I'd suggest something like:

```typescript
await defineWithFeatures(tagName, baseTagName, config, registry, {
    onSubclassCreated(NewCtr) {
        NewCtr.seedRef = new WeakRef(scriptEl);
    }
});
```

Why a callback over alternatives:

1. **vs. returning the class** — `defineWithFeatures` currently encapsulates the full lifecycle (create → wire features → define). Returning the class and making the caller do `registry.define` would split that responsibility and force every consumer to remember the final step.

2. **vs. a `seedRef` option** — Too specific. A callback is generic enough to handle future needs (setting other static properties, logging, attaching metadata) without growing the options surface for each one.

3. **vs. an event/hook system** — Overkill for a synchronous, single-point interception. A plain function is simpler and has zero overhead.

For the options shape, I'd recommend a single `options` object as the 5th parameter (rather than positional):

```typescript
export interface DefineWithFeaturesOptions {
    /** Called after the subclass is created but before registry.define(). */
    onSubclassCreated?: (NewCtr: CustomElementConstructor) => void;
}

export async function defineWithFeatures(
    tagName: string,
    baseTagName: string,
    config: Record<string, any>,
    registry?: CustomElementRegistry,
    options?: DefineWithFeaturesOptions
): Promise<void>;
```

This keeps the existing 4-arg signature backward-compatible and leaves room for future options (e.g., `onFeaturesResolved`, `onDefined`) without breaking the API.

On the mount-observer side, the handler would then become:

```typescript
await defineWithFeatures(tagName, extendsName, config, registry, {
    onSubclassCreated(NewCtr) {
        (NewCtr as any).seedRef = new WeakRef(scriptEl);
    }
});
```

And we'd remove the post-define `registry.get(tagName)` + `seedRef` assignment since it's no longer needed.


---

## Kiro's Comments

This is well-reasoned and I agree with all of it. The callback approach is the right call — generic, zero-overhead, backward-compatible. Let me implement it.
