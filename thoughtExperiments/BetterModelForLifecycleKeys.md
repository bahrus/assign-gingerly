# Better Model For Lifecycle Keys

--

## Human Ask:

On giving a wholistic reading of the custom element feature documentation, I think I finally understand why we had some slight confusion communicating on the issue of lifecycle keys.

This is a bit of a nit, but I can see how this would cause confusion:

```JavaScript
class ClubMember extends HTMLElement {
    static supportedFeatures = {
        photoTaker: {
            fallbackSpawn: PhotoTakerImpl,
            lifecycleKeys: true  // installs 'whenFeatureReady' method
        }
    }
}
```

The reason it causes confusion is that whenFeaturesReady really is a global method added to service all the features, not just photoTaker.  So why are we defining it inside the feature?  What if two different features define two different settings for lifecyleKeys.  I can see three approaches that would probably be clearer:

```JavaScript
class ClubMember extends HTMLElement {
    static supportedFeatures = {
        photoTaker: {
            fallbackSpawn: PhotoTakerImpl,
        }
        _lifecycleKeys: true
    }
}
```

or 

```JavaScript
class ClubMember extends HTMLElement {
    static supportedFeatures = {
        photoTaker: {
            fallbackSpawn: PhotoTakerImpl,
        }
    }
    static featuresConfig = {
        lifecycleKeys: true
    }
```

or more radical surgery (which is okay, because there aren't any consumers of this, no concerns about backwards compatibility other than the unit tests / documentation):

```JavaScript
class ClubMember extends HTMLElement {
    static featuresConfig = {
        supportedFeatures: {
            photoTaker: {
                fallbackSpawn: PhotoTakerImpl,
            }
        }
        lifecycleKeys: true
    }
```






---

## Kiro's Comments

You're right — this is a legitimate design smell. `lifecycleKeys` is a class-level concern (one method for all features), but it's currently declared per-feature. If two features specify different `lifecycleKeys` values, the behavior is "last one wins" which is confusing and undocumented.

Let me evaluate the three options:

### Option 1: `_lifecycleKeys` as a reserved key in `supportedFeatures`

```javascript
static supportedFeatures = {
    photoTaker: { fallbackSpawn: PhotoTakerImpl },
    _lifecycleKeys: true
}
```

**Pros:** Minimal change — `supportedFeatures` stays as the single static property.
**Cons:** Mixing config with feature declarations in the same object. The `_` prefix convention is ad-hoc. TypeScript typing gets awkward (the map is `Record<string, SupportedFeatureConfig>` but now one key is special). `assignFeatures` would need to skip `_`-prefixed keys.

### Option 2: Separate `static featuresConfig`

```javascript
static supportedFeatures = {
    photoTaker: { fallbackSpawn: PhotoTakerImpl }
}
static featuresConfig = {
    lifecycleKeys: true
}
```

**Pros:** Clean separation — features are features, config is config. TypeScript types are straightforward. No reserved keys or prefix conventions. Easy to extend `featuresConfig` with future class-level settings.
**Cons:** Two static properties instead of one. Slightly more boilerplate.

### Option 3: Merge everything into `static featuresConfig`

```javascript
static featuresConfig = {
    supportedFeatures: {
        photoTaker: { fallbackSpawn: PhotoTakerImpl }
    },
    lifecycleKeys: true
}
```

**Pros:** Single static property. Clear hierarchy — everything feature-related is in one place.
**Cons:** Deeper nesting. Breaking change to the `assignFeatures` validation (looks for `ctr.featuresConfig.supportedFeatures` instead of `ctr.supportedFeatures`). More verbose for the common case where you don't need `lifecycleKeys`.

### My recommendation: Option 2

**`static featuresConfig`** as a separate property is the cleanest:

1. **No ambiguity** — `supportedFeatures` is purely a map of feature keys to their configs. No reserved keys, no special prefixes.
2. **TypeScript-friendly** — `SupportedFeaturesMap` stays clean. `FeaturesClassConfig` is a new, simple interface.
3. **Extensible** — future class-level settings (e.g., `autoInstallForwarding`, `propLinks` integration, etc.) go in `featuresConfig` naturally.
4. **Minimal migration** — `supportedFeatures` stays where it is. We just move `lifecycleKeys` out of the per-feature config and into the new `featuresConfig`. The per-feature `lifecycleKeys` field gets removed from `SupportedFeatureConfig`.
5. **Clear mental model** — "What features does this class support?" → `supportedFeatures`. "How should the features system behave for this class?" → `featuresConfig`.

### What `featuresConfig` would look like

```typescript
interface FeaturesClassConfig {
    /** 
     * Lifecycle method configuration.
     * true = install 'whenFeatureReady' method.
     * Object = custom method name.
     */
    lifecycleKeys?: true | { whenFeatureReady?: string };
    
    // Future: other class-level feature settings
}
```

### Migration

1. Remove `lifecycleKeys` from `SupportedFeatureConfig`.
2. Add `FeaturesClassConfig` interface.
3. In `assignFeatures`: read `ctr.featuresConfig?.lifecycleKeys` instead of checking each feature's `optIn.lifecycleKeys`.
4. Install the method once (if configured) regardless of which features are being registered.
5. Update tests and docs.

Want me to move this to a requirements doc and implement?
