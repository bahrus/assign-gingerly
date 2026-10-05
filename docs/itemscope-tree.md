# builtIns.itemscopeTree

A handler that builds a tree of [itemscope-managed](../README.md#itemscope-managers-chrome-146) elements from a view model, for example a JSON API response. Each VM entry is paired with an itemscope manager class, which creates the entry's element through a static `instantiate` method and then manages it through the element's `ish` property.

This handler doesn't use templates or a rendering library. It decides *which* element exists for each piece of data, and where; each manager class decides *what* that element looks like (and may use template literals or anything else to do so).

## Import

Nothing to import: it's loaded on demand as soon as a handler config uses `do: 'builtIns.itemscopeTree'`. The emoji alias `🌳` works too, when `builtInEmoji` is passed as `handlers`:

```JavaScript
import { builtInEmoji } from 'assign-gingerly/DX/emojis.js';

await assignFromAsync(target, { '?. =>': { do: '🌳' } }, { from: vm, handlers: builtInEmoji });
```

## Basic Example

```html
<details id=api-response>
    <summary>API Response</summary>
</details>
```

```JavaScript
const vm = {
    image: {
        url: 'https://example.com/moon.jpg',
        description: 'Lunar Surface'
    }
};

class ImageHandler {
    constructor(element, initVals) {
        this.element = element;
        Object.assign(this, initVals);
    }
    static instantiate(image, ctx) {
        const img = document.createElement('img');
        const { url, description } = image;
        img.src = url;
        img.alt = description;
        return img;
    }
}

customElements.itemscopeRegistry.define('ImageISM', { manager: ImageHandler });

await assignFromAsync(document.getElementById('api-response'), {
    '?. =>': { do: 'builtIns.itemscopeTree' }
}, { from: vm });
```

Result:

```html
<details id=api-response>
    <summary>API Response</summary>
    <img itemscope=ImageISM src="https://example.com/moon.jpg" alt="Lunar Surface">
</details>
```

`img.ish` is now an `ImageHandler` instance, constructed as `new ImageHandler(img, vm.image)`.

## Two Ways to Pair Keys with Managers

| | Naming convention (no `map`) | Explicit `map` |
|---|---|---|
| Keys processed | Every top-level key of `from`, in `Object.keys` order | Only the map's keys, in map order |
| Manager lookup | `<PascalCasedKey>ISM` in the registry | A class (registered automatically) or a registered name |
| Keys missing from `from` | n/a | Still created, with `undefined` |
| `itemprop=<key>` | Only if the target has `itemscope` | Always |
| An existing element is found by | `itemscope` | `itemprop` |

### Naming convention

Without `map`, each key maps to a manager name by capitalizing its first letter and appending `ISM`:

| Key | Manager name |
|---|---|
| `image` | `ImageISM` |
| `heroImage` | `HeroImageISM` |
| `mission` | `MissionISM` |

The suffix keeps generic VM keys (`image`, `user`, `item`) from colliding with unrelated managers, and makes taking part in the tree an explicit choice at registration time.

### Explicit mapping with `map`

```JavaScript
await assignFromAsync(document.getElementById('api-response'), {
    '?. =>': {
        do: 'builtIns.itemscopeTree',
        map: {
            image: ImageHandler,
            filler: class Filler { static instantiate() { return document.createElement('br'); } },
            mission: 'MissionManager'
        }
    }
}, { from: vm });
```

- **Order:** elements are appended in **map order**, and the VM's keys aren't iterated at all.
- **Missing keys:** a key the VM doesn't have (`filler` above) is still instantiated, with `undefined`.
- **Class entries** are registered automatically, unless already registered, under the name `Class.itemscope ?? Class.name`. That name becomes the element's `itemscope` value.
- **String entries** must name a manager that is already registered. If it isn't, the key is skipped.
- **`itemprop`:** `itemprop=<key>` is always set, and existing elements are found by it. That's what lets one class serve several keys:

  ```JavaScript
  map: { hero: ImageHandler, thumb: ImageHandler }
  // → <img itemprop=hero itemscope=ImageHandler> <img itemprop=thumb itemscope=ImageHandler>
  ```

`map` holds class references, so this form of the config isn't JSON-serializable. The naming-convention form, or a `map` that uses only strings, is.

#### Stable names: `static itemscope`

`Class.name` isn't reliable in production builds:

- **Minifiers** (esbuild `--minify`, terser) rename classes: `class e {}`, `e.name === 'e'`.
- **Bundlers** rename on collisions when combining modules, even without minifying: two modules that each declare `ImageHandler` produce `ImageHandler$1` or `ImageHandler2`.

Exporting the class doesn't prevent either. To get a name that survives bundling, declare it on the class:

```JavaScript
class ImageHandler {
    static itemscope = 'ImageHandler';
    static instantiate(image, ctx) { /* ... */ }
}
```

Alternatively, register the manager yourself and reference it by string, or configure your build to keep class names (esbuild `keepNames`, terser `keep_classnames`).

#### Key order caveat

JavaScript orders integer-like keys (`'1'`, `'2'`) first, ascending, regardless of the order they were written in. Avoid them in `map` when order matters.

## The `instantiate` Contract

```TypeScript
static instantiate(value: any, ctx: ItemscopeTreeContext): HTMLElement | null | undefined
```

- **Synchronous.** The handler doesn't await it.
- **`value`** is the VM's value for the key, **as-is, whatever its type:** object, array, string, number, `null`, or `undefined`.
- **Return an `HTMLElement`** to have it appended. Anything else (`null`, `undefined`, a text node, a fragment) skips the key without an error.
- **The handler overwrites `itemscope`** with the resolved manager name, even if `instantiate` already set one.

`ctx` (`ItemscopeTreeContext`, in `types/assign-gingerly/types.d.ts`):

| Property | Description |
|---|---|
| `target` | The element the new node will be appended to |
| `key` | The VM key being instantiated |
| `from` | The whole VM (`options.from`) |
| `options` | The `assignFrom` options |
| `registry` | The itemscope registry the manager was found in |

## How It Works

For each key (VM keys, or map keys):

1. **Resolve the manager:** from the naming convention, or the `map` entry, registering a class if needed. If no manager is registered under that name, skip the key. It doesn't wait for one to be registered later.
2. **Check for an existing element:** if a **direct child** of the target already has that `itemscope` (or that `itemprop`, with `map`), skip the key. Elements nested deeper don't count.
3. **No `instantiate`:** if the manager has no static `instantiate`, skip the key.
4. **Create:** call `instantiate(value, ctx)`. Skip the key unless it returns an `HTMLElement`.
5. **Mark:** set `itemscope=<managerName>`, and `itemprop=<key>` when applicable.
6. **Insert:** `appendChild` into the target.
7. **Attach the manager:** define the element's `ish` property and assign the value, which constructs the manager.

Everything inside the handler is **synchronous**. The only `await` is loading the handler module the first time it's used, and that is cached afterwards.

Running the handler again with the same VM is therefore safe: existing elements are found in step 2 and left alone. Updating them is planned (see [Roadmap](#roadmap)).

## Integration with `ish`

Step 7 uses the same `ish` machinery as [Itemscope Managers](../README.md#itemscope-managers-chrome-146), with the manager found synchronously:

- **Default:** the manager is constructed as `new Manager(element, Object.assign({}, value))`. Strings and arrays spread into indexed properties; primitives, `null` and `undefined` give `{}`.
- **With `static onAssigned(instance, value, ctx)`:** the manager is constructed with no `initVals`, and `onAssigned` receives the value as-is. This is the way to handle values that aren't objects.

```JavaScript
class TitleManager {
    constructor(element) { this.element = element; }
    static instantiate(title) { return document.createElement('h2'); }
    static onAssigned(instance, value, ctx) {
        instance.element.textContent = String(value ?? '');
    }
}
```

Later `el.ish = newValue` assignments are applied synchronously as well. The README's [ish section](../README.md#validation-and-error-handling) covers async `onAssigned`, ordering, and errors.

## Registries

The handler uses the target's scoped `customElementRegistry.itemscopeRegistry` when it has one, and falls back to the global `customElements.itemscopeRegistry`. Classes from `map` are registered in that same registry.

## Errors

The handler skips problem cases silently, with three exceptions that **throw**, rejecting the `assignFromAsync` promise:

| Condition | Message (abbreviated) |
|---|---|
| A `map` class has no usable name (anonymous, no `static itemscope`) | `map entry "x" has no class name; declare a static itemscope = '...'` |
| A `map` class's name is already registered to a **different** class | `itemscope name "X" (map entry "x") is already registered to a different class` |
| A `map` entry is neither a class nor a string | `map entry "x" must be a class or a registered itemscope name` |

## Types

All of these live in `types/assign-gingerly/types.d.ts`:

```TypeScript
export interface ItemscopeTreeConfig extends HandlerConfig {
    do: 'builtIns.itemscopeTree';
    map?: Record<string, ItemscopeManager | string>;
}

export type ItemscopeManager<T = any> = {
    new (element: HTMLElement, initVals?: Partial<T>): T;
    itemscope?: string;
    instantiate?(value: any, ctx: ItemscopeTreeContext): HTMLElement | null | undefined;
    onAssigned?(instance: T, value: any, ctx: IshAssignContext): void | PromiseLike<void>;
}
```

## Roadmap

Not yet supported:

- **Updating existing elements** when the VM changes (step 2 currently skips them).
- **Pulling from a section of the VM** (e.g. `get: { from: '?.section' }`) instead of `options.from`.
- **Several nodes per key**, which would be tied together with `itemref`. Internally the handler already treats the result as a one-item list.
- **`async` `instantiate`**, insertion methods other than `appendChild`, and waiting for managers registered later.

Design discussions: `Chats/AssignFrom/Handlers/TODO/ItemscopeTree/` (Phases I–III).
