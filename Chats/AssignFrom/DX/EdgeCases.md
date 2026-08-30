# Edge Cases

## Bruce's Ask

I have the following *.mjs:

```JS
//@ts-check

import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';

import { akaMethods as m } from 'assign-gingerly/DX/emojis.js';
import { paths, doAssign, set, smoothOver, assign } from 'assign-gingerly/DX/paths.js';

/** @import {AP, RuntimeProps, Actions} from './types'; */
/** @import {RoundaboutOptions, Merges} from './types/roundabout/types' */
/** @import {ElMakerConfig} from './types/el-maker/types' */
/** @import {AttrPatterns} from './types/assign-gingerly/types' */

/**
 * This makes refactoring easier.  Centralize the manual 
 * correction to one place.
 * @type {{ [K in keyof AP]: K }}
 */
const props = {
    clone: 'clone',
    count: 'count',
    countData: 'countData',
    downButton: 'downButton',
    name: 'name',
    upButton: 'upButton',
    value: 'value'
};

const withMethods = [m['🔍'], m['🌐']];

const $ = (/** @type {typeof paths<RuntimeProps>} */ (/** @type {any} */(paths)))({ withMethods });

// kept separate because "smoothOver" destroys typechecking
/** @type Merges<AP> */
const merges = [
    {
        ifKeyIn: ['clone'],
        ...doAssign(
            set(props.upButton).to($.clone.querySelector('[part=up]')),
            set(props.downButton).to($.clone.querySelector('[part=down]')),
            set(props.countData).to($.clone.querySelector('[part=count]')),
        ),
    },
    {
        ifKeyIn: ['count'],
        ...doAssign(
            // Legacy `"% count": "localize"` equivalent: `toLocaleString`
            // is registered in withMethods, so as the trailing path segment
            // it's called with no args and its return value is used.
            // See NewHTMLFirstCustomElement.md "display a number with local formatting".
            set($.countData.textContent).to($.count['🌐']),
            set(props.value).to($.count)
        ),
    },
];

/**
 * Reactive wiring for <up-down-counter>.
 *
 * templateMaker adopts the declarative shadow root and exposes it as `clone`.
 * The first merge resolves the two buttons and the display element out of that
 * clone. The compacts then attach click listeners that bump `count`. The second
 * merge pushes `count` into the display element and into `value` (which faceUp
 * forwards to ElementInternals.setFormValue).
 *
 * @type {RoundaboutOptions<AP, Actions, AP, 'click' | 'keydown'>}
 */
const raConfig = {
    weakRef: {
        properties: [ props.upButton, 'downButton', 'countData'],
        logIfCollected: 'warn',
    },
    assignOptions: {
        akaMethods: {
            '🔍': m['🔍'],
            '🌐': m['🌐'],

        },
    },
    compacts: {
        on_click_of_upButton_inc_count_by: 1,
        on_click_of_downButton_inc_count_by: -1,
    },
    merges: smoothOver(merges),
    defaultPropVals: {
        [props.count]: 30000,
        [props.name]: '',
    },
};

/**
 * Attribute -> property sourcing handled by truthSourcer.
 *
 * @type {AttrPatterns<AP>}
 */
const withAttrs = {
    count: 'count',
    _count: {
        instanceOf: 'Number',
        valIfNull: 30000,
        sourceOfTruth: true,
    },
    name: 'name',
};

/** @type {ElMakerConfig<AP>} */
const features = {
    assignFeatures: {
        // faceUp: {
        //     customData: {
        //         integrateWithRoundabout: true,
        //     },
        // },
        // truthSourcer: {},
        roundabout: {
            customData: {
                raConfig,
            },
            withAttrs,
        },
        templateMaker: {},
    },
};

export function render() {
    return JSON.stringify(features, null, 4);
}

const __filename = fileURLToPath(import.meta.url);
const outputFile = __filename.replace(/\.mjs$/, '.json');
writeFileSync(outputFile, render(), 'utf8');

```

which generates working JSON:

```JSON
{
    "assignFeatures": {
        "roundabout": {
            "customData": {
                "raConfig": {
                    "weakRef": {
                        "properties": [
                            "upButton",
                            "downButton",
                            "countData"
                        ],
                        "logIfCollected": "warn"
                    },
                    "assignOptions": {
                        "akaMethods": {
                            "🔍": "querySelector",
                            "🌐": "toLocaleString"
                        }
                    },
                    "compacts": {
                        "on_click_of_upButton_inc_count_by": 1,
                        "on_click_of_downButton_inc_count_by": -1
                    },
                    "merges": [
                        {
                            "ifKeyIn": [
                                "clone"
                            ],
                            "assign": {
                                "upButton": "?.clone?.querySelector?.[part=up]",
                                "downButton": "?.clone?.querySelector?.[part=down]",
                                "countData": "?.clone?.querySelector?.[part=count]"
                            }
                        },
                        {
                            "ifKeyIn": [
                                "count"
                            ],
                            "assign": {
                                "?.countData?.textContent": "?.count?.🌐",
                                "value": "?.count"
                            }
                        }
                    ],
                    "defaultPropVals": {
                        "count": 30000,
                        "name": ""
                    }
                }
            },
            "withAttrs": {
                "count": "count",
                "_count": {
                    "instanceOf": "Number",
                    "valIfNull": 30000,
                    "sourceOfTruth": true
                },
                "name": "name"
            }
        },
        "templateMaker": {}
    }
}
```

