# Inter-Feature Communication with `suggestFeatureInfo`

When multiple custom element features need to coordinate — one feature producing configuration that another feature consumes — `suggestFeatureInfo` and `getFeatureInfoSuggestions` provide a formal, version-safe mechanism.

## The Problem

Feature A (e.g., form association) knows things that Feature B (e.g., reactive binding) needs:
- Which properties should be observed and forwarded
- Which attributes should be parsed
- How property changes should propagate

Without a formal mechanism, features would need to hard-code references to each other's classes (brittle across versions) or rely on ad-hoc conventions.

## The Solution

Each feature publishes a stable Symbol identifier. Features communicate by posting and reading "suggestions" keyed by that Symbol, scoped per custom element class.

### API

```javascript
import { suggestFeatureInfo, getFeatureInfoSuggestions } from 'assign-gingerly/assignFeatures.js';

// Feature A posts a suggestion to Feature B
suggestFeatureInfo(FeatureAClass, TARGET_FEATURE_SYMBOL, {
    customData: { /* config fragments to merge */ },
    withAttrs: { /* attribute patterns to merge */ }
}, targetClass);

// Feature B reads suggestions
const suggestions = getFeatureInfoSuggestions(MY_FEATURE_SYMBOL, targetClass);
```

### Timing

Features are processed in declaration order within `assignFeatures`. Each feature's `static onAssigned` is awaited sequentially, so suggestions posted by earlier features are guaranteed to be available when later features read them:

```javascript
await customElements.assignFeatures(MyElement, {
    faceUp: { spawn: FaceUp },           // onAssigned runs first, posts suggestions
    roundabout: { spawn: RoundaboutFeature }  // onAssigned runs second, reads suggestions
});
```

## Real-World Example: face-up → roundabout

The [face-up](https://github.com/bahrus/face-up) feature (form association) suggests configuration to [roundabout](https://github.com/bahrus/roundabout) (reactive binding). This tells roundabout how to forward form-related properties and which attributes to observe.

Source: [integrateWithRoundabout.js](https://github.com/bahrus/face-up/blob/baseline/integrateWithRoundabout.js)

```javascript
import { suggestFeatureInfo } from 'assign-gingerly/assignFeatures.js';

export async function integrateWithRoundabout(FaceUpClass, key, ctr) {
    const { id } = await import('roundabout-lib/roundaboutFeature.js');

    suggestFeatureInfo(FaceUpClass, id, {
        customData: {
            // Use += to append to roundabout's merges array
            '?.raConfig?.merges +=': [
                {
                    ifKeyIn: ['value'],
                    assign: { [`?.${key}?.value`]: '?.value' }
                },
                {
                    ifKeyIn: ['disabled'],
                    assign: { [`?.${key}?.disabled`]: '?.disabled' }
                },
                {
                    ifKeyIn: ['required'],
                    assign: { [`?.${key}?.required`]: '?.required' }
                },
                {
                    ifKeyIn: ['validationMessage'],
                    assign: { [`?.${key}?.validationMessage`]: '?.validationMessage' }
                },
            ]
        },
        withAttrs: {
            value: 'value',
            _value: { sourceOfTruth: true, valIfNull: null },
            disabled: 'disabled',
            _disabled: { sourceOfTruth: true, instanceOf: Boolean, valIfNull: false },
            required: 'required',
            _required: { sourceOfTruth: true, instanceOf: Boolean, valIfNull: false },
            validationMessage: 'validation-message',
            _validationMessage: { sourceOfTruth: true, valIfNull: '' },
        }
    }, ctr);
}
```
The `sourceOfTruth: true` entries mark attributes whose DOM value should mirror the host property. See [docs/withAttrs.md](docs/withAttrs.md#source-of-truth) for details.

### What's happening here

1. **`customData` with `+=` array append** — The suggestion uses assignGingerly's `+=` command syntax in the key (`'?.raConfig?.merges +='`). When roundabout merges this into its config via `assignGingerly`, the merge rules are *appended* to the existing array rather than replacing it. This is the array concatenation feature in action.

2. **`withAttrs` patterns** — face-up suggests additional attributes that roundabout should parse (value, disabled, required, validationMessage). These get merged into roundabout's `withAttrs` configuration.

3. **Dynamic `key` reference** — The feature key (e.g., `'faceUp'`) is used in the merge paths (`?.${key}?.value`), so roundabout knows which feature property to forward values to.

4. **Version-safe** — face-up imports roundabout's Symbol (`id`) dynamically. If roundabout isn't being used, the import fails gracefully. Different versions of roundabout share the same Symbol (via `Symbol.for`).

### How roundabout consumes suggestions

```javascript
// In roundabout's onAssigned:
import { getFeatureInfoSuggestions } from 'assign-gingerly/assignFeatures.js';
import { id } from './roundaboutFeature.js'; // Symbol.for('bahrus/roundabout')

class RoundaboutFeature {
    static onAssigned(ctr, featureConfig, key) {
        const suggestions = getFeatureInfoSuggestions(id, ctr);
        
        for (const suggestion of suggestions) {
            if (suggestion.customData) {
                assignGingerly(featureConfig, suggestion.customData);
            }
            if (suggestion.withAttrs) {
                featureConfig.withAttrs = {
                    ...featureConfig.withAttrs,
                    ...suggestion.withAttrs
                };
            }
        }
    }
}
```

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Symbol-based targeting | Stable across versions and mock substitutions |
| Scoped per target class | Prevents leaking between different custom elements |
| Sequential `onAssigned` | Guarantees suggestions are available when consumed |
| `assignGingerly` for merging | Leverages `+=` array append, nested paths, etc. |
| Dynamic import of target ID | Graceful failure if target feature isn't used |

## Guidelines

1. **Declare suggesting features before consuming features** in `assignFeatures`.
2. **Export your feature's Symbol** from a stable module (e.g., `symbols.js`).
3. **Use `Symbol.for('org/package-name')`** for the identifier — survives across package versions.
4. **Use `assignGingerly` syntax in `customData` keys** (like `+=`) for additive merging.
5. **Always pass `ctr`** as the `targetClass` parameter to scope suggestions correctly.
