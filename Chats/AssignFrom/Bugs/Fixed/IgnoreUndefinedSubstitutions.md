# Ignore undefined substitutions

My first attempt to use the [substitution](/docs/substitutions.md) feature ran into trouble:

```JS
//@ts-check

import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { akaMethods as m } from 'assign-gingerly/DX/emojis.js';
import { paths, doAssign, set, smoothOver } from 'assign-gingerly/DX/paths.js';

/** @import { EndUserProps, AP, Actions, RunTimeProps } from './types'; */
/** @import { RoundaboutOptions, Merges } from './types/roundabout/types' */
/** @import { ElMakerConfig } from './types/el-maker/types' */
/** @import {AttrPatterns} from './types/assign-gingerly/types.js' */

const withMethods = [m['🔍'], m['🧺']];

/**
 * This makes refactoring easier.  Centralize the manual 
 * correction to one place.
 * @type {{ [K in keyof AP]: K }}
 */
const props = {
    open: 'open',
    disabled: 'disabled',
    clone: 'clone',
    closeButton: 'closeButton',
    drawer: 'drawer',
    escapeKeyPressed: 'escapeKeyPressed',
    hamburgerButton: 'hamburgerButton',
    overlay: 'overlay',
    ownerDocument: 'ownerDocument',
    inertTarget: 'inertTarget',
    inertTargetElements: 'inertTargetElements'
};

const $ = (/** @type {typeof paths<RunTimeProps>} */ (/** @type {any} */(paths)))({ withMethods });

// kept separate because "smoothOver" destroys typechecking
/** @type Merges<AP> */
const merges = [
    {
        ifKeyIn: ['clone'],
        ...doAssign(
            set($.hamburgerButton).to($.clone.querySelector('[name=hamburger]')),
            set($.closeButton).to($.clone.querySelector('[name=close]')),
            set($.overlay).to($.clone.querySelector('[name=overlay]')),
            set($.drawer).to($.clone.querySelector('[name=drawer]'))
        )
    },
    {
        ifKeyIn: [props.open],
        ...doAssign(
            set($.hamburgerButton.ariaExpanded).to($.open),
            set($.drawer.ariaHidden.QMEq).to([$.open, false, true]),
            set($.overlay.ariaHidden.QMEq).to([$.open, false, true]),
            set($.drawer.inert.QMEq).to([$.open, false, true]),
            set($.escapeKeyPressed).to(false)
        )
    },
    {
        delay: 100, //milliseconds
        ifAllOf: [props.open],
        ...doAssign(
            set($.querySelector('a').focus()).to({}),
            
        )
    },
    {
        ifKeyIn: [props.disabled],
        ifAllOf: [props.clone],
        ...doAssign(
            set($.hamburgerButton.disabled).to($.disabled)
        )
    },
    {
        ifAllOf: ['escapeKeyPressed'],
        assign: {
            [props.open]: false
        }
    },
    {
        ifAllOf: [props.clone, props.inertTarget, props.open],
        ...doAssign(
            set(props.inertTargetElements).to($.querySelectorAll($.inertTarget)),
            set($.inertTargetElements.Each.inert).to(true)
        )
    },
    {
        ifAllOf: [props.clone, props.inertTarget],
        ifNoneOf: [props.open],
        ...doAssign(
            set($.inertTargetElements.Each.inert).to(false)
        )
    }
];

/**
 * @type {RoundaboutOptions<AP, Actions, AP, 'click' | 'keydown'>}
 */
const raConfig = {
    weakRef: {
        properties: [props.hamburgerButton, props.closeButton, props.overlay, props.drawer],
        listProperties: [props.inertTargetElements],
        logIfCollected: 'warn'
    },
    
    assignOptions: {
        akaMethods: {
            '🔍': m['🔍'],
            '😣': m['😣']
        },
        substitutions: {
            inertTarget: '?.inertTarget'
        }
    },
    compacts: {
        on_click_of_hamburgerButton_assign: {
            [props.open]: true
        },
        on_click_of_closeButton_assign: {
            [props.open]: false
        },
        on_click_of_overlay_assign: {
            [props.open]: false
        },
        on_keydown_of_ownerDocument_assignFromEvent: {
            [$.escapeKeyPressed.QMEq.Path]: [['?.key', 'Escape'], true, false]
        }
    },
    merges: smoothOver(merges),
    defaultPropVals: {
        [props.open]: false,
        [props.disabled]: false
    }
};

/** @type {AttrPatterns<AP>} */
const withAttrs = {
    [props.disabled]: props.disabled,
    [props.open]: props.open,
    [`_${props.open}`]: {
        instanceOf: 'Boolean',
        mapsTo: props.open
    },
    [`_${props.disabled}`]: {
        instanceOf: 'Boolean',
        sourceOfTruth: true,
        mapsTo: props.disabled
    }
}

/** @type {ElMakerConfig<AP>} */
const features = {
    assignFeatures: {
        roundabout: {
            customData: {
                raConfig
            },
            withAttrs, //TODO: fix Typescript
        },
        templateMaker: {}
    }
};

export function render() {
    return JSON.stringify(features, null, 4);
}

const __filename = fileURLToPath(import.meta.url);
const outputFile = __filename.replace(/\.mjs$/, '.json');
writeFileSync(outputFile, render(), 'utf8');

```

The problem is I had not yet wired the attribute for inertTarget which is referenced here:

```JS
        substitutions: {
            inertTarget: '?.inertTarget'
        }
```

This would result in the following code:

```JS
function resolveSubstitutions(substitutions, source, options) {
    const map = new Map();
    if (!substitutions)
        return map;
    for (const [name, path] of Object.entries(substitutions)) {
        // Resolve the substitution path against the source, but do not apply
        // substitutions to that path. Root references ($0) are also disabled
        // for substitution paths so values are sourced from `from` only.
        const resolved = getValue(path, source, options
            ? { ...options, substitutions: undefined, root: undefined }
            : undefined);
        if (typeof resolved !== 'string') {
            throw new Error(`Substitution '${name}' must resolve to a string, got ${typeof resolved}`);
        }
        if (resolved.includes('?.')) {
            throw new Error(`Substitution '${name}' resolved to a string containing '?.', which would alter the path structure: '${resolved}'`);
        }
        map.set(name, resolved);
    }
    return map;
}
```

throwing an error here:

```JS
        if (typeof resolved !== 'string') {
            throw new Error(`Substitution '${name}' must resolve to a string, got ${typeof resolved}`);
        }
```

I think of resolved is null or undefined, it should just continue, not be added to the map.