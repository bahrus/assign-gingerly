# Better DX For Roundabout II

I think [the efforts we've made so far](../RoundaboutDX/BetterDXForRoundabout.md) are good, but I still wonder if this could be made easier:

```ts
import { paths, set, smoothOver } from 'assign-gingerly/paths.js';

interface MyVM extends HTMLElement { /* ... */ }
const aka = { q: 'querySelector' };
const withMethods = ['querySelector', 'appendChild', 'add', 'cloneNode'];
const $ = paths<MyVM>({ aka, withMethods });
const raConfig = {
    merges: smoothOver([
        {
            ifKeyIn: ['statusClassName', 'statusMessageText'],
            ifAllOf: ['clone'],
            assign: {
                ...set($.clone.querySelector('.status').className).to($.statusClassName),
                ...set($.clone.querySelector('.status-text').textContent).to($.statusMessageText),
            }
        }
    ]),
};
```

In particular, the ... is a bit jarring.

I wonder if, with the help of smoothOver, we can make it read more intuitively, something like:

```ts
import { paths, set, smoothOver } from 'assign-gingerly/paths.js';

interface MyVM extends HTMLElement { /* ... */ }
const aka = { q: 'querySelector' };
const withMethods = ['querySelector', 'appendChild', 'add', 'cloneNode'];
const $ = paths<MyVM>({ aka, withMethods });
const raConfig = {
    merges: smoothOver([
        {
            ifKeyIn: ['statusClassName', 'statusMessageText'],
            ifAllOf: ['clone'],
            ...doAssign
            assign: {
                ...set($.clone.querySelector('.status').className).to($.statusClassName),
                ...set($.clone.querySelector('.status-text').textContent).to($.statusMessageText),
            }
        }
    ]),
};
```

