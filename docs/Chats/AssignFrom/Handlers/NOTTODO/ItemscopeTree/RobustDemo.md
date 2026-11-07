# Robust Demo

## Bruce's Ask

Can you please create, in the demo folder, a robust example of the use of the itemscopeTree handler, preferably using an example of an example API that returns a complex JSON response?

Please add your implementation notes below.
---

## Implementation Notes

### Files

| File | Purpose |
|------|---------|
| `demos/itemscope-tree-demo.html` | The demo page (self-contained: inline CSS and a module script importing `../index.js`) |
| `demos/data/launch.json` | The "API response", fetched with `fetch()` like a real endpoint |
| `demos/data/mission-patch.svg` | Image referenced from the response (`patch.small`) |
| `docs/itemscope-tree.md` | Now links to the demo |

Run `npm run serve`, then open <http://localhost:8000/demos/itemscope-tree-demo.html>. Opened as a `file://` URL, the `fetch` fails, and the page shows a message saying so.

### The data

`launch.json` is **modeled on the SpaceX API v4 `launches` shape**, with the related records (rocket, crew, cores) expanded inline the way that API's `query` endpoint can return them:
- `name` and `date_utc` are strings;
- `details` is a nullable string;
- `patch` and `links` are objects (`links.wikipedia` is `null`);
- `rocket` is a nested object with further nested objects;
- `crew` and `cores` are arrays of objects;
- `failures` is an empty array;
- `id`, `flight_number` and `upcoming` are present but deliberately **not** used.

The mission, crew and agencies are **fictional** ("Demo Mission 7"). That way the demo doesn't present invented details as a real launch record, and doesn't depend on a live third-party API. The only real-world figures are Falcon 9's published height, mass and engine configuration. It's a local fixture rather than a live call so the demo is deterministic and works offline. Pointing it at a live endpoint would only change the `fetch` URL, plus some tolerance for un-expanded IDs.

### What it exercises

| Feature | Where |
|---|---|
| `map` controls keys and order (VM keys `id`, `flight_number`, `upcoming` ignored) | top-level pattern |
| Class entry, auto-registered by `.name` | `StatusBadge`, `LaunchDate`, `Details`, `LinksBar`, `RocketCard`, `CoreList`, `FailureList` |
| Class with `static itemscope` | `PatchImage`, `CrewList` |
| String entry (pre-registered) | `name: 'MissionTitle'` |
| Key missing from the VM → `undefined`, derived from `ctx.from` | `status` → `StatusBadge` |
| `instantiate` returning `null` → key skipped | `PatchImage`, when there's no image |
| Default `ish` merge (no `onAssigned`) | `PatchImage` (logs its `initVals`), `HeightISM` / `MassISM` |
| `onAssigned` with a string / nullable string / array / empty array / object | `MissionTitle`, `LaunchDate`, `Details`, `CrewList`, `CoreList`, `FailureList`, `EnginesISM` |
| **Nested tree** using the `<Key>ISM` naming convention (unregistered `name`, `type`, `active`, `stages` skipped) | `RocketCard.onAssigned` runs a second itemscopeTree on the rocket object |
| `itemprop` always set with `map` | the CSS grid places every child by `[itemprop=…]` |
| Idempotent re-run | **Run again**: logs `10 → 10 top-level elements` |
| Synchronous `ish` update with `onAssigned` | **Update details via ish**: logs `textContent` on the very next line |
| `null` value through `onAssigned` | **Set details to null**: shows a placeholder |
| Synchronous default merge invoking an accessor | **Toggle units**: `el.ish = { units }`, where `assignGingerly` calls the manager's `units` setter, which re-renders |
| Async `onAssigned` ordering | **Change links twice quickly**: assigns a slow value (`-a`, 900 ms) then a fast one (`-b`, 200 ms); the log shows `start -a`, `done -a`, `start -b`, `done -b` |

An **event log** panel records every `instantiate`, constructor and `onAssigned` call, and the **API response** panel shows the raw JSON beside the result. All data is rendered through `textContent` and DOM properties, never `innerHTML`.

### Verified

I loaded the page with Playwright in Chromium, Firefox and WebKit, clicked every button, and checked the resulting DOM:
- 10 top-level elements, in map order, with the expected `itemprop` / `itemscope` pairs;
- the nested specs render (`70 m | 549,054 kg | 9 × merlin 1D+ …`) and switch to `229.6 ft | 1,207,920 lb`;
- the details update and the `null` placeholder;
- the links end on `-b`, with the ordered log above;
- "Clear & rebuild" restores all 10 elements.

There were **no console or page errors** in any of the three browsers. I also checked the layout at 1100px and 390px wide, with no horizontal scrolling at either width.

This is a demo page, not an automated test, so nothing was added to `tests/`.
