# Support for Custom Element Packaging

---

## Human Ask

In the old days, people would be able to define a custom element via a single reference.  Originally via a link to an html import file, but then the platform removed that support (which made me quite unhappy), so that was quickly followed by a single .js file. 

But then people pointed out that to avoid namespace conflicts, it was best to separate the class definition from the registration code.  So now there were two files, but only one link to the registration module.

With the introduction of scoped custom element registries, things get trickier still.

This package endorces splitting up functionality with features, so much so, that the worlds first example of a published custom element that uses features, [there's no code in the custom element!](https://github.com/bahrus/time-ticker/blob/baseline/def.js).

The bottom line is that in many cases the definition file becomes small enough that copying the entire file to define a different file, and giving it a different name, might be the way to go?  Please take a look at the link above and suggest how you would package it?


---

## Kiro's Comments

I looked at the [time-ticker def.js](https://github.com/bahrus/time-ticker/blob/baseline/def.js). It's beautifully minimal:

```javascript
import { TimeTicker } from './TimeTicker.js';
import { RoundaboutFeature } from 'roundabout-lib/RoundaboutFeature.js';
import 'assign-gingerly/assignFeatures.js';
import cef from './cef.json' with { type: 'json' };

const { roundabout } = cef.features;
const { customData, withAttrs } = roundabout;

export class TimeTickerElement extends HTMLElement {
    static supportedFeatures = { timeTicker: {}, roundabout: {} }
}

customElements.assignFeatures(TimeTickerElement, {
    timeTicker: { spawn: TimeTicker },
    roundabout: { spawn: RoundaboutFeature, customData, withAttrs, callbackForwarding: ['connectedCallback'] },
});

customElements.define('time-ticker', TimeTickerElement);
```

The custom element class is literally empty — just `static supportedFeatures`. All behavior lives in features. This is the ideal outcome of the features system.

### On packaging for reuse / renaming

The question is: how do you let someone use this component with a different tag name (scoped registries), or customize which features are injected?

**Current approach (copy the file):** Works, but doesn't scale. If the upstream `def.js` changes (new feature added, config tweaked), the copy is stale.

**Suggested approach: separate the "what" from the "where"**

Split into three concerns:

1. **The class** (`time-ticker-element.js`) — just the class with `static supportedFeatures`. Exported, never calls `define`.
2. **The feature wiring** (`time-ticker-features.js`) — calls `assignFeatures`. Exported as a function so it can be called with different configs.
3. **The registration** (`def.js`) — imports both, calls define with a specific tag name.

```javascript
// time-ticker-element.js
export class TimeTickerElement extends HTMLElement {
    static supportedFeatures = { timeTicker: {}, roundabout: {} }
}

// time-ticker-features.js
import { TimeTicker } from './TimeTicker.js';
import { RoundaboutFeature } from 'roundabout-lib/RoundaboutFeature.js';
import 'assign-gingerly/assignFeatures.js';
import cef from './cef.json' with { type: 'json' };

export async function wireFeatures(ElementClass, overrides = {}) {
    const { roundabout } = cef.features;
    const { customData, withAttrs } = roundabout;
    
    await customElements.assignFeatures(ElementClass, {
        timeTicker: { spawn: overrides.timeTicker?.spawn || TimeTicker },
        roundabout: {
            spawn: overrides.roundabout?.spawn || RoundaboutFeature,
            customData: overrides.roundabout?.customData || customData,
            withAttrs: overrides.roundabout?.withAttrs || withAttrs,
            callbackForwarding: ['connectedCallback'],
        },
    });
}

// def.js (the "glue" — this is what you copy/customize)
import { TimeTickerElement } from './time-ticker-element.js';
import { wireFeatures } from './time-ticker-features.js';

await wireFeatures(TimeTickerElement);
customElements.define('time-ticker', TimeTickerElement);
```

**For a different tag name:**
```javascript
// my-ticker-def.js
import { TimeTickerElement } from 'time-ticker/time-ticker-element.js';
import { wireFeatures } from 'time-ticker/time-ticker-features.js';

await wireFeatures(TimeTickerElement);
customElements.define('my-ticker', TimeTickerElement);
```

**For a scoped registry:**
```javascript
import { TimeTickerElement } from 'time-ticker/time-ticker-element.js';
import { wireFeatures } from 'time-ticker/time-ticker-features.js';

await wireFeatures(TimeTickerElement);
scopedRegistry.define('time-ticker', TimeTickerElement);
```

**For DI / testing:**
```javascript
import { TimeTickerElement } from 'time-ticker/time-ticker-element.js';
import { wireFeatures } from 'time-ticker/time-ticker-features.js';
import { MockTimeTicker } from './mocks.js';

await wireFeatures(TimeTickerElement, { timeTicker: { spawn: MockTimeTicker } });
customElements.define('time-ticker', TimeTickerElement);
```

### Is this worth formalizing in the library?

Honestly — I don't think the library needs to do anything here. The pattern above is just good module design. The library already provides the primitives (`assignFeatures`, `customData`, `callbackForwarding`). The packaging is a documentation/convention concern, not a code concern.

What might be worth adding to the README is a "Recommended packaging pattern" section showing this three-file split as a best practice. But no new code is needed.

### The "no code in the custom element" observation

This is the payoff of the features system. The custom element becomes a pure declaration of *what* it supports, and the `def.js` becomes a pure declaration of *how* it's wired. All behavior lives in feature classes that are independently testable, reusable, and swappable. That's the composition-over-inheritance dream realized.