From a DX point of view, the most problematic line is:

```JS
set($.countData.textContent).to($.count['🌐']),
```

This is nice and compact, the problem is count['🌐'] gets underlined in red.

Also, if I try not using aliases, unlike querySelector, things go awry:

```JS
set($.countData.textContent).to($.count.toLocaleString()),
```

generates:

```JSON
"?.countData?.textContent": "?.countfunction toLocaleString() { [native code] }",
```

The nice thing is it doesn't get underlined in red.  Autosuggest isn't very helpful, but it seems to kind of recognize that toLocaleString() is a valid function.  toLocaleStrings() gets underlined in red.

Can either or both of these issues be fixed?

If not, explain why below.  If so, please make the necessary adjustments and add the implementation notes below.

## Implementation Notes

Both issues were addressed. Files touched: `DX/paths.ts` + `DX/paths.js`,
`tests/paths-dx.spec.ts`, `docs/paths-dx.md`.

### Issue 2 (the `?.countfunction toLocaleString() { [native code] }` garble) — fixed, this was a real bug

`createPathProxy` classifies each accessed segment via `getReservedToken(prop)`, which did:

```js
if (prop in COMMAND_TOKEN_SUFFIXES) return prop;
```

`prop in obj` walks the prototype chain, so it is **`true` for every `Object.prototype`
member** — `toLocaleString`, `toString`, `valueOf`, `hasOwnProperty`, `constructor`,
`isPrototypeOf`, `propertyIsEnumerable`, `__proto__`, … For `$.count.toLocaleString` it
then ran `appendCommandSuffix(prefix, 'toLocaleString')` =
`` `${prefix}${COMMAND_TOKEN_SUFFIXES['toLocaleString']}` `` and
`COMMAND_TOKEN_SUFFIXES['toLocaleString']` resolves (via the prototype) to
`Object.prototype.toLocaleString`, i.e. the function itself, which stringifies to
`function toLocaleString() { [native code] }`. Hence the output.

Fix: own-property check only —

```js
if (Object.hasOwn(COMMAND_TOKEN_SUFFIXES, prop)) return prop;
```

Now `$.count.toLocaleString` serializes to `?.count?.toLocaleString`, and with the
`aka` reverse-alias in effect it becomes `?.count?.🌐`. The trailing `()` is optional
(`$.count.toLocaleString()` produces the same path). Any segment named after an
`Object.prototype`/`Function.prototype` member (`toString`, `valueOf`, `constructor`,
`hasOwnProperty`, …) is now a plain path segment. Regression test added in
`tests/paths-dx.spec.ts` ("path segments named after Object.prototype members …").

So the recommended, no-alias-in-expression form now just works:

```js
set($.countData.textContent).to($.count.toLocaleString())   // -> '?.count?.🌐' (with aka) or '?.count?.toLocaleString'
```

### Issue 1 (`$.count['🌐']` underlined red) — improved, with a caveat

`$.count.toLocaleString` (the real method name) already type-checks: every leaf proxy
is a callable intersection, so it carries `Function.prototype` / `Object.prototype`
members — that is why `toLocaleString` is accepted but `toLocaleStrings` is flagged.
After the Issue 2 fix it also *works* at runtime. **This is the recommended form** and
needs no type gymnastics.

Writing the alias key itself (`$.count['🌐']`) cannot type-check by default, because the
proxy type only knows `keyof T` plus the fixed reserved tokens — it has no way to know
your runtime `aka` map. TypeScript also can't infer the alias union from the `options`
argument while `T` is passed explicitly (`paths<RuntimeProps>(...)`) — partial type-
argument inference isn't a language feature.

Adjustment made: `paths` now takes an optional second type parameter,
`paths<T, Extra extends string = never>`, and `Extra` is threaded through `PathProxy` /
`PathProxyCore` so those names are accepted as chain segments at every level. Opt in by
passing the alias-key union explicitly:

```js
import { akaMethods as m } from 'assign-gingerly/DX/emojis.js';

const $ = paths<RuntimeProps, keyof typeof m>({ withMethods, aka: m });
set($.countData.textContent).to($.count['🌐'])   // type-checks -> '?.count?.🌐'
```

`Extra` defaults to `never`, so every existing `paths<T>()` call is unchanged and
`$.count['🌐']` still correctly errors when the union isn't supplied. Typo detection is
preserved (only the exact keys are added).

Verified: `npx tsc --noEmit` clean; full Playwright suite green (`paths-dx.spec.ts`
15/15).



