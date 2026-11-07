# Duplicate Keys

## Bruce's Ask

Let's look at this example:

```JS
const vm = {
    name: 'Demo Mission 7',
    rocket: { name: 'Falcon 9', type: 'rocket' },
    success: true,
};

assignFrom(container, {
    '?. =>': {
        do: 'builtIns.tree',
        map: {
            name: ['h2', '?.'],                                  // [tag, text]: '?.' is the key's value
            rocket: ['section', { 'class :=': 'card' }, [        // [tag, pattern, children]
                ['h3', '?.name'],                                // children resolve against vm.rocket too
                ['p', '?.type'],
            ]],
            success: ['span', { 'class :=': 'badge', textContent: 'Success' }],   // literals
        },
    },
}, { from: vm });
```

Suppose we want some section that follows the success map that is focused on rocket?  I propose we support comments in the keys that get weeded out:

```JS
assignFrom(container, {
    '?. =>': {
        do: 'builtIns.tree',
        map: {
            name: ['h2', '?.'],                                  // [tag, text]: '?.' is the key's value
            rocket: ['section', { 'class :=': 'card' }, [        // [tag, pattern, children]
                ['h3', '?.name'],                                // children resolve against vm.rocket too
                ['p', '?.type'],
            ]],
            success: ['span', { 'class :=': 'badge', textContent: 'Success' }],   // literals
            'rocket/*2*/': ['div'...]
        },
    },
}, { from: vm });
```

Do you have any other suggestions?  Please add your thoughts below.


## Claude's Thoughts

**I like your proposal,** and I'd adopt it, with a few rules spelled out. Below: two alternatives I considered, what works today, and what the comment form needs to define.

### What works today (no change)

- **Shape the VM:** add an alias property (`rocketSummary: vm.rocket`). It's simple, but it pushes a layout concern into the data.
- **`$parent`:** any element can read the whole VM through `$parent` (`'$parent?.rocket?.name'`). But it still needs a key of its own to hang from, and the key must exist in the VM. So this doesn't really give "a second rocket section after `success`".

Neither is satisfying, which is the case for something new.

### The options

**A. Your proposal: a comment in the key**, `'rocket/*summary*/'`. The comment is stripped for the VM lookup, and the full key stays the entry's identity.
- **For:** it's the smallest change, and the config stays JSON (no functions, no new object shapes). Map keys keep meaning "VM keys", and it reads as what it is: "rocket, again, for another reason".
- **Against:** some magic inside key strings, and a VM key that really contains `/*` couldn't be addressed. That's rare enough to document rather than design around.

**B. Path keys:** a map key that's a `?.` path (`'?.rocket'`) selects the value at that path. Then `rocket` and `'?.rocket'` are two keys for the same value.
- **For:** it generalizes. `'?.rocket?.engines'` could render a sub-value at its own position in the map, without a nested tree, pipes included.
- **Against:** `rocket` vs `'?.rocket'` as the way to say "again" is subtle, and a third occurrence still needs something like A. It also blurs what `'*'` ("VM keys the map doesn't name") means.

  I think B is worth its own document someday, as a feature for sub-values, but it isn't the answer to duplicates.

**C. The value named in the spec,** with the map key as a free label, e.g. `rocketSummary: [{ tag: 'div', from: 'rocket' }, …]`. It's explicit, but it changes what map keys mean (sometimes VM keys, sometimes labels). It's also noisier than A for a rare need.

**So: A.**

### What A needs to define

1. **The syntax:** I'd allow **one `/*…*/` comment at the end of the key**, trimmed, so a descriptive comment reads well: `'rocket /* summary */'` names the VM key `rocket`.
   - **Encourage descriptive comments over numbers:** `/* summary */` says why the entry exists, where `/*2*/` doesn't. They also show up in the markup's identity (below), which makes debugging easier.
   - **Only at the end:** a comment elsewhere (`'roc/*x*/ket'`) would be confusing, so it's an error.
2. **Identity: the full key.** Tree's records, the compile template ids, and o2h all use the key as written. So `rocket` and `'rocket /* summary */'` are two independent entries, each rebinding its own element. JS object keys are unique anyway.
3. **Order:** map order, as today. That's how "a section after `success`" works: put the comment key after `success`.
4. **The `'*'` wildcard:** a commented key **counts as naming** its VM key. So if the map has only `'rocket /* summary */'`, `'*'` doesn't also render `rocket`.
5. **The other key rules** use the stripped name:
   - nullish values are skipped (unless `keepNullish`);
   - the "map key isn't in the VM" warning uses the stripped name, so `'rokcet /* summary */'` still gets the typo warning.
