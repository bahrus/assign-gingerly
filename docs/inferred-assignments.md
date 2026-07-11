# Inferred Assignments

`assignFrom` can automatically distribute source values to matching DOM elements based on structural conventions. Instead of writing path strings manually, you declare which keys to distribute and the system finds the right elements and sets the right properties.

## Import

```TypeScript
import { assignFrom } from 'assign-gingerly/assignFrom.js';
```

No additional imports are needed — the inferencer is loaded dynamically on demand.

## Basic Usage

```html
<div id="card" itemscope>
    <span itemprop="name"></span>
    <input itemprop="email" type="email">
    <time itemprop="joinDate"></time>
</div>
```

```TypeScript
const vm = {
    name: 'Alice',
    email: 'alice@example.com',
    joinDate: '2024-01-15T00:00:00Z'
};

await assignFrom(card, {}, {
    from: vm,
    inferredAssignments: {
        byItemprop: ['name', 'email', 'joinDate']
    }
});

// Result:
// <span itemprop="name">Alice</span>
// <input itemprop="email" value="alice@example.com">
// <time itemprop="joinDate" datetime="2024-01-15T00:00:00Z">
```

## How It Works

1. For each key in `byItemprop`, finds `[itemprop="${key}"]` elements within the target
2. Filters by scope perimeter — elements inside nested `[itemscope]` boundaries are excluded
3. For each matched element, the [inferencer](../inferencer/) determines the correct property:
   - `<input type="text">` → `value`
   - `<input type="checkbox">` → `checked`
   - `<input type="number">` → `valueAsNumber`
   - `<textarea>`, `<select>` → `value`
   - `<time>` → `dateTime`
   - `<data>`, `<meter>`, `<progress>`, `<output>` → `value`
   - `<a>`, `<area>` → `href`
   - Element with non-empty `itemscope` attribute → `ish` (itemscope manager routing)
   - All other elements → `textContent`
4. Sets `element[inferredProperty] = from[key]`

## Scope Perimeter (Donut-Hole Scoping)

Queries respect itemscope boundaries. Given:

```html
<div id="outer" itemscope>
    <span itemprop="name"><!-- outer name --></span>
    <div itemprop="address" itemscope="address-manager">
        <span itemprop="name"><!-- inner name, NOT matched from outer --></span>
    </div>
</div>
```

```TypeScript
await assignFrom(outer, {}, {
    from: { name: 'Alice' },
    inferredAssignments: { byItemprop: ['name'] }
});
// Only the outer <span itemprop="name"> is set to 'Alice'
// The inner one (inside nested itemscope) is untouched
```

## Itemscope Manager Routing (`ish`)

When an element has a non-empty `itemscope` attribute (e.g., `itemscope="user-card"`), the inferred property is `ish`. This triggers the itemscope manager system — the value is passed to the registered manager class for that element.

```html
<div id="container" itemscope>
    <div itemprop="user" itemscope="user-card">
        <!-- Managed by UserCardManager -->
    </div>
</div>
```

```TypeScript
await assignFrom(container, {}, {
    from: { user: { name: 'Alice', role: 'admin' } },
    inferredAssignments: { byItemprop: ['user'] }
});
// Sets element.ish = { name: 'Alice', role: 'admin' }
// → triggers UserCardManager instantiation/update
```

## Infer All Keys

Pass `true` to automatically distribute all keys from the source object:

```TypeScript
await assignFrom(card, {}, {
    from: vm,
    inferredAssignments: { byItemprop: true }
});
```

This iterates `Object.keys(from)` and attempts to find matching `[itemprop]` elements for each.

## Multiple Elements Per Itemprop

If multiple elements share the same `itemprop` value (within scope), all of them receive the value:

```html
<div id="list" itemscope>
    <span itemprop="tag">tag1</span>
    <span itemprop="tag">tag2</span>
    <span itemprop="tag">tag3</span>
</div>
```

```TypeScript
await assignFrom(list, {}, {
    from: { tag: 'updated' },
    inferredAssignments: { byItemprop: ['tag'] }
});
// All three spans now show 'updated'
```

## Combining with Other assignFrom Features

`inferredAssignments` runs after all other processing (normal keys, handlers, `#[x]` refs). You can combine them freely:

```TypeScript
await assignFrom(container, {
    '?.title': '?.pageTitle',           // normal path assignment
    '#[nav]?.className': '?.navClass',  // cached element ref
}, {
    from: vm,
    withIds: { nav: { qry: '.nav-bar' } },
    inferredAssignments: { byItemprop: ['name', 'email'] }
});
```

## Future: `byName` (Phase II)

A planned extension will support `byName` for form element binding:

```TypeScript
inferredAssignments: {
    byItemprop: ['user'],
    byName: ['firstName', 'lastName']  // finds [name="firstName"], etc.
}
```
