# Template Relative Reference

---

## Human Ask

We've well documented how to render multiple instances of a template, in the [docs](../../../../../docs/manage-template-list.md):

```html
<template id="country-ranking">
    <tr itemscope="CountryMedalsCount">
        <td itemprop="rank"></td>
        <td itemprop="noc"></td>
        <td itemprop="gold"></td>
        <td itemprop="silver"></td>
        <td itemprop="bronze"></td>
        <td itemprop="total"></td>
    </tr>
</template>

<table>
    <thead><tr><th>Rank</th><th>NOC</th><th>Gold</th><th>Silver</th><th>Bronze</th><th>Total</th></tr></thead>
    <tbody id="rankings-body"></tbody>
</table>
```

```JavaScript
const vm = {
    rankings: [
        { rank: 1, noc: 'United States', gold: 40, silver: 44, bronze: 42, total: 126 },
        { rank: 2, noc: 'China', gold: 40, silver: 27, bronze: 24, total: 91 },
        // ...
    ]
};

await assignFrom(document.getElementById('rankings-body'), {
    '?. =>': {
        do: 'builtIns.manageTemplateList',
        resolve: {
            forEach: '?.rankings',
            instantiate: 'globalThis://country-ranking',
        },
        fromEachItem: {
            assignToFragment: { '?.querySelector?.tr?.ish': '?.' },
            withOptions: {
                withMethods: ['querySelector'],
                infer: { byItemprop: true }
            },
            resolve: { key: '?.rank' }
        }
    }
}, {
    from: vm,
    protocols: { globalThis: k => globalThis[k] }
});
```

This works because elements with an id outside any shadow DOM become constants available from globalThis

But sometimes we may want to reference a template within a shadow root:

```html
<my-element>
    <template shadowrootmode=open>
        <template id="country-ranking">
            <tr itemscope="CountryMedalsCount">
                <td itemprop="rank"></td>
                <td itemprop="noc"></td>
                <td itemprop="gold"></td>
                <td itemprop="silver"></td>
                <td itemprop="bronze"></td>
                <td itemprop="total"></td>
            </tr>
        </template>

        <table>
            <thead><tr><th>Rank</th><th>NOC</th><th>Gold</th><th>Silver</th><th>Bronze</th><th>Total</th></tr></thead>
            <tbody></tbody>
        </table>
    </template>
</my-element>
```

```JavaScript
const vm = {
    rankings: [
        { rank: 1, noc: 'United States', gold: 40, silver: 44, bronze: 42, total: 126 },
        { rank: 2, noc: 'China', gold: 40, silver: 27, bronze: 24, total: 91 },
        // ...
    ]
};

await assignFrom(oMyElement, {
    '?.shadowRoot?.🔍?.tbody =>': {
        do: 'builtIns.manageTemplateList',
        resolve: {
            forEach: '?.rankings',
            instantiate: 'tbd?.🔍?.#country-ranking',
        },
        fromEachItem: {
            assignToFragment: { '?.querySelector?.tr?.ish': '?.' },
            withOptions: {
                withMethods: ['querySelector'],
                infer: { byItemprop: true }
            },
            resolve: { key: '?.rank' }
        }
    }
}, {
    from: vm,
    protocols: { globalThis: k => globalThis[k] },
    withMethods: ['querySelector'],
    aka: {
        '🔍': 'querySelector'
    }
});
```

Let's think this out in baby steps. First, what do you think "tbd" should be?

---

## Copilot Response I


I would recommend that "tbd" be expressed as a protocol-style resolver rather than as a special path segment. Something like:

```ts
instantiate: 'shadow://#country-ranking'
```

or, if we want to keep it closer to the existing path model:

```ts
instantiate: '?.shadowRoot?.#country-ranking'
```

My preference is the first form because it is explicit, composable, and matches the existing `globalThis://...` pattern already used by `assignFrom`. It tells the resolver, "look up the template in the current target's shadow root," rather than overloading the path grammar with a brand-new `tbd` token.

The implementation could be straightforward:

- resolve the current context (the target element or the active root node),
- if that context has a shadow root, query it for the requested template,
- otherwise fall back to the current document or throw a clear error.

That keeps the syntax easy to read in configs while still leaving room for future extensions such as `document://...`, `host://...`, or `root://...` if we want broader scoping options.

---

## Human Response I

In the future, only append to this chat file, as I've done, not overwriting your thoughts.  Can you add that to copilot-instructions.md?  It applies to all discussions in the Chats folder (from the root).

Using a protocol like shadow:// sounds too specialized.  

Using '?.shadowRoot?.#country-ranking' appeals to me more, but the problem is expressions on the rhs of the assign-from config should consistently come from the "from" option of the third parameter, "vm" in this case.

I'm thinking what we want is the following built-in protocol:

```JS
await assignFrom(oMyElement, {
    '?.shadowRoot?.🔍?.tbody =>': {
        do: 'builtIns.manageTemplateList',
        resolve: {
            forEach: '?.rankings',
            instantiate: 'lhs://?shadowRoot.🔍?.#country-ranking',
        },
        fromEachItem: {
            assignToFragment: { '?.querySelector?.tr?.ish': '?.' },
            withOptions: {
                withMethods: ['querySelector'],
                infer: { byItemprop: true }
            },
            resolve: { key: '?.rank' }
        }
    }
}, {
    from: vm,
    withMethods: ['querySelector'],
    aka: {
        '🔍': 'querySelector'
    }
});
```

Is lhs the best name? It needs to refer to the first parameter, in this case oMyElement.





