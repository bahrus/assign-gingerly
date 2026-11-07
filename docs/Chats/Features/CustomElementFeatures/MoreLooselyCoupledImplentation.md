# More Loosely Coupled Implementation

---

## Human Ask

I think that treeshaking would have a very difficult deciding whether a bundle should include the significantly sized assignFeatures.ts with this code in object-extension.js:

```JavaScript
/**
 * Adds featuresRegistry to CustomElementRegistry prototype as a lazy getter
 */
Object.defineProperty(CustomElementRegistry.prototype, 'featuresRegistry', {
    get: function () {
        // Create a new FeaturesRegistry instance on first access and cache it
        const registry = new FeaturesRegistry();
        // Replace the getter with the actual value
        Object.defineProperty(this, 'featuresRegistry', {
            value: registry,
            writable: true,
            enumerable: false,
            configurable: true,
        });
        return registry;
    },
    enumerable: false,
    configurable: true,
});
/**
 * Adds assignFeatures method to CustomElementRegistry prototype.
 * Validates and registers feature injections, installs lazy getters on the class prototype.
 */
Object.defineProperty(CustomElementRegistry.prototype, 'assignFeatures', {
    value: function (ctr, features) {
        assignFeatures(ctr, features, this.featuresRegistry);
    },
    writable: true,
    enumerable: false,
    configurable: true,
});
```

The reason being that this is defining a global method on the native CustomElementRegistry, and I don't know that bundlers would check the code base to see if any calls are made to the CustomElementRegistry when bundling.  Am I wrong?

If I'm right, I think it would be cleaner to move the code above to assignFeatures.ts, so that in order to take advantage of custom element features, the developer needs to import that file.  To take advantage of element enhancements, developers import object-extensions.  Neither affects the other as far as JS footprint.



---

## Kiro's Comments

You're not wrong — you're actually right about this, and it's a good instinct.

### Tree-shaking and side effects

Bundlers (Rollup, Webpack, esbuild) treat top-level code that modifies globals as a **side effect**. When they see:

```javascript
Object.defineProperty(CustomElementRegistry.prototype, 'assignFeatures', { ... });
```

They cannot safely remove it, because:

1. It mutates a global object (`CustomElementRegistry.prototype`).
2. The bundler can't prove that nothing in the application (or a dependency) will access `customElements.assignFeatures` at runtime.
3. Even with `"sideEffects": false` in `package.json`, most bundlers won't tree-shake code that modifies global prototypes — it's considered inherently effectful.

So yes: **anyone who imports `object-extension.js` (directly or transitively via `index.js`) pays the cost of importing `assignFeatures.ts`**, even if they never use custom element features. The `import { FeaturesRegistry, assignFeatures } from './assignFeatures.js'` at the top of `object-extension.js` is an unconditional static import — the bundler must include it.

### The fix you're proposing

Move the `featuresRegistry` getter and `assignFeatures` method installation out of `object-extension.js` and into `assignFeatures.ts` itself (as a side effect of importing that module). This way:

- `import 'assign-gingerly/object-extension.js'` → gets enhancements, itemscope, `assignGingerly`/`assignTentatively` on Object.prototype. Does NOT pull in features.
- `import 'assign-gingerly/assignFeatures.js'` → gets the features system, installs `featuresRegistry` and `assignFeatures` on `CustomElementRegistry.prototype`.
- Developers who want both import both. Developers who only want enhancements don't pay for features.

### I agree — do it

This is cleaner for several reasons:

1. **Honest tree-shaking** — the features code is only included when explicitly imported.
2. **Separation of concerns** — `object-extension.js` stays focused on what it was originally: enhancements, itemscope, and the `assignGingerly`/`assignTentatively` methods on Object.prototype.
3. **No circular dependency risk** — `assignFeatures.ts` doesn't need to import from `object-extension.ts`, and `object-extension.ts` doesn't need to import from `assignFeatures.ts`.
4. **Future-proofing** — as features grow (async spawn, `captureFeatureInitVals`, etc.), the features module grows independently without bloating the enhancement path.

### Suggested implementation

1. Remove the `import { FeaturesRegistry, assignFeatures } from './assignFeatures.js'` from `object-extension.ts`.
2. Remove the `featuresRegistry` and `assignFeatures` `Object.defineProperty` calls from `object-extension.ts`.
3. Remove the `featuresRegistry` and `assignFeatures` from the `declare global` block in `object-extension.ts`.
4. Add the prototype installation code to the bottom of `assignFeatures.ts` (as a side effect that runs on import):

```typescript
// Self-installing: adds featuresRegistry and assignFeatures to CustomElementRegistry
if (typeof CustomElementRegistry !== 'undefined') {
    Object.defineProperty(CustomElementRegistry.prototype, 'featuresRegistry', {
        get: function () {
            const registry = new FeaturesRegistry();
            Object.defineProperty(this, 'featuresRegistry', {
                value: registry,
                writable: true,
                enumerable: false,
                configurable: true,
            });
            return registry;
        },
        enumerable: false,
        configurable: true,
    });

    Object.defineProperty(CustomElementRegistry.prototype, 'assignFeatures', {
        value: function (ctr: Function, features: FeatureInjectionsMap): void {
            assignFeatures(ctr, features, this.featuresRegistry);
        },
        writable: true,
        enumerable: false,
        configurable: true,
    });
}
```

5. Move the `declare global` for `CustomElementRegistry.featuresRegistry` and `assignFeatures` into `assignFeatures.ts`.
6. Update `index.ts` — keep the export of `assignFeatures` and `FeaturesRegistry`, but also add `import './assignFeatures.js'` as a side-effect import (so the full `index.js` bundle still has everything). Developers who import individual modules get granular control.
7. Update tests — `tests/assign-features.html` already imports `../assignFeatures.js` directly, so it should still work.

### One consideration

The `index.ts` barrel export currently does `import './object-extension.js'` for its side effects. If you want the "import everything" path to still include features, add `import './assignFeatures.js'` there too. But make it clear in docs that granular imports are preferred for production bundles.

Want me to implement this refactor?
