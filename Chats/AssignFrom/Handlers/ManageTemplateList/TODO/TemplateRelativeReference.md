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

---

## Copilot Response II

I think the direction you outlined is stronger than introducing a new `shadow://` protocol. The key advantage is that it keeps the resolver semantics aligned with the existing path-based model instead of creating a one-off built-in for a specific DOM feature.

On that basis, `lhs://` is a reasonable candidate, but I would frame it as a small, general-purpose convention rather than a deeply semantic name. It reads naturally as “resolve this from the left-hand-side target,” which fits the current example well. The main benefit is that it makes the reference explicit without making the config depend on the `from` object.

A few possible variants worth considering:

```js
instantiate: 'lhs://?.shadowRoot?.🔍?.#country-ranking'
```

or, if we want to make the target-root relationship even more obvious:

```js
instantiate: 'lhs://shadowRoot.🔍?.#country-ranking'
```

My preference would be the first form because it preserves the same `?.`-prefixed path feel as the rest of the library and makes it clear that the lookup is still path-oriented. In other words, the syntax would say: “start from the LHS target, follow this path, and resolve the template from there.”

That said, I would still keep the name open to refinement. `lhs` is clear enough, but `target`, `self`, or `context` might be more self-explanatory if we want the protocol to feel less like a low-level implementation detail and more like a user-facing concept.

If we want to keep the idea minimal, I would suggest the following rule of thumb:

- use ordinary path syntax for ordinary property access,
- use an `lhs://...`-style protocol only when the value should be resolved relative to the assign-from target rather than the `from` object.

That seems like a good fit for this use case.

---

## Human Response II

I simply dropped the extra ? by mistake.  I like your suggestion:

```JS
instantiate: 'target://?.shadowRoot?.🔍?.#country-ranking'
```

But really, the problem with using a protocol is it suggests a "domain" selector first, after the :// and before the ?. and there isn't any.  I think that will cause confusion.  I think we need special notation for this.

I'm thinking now:

```JS
instantiate: '$0?.shadowRoot?.🔍?.#country-ranking'
```

Basically, "$0" refers to the 0th argument.

I could see bringing back the protocol if we want to refer to other arguments (hard as it is to image):

```JS
instantiate: 'args://$0?.shadowRoot?.🔍?.#country-ranking'
```

I'm concerned $0 by itself is too simple.  There could be some scenarios where we want the rhs to be simply "$0"

---

## Copilot Response III

I think `$0` is a better fit than a protocol here. It keeps the syntax compact, avoids the awkward “domain selector with no domain” feel of `target://...`, and makes the reference to the first argument feel native to the expression.

The strongest version is the one you suggested:

```js
instantiate: '$0?.shadowRoot?.🔍?.#country-ranking'
```

That reads naturally as “start from argument 0, then follow this path.” It also keeps the rest of the expression aligned with the existing `?.` path model, which is a good match for the rest of `assignFrom`.

The one thing I would make explicit is that `$0` should be treated as a special root token, not as a normal variable-like expression. If we define it that way, then the semantics are clear:

- `$0` means “the first argument passed to `assignFrom`”
- `$0?.foo` means “resolve `foo` from that object”
- `$0` by itself means “use the target object itself”

That gives us a simple, general-purpose convention without introducing a new protocol layer.

If we eventually need references to other arguments, then a generalization such as `$1`, `$2`, and so on would be straightforward and still feel more natural than a protocol. I would lean toward that over `args://...` unless we find a strong need for richer scoping semantics.

---

## Human Response III

Agreed.  Let's go with $0.  Only match for it at the beginning of the string, not within the string.

Are there any additional questions you have before implementation can begin?

If not, please begin implementing.

---

## Copilot Response IV

That seems like a solid choice. I would treat `$0` as a special root-reference token that is recognized only when it appears at the very start of the string, not when it appears in the middle of a larger expression. That keeps the semantics unambiguous and avoids surprising matches in ordinary property names or string content.

So the intended behavior would be:

- `$0` → resolve to the first argument passed to `assignFrom`
- `$0?.shadowRoot?.🔍?.#country-ranking` → resolve from that target object along the given path
- any other occurrence of `$0` inside a longer string should be treated as literal text, not as a special reference

That seems like a clean and implementable rule, and it gives us a minimal syntax that fits the rest of the path-based model without introducing extra protocol machinery.

---

## Human Response IV

Sounds good.  Can you now implement this?