6. **One shared function** in `treeSpec.ts` strips the comment, used by `mapEntries`. builtIns.tree and o2h then agree automatically, since both get their keys and values from `mapEntries`.
7. **Where it applies:** every tree `map`, including nested trees' maps. Not snippet `holes`, whose keys are hole names, not VM keys.
8. **Documented limitation:** a VM key containing `/*` can't be addressed by name. Workaround: shape the VM.

### A broader question

**Should the same convention work for assignFrom pattern keys in general?** Patterns are JS objects too, so they hit the same "one key per name" limit. That bites when the same LHS path needs two ` =>` handlers, or two event bindings:

```JS
{
    '?.querySelector?..panel =>': { do: 'builtIns.lazyLoad', … },
    '?.querySelector?..panel => /* loading state */': { do: 'builtIns.lazyLoadSwitch', … },
}
```

Some of this already has dedicated forms: arrays of handler configs (`'… =>': [ … ]`), and event keys. So the need is smaller there. But one consistent rule, "a trailing `/* … */` in a key is a comment", would be easier to learn than a Tree-only rule. If you agree, I'd still start with Tree, and treat the general pattern-key rule as a separate step, because it touches `categorizeKeys`, which every pattern goes through.

### Questions

1. **Option A,** with a trailing comment only, and descriptive comments encouraged?
2. **A commented key counts as naming its VM key** for `'*'`?
3. **Tree only for now,** or the same rule for pattern keys in general (later)?
4. **Should I implement it** (Tree and o2h through `mapEntries`, docs and tests)?

## Bruce's Response I

> 1. **Option A,** with a trailing comment only, and descriptive comments encouraged?

Yes, with trimming so can have surrounding space

> 2. **A commented key counts as naming its VM key** for `'*'`?

Yes

>  3. **Tree only for now,** or the same rule for pattern keys in general (later)?

Yes, that's fine, but I think it is likely to be used more generally later

> 4. **Should I implement it** (Tree and o2h through `mapEntries`, docs and tests)?

Yes, please, and add your implementation notes below.


## Claude's Implementation Notes

As agreed: a map key may end with one `/* … */` comment, trimmed on both sides. A commented key counts as naming its VM key for `'*'`. It's Tree only for now.

### Code

| Where | What |
|---|---|
| **`handlers/treeSpec.ts`** | **`mapKeyName(key)`:** the VM key a map key names, cached per key string. Without a comment, the key is used as is: plain keys aren't trimmed, so existing VM keys with spaces still work. With a comment, it's the part before the comment, trimmed. A comment anywhere but the end, two comments, or a key that's only a comment throws, naming the key. |
| | **`mapEntries`:** looks values up by that name. `TreeMapEntry` gains `name`, while `key` stays as written: it's the entry's identity for Tree's records, compile's template ids, and o2h. `'*'` skips VM keys any map key names, commented or not. |
| **`handlers/tree.ts`** | The first-render typo warning checks the VM key (`'rokcet /* summary */'` still warns), and names the key as written. |
| **`handlers/compileTree.ts`** | A commented key's compile-time sample comes from its VM key. |
| **o2h** | No code change: it gets keys and values from `mapEntries`. |
| **Docs** | tree.md's Keys section gets a table row and a subsection, "The same VM key more than once: a comment in the key". `mapKeyName` is added to the pure building blocks table. |

**Since it's likely to be used more generally later,** `mapKeyName` is written to be the rule itself: one trailing comment, trimmed, errors otherwise. Pattern keys could later use the same function (or one shared with it), once `categorizeKeys` takes it on.

### Tests

- **`tests/tree-map-keys.html` / `.spec.ts`,** with 9 cases:
  - your example, with a summary entry after `success`;
  - reruns rebinding each entry in place;
  - nullish removing both entries;
  - `'*'` not rendering the commented key's VM key again;
  - `compile` giving the same DOM;
  - the typo warning;
  - a misplaced comment throwing;
  - `adopt` reusing every element.
- **`tests/pure-modules.spec.ts`:** a Node-side test of `mapKeyName` (trimming, plain keys untouched, five malformed forms) and of `mapEntries` (two entries, identity, `'*'`, nullish, `keepNullish`).
- **o2h `tests/o2h.spec.ts`:** a Node test rendering a commented key.
- **Results:**
  - **assign-gingerly** (scratch copy, three browsers): 176 passed and 10 skipped;
  - **o2h:** its browser tests pass (9), and its Node tests (5) pass in the scratch copy linked to the new build.

### For you

**New files:** `tests/tree-map-keys.html` and `tests/tree-map-keys.spec.ts`.
