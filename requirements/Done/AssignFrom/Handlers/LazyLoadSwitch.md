# Lazy Load Switch

---

## Human Ask

I'm open to this being combined with the already implemented [Lazy Load Conditional Display Part I](../LazyLoad/SupportForLazyLoadConditionalDisplayP1.md). This was going to be Part II, but now I'm thinking it might be cleaner if this is treated as a separate, related handler, perhaps with some shared modules.

I'm also open to renaming the original lazyLoad handler, in light of this one.  No external package has used these yet, so no concerns about backwards compatible.

This one would also be used for routing (among other purposes)

```html
<html>
    <head>...</head>
    <body>
        <div .mainView>
            My Mood:
            <div .mainView></div>
        </div>

...
        <template id=happyMood>
            <div>I am happy</div>
            <div>I am healthy</div>
        </template>
        <template id=sadMood>
            <div>I am sad</div>
            <div>I am ill</div>
        </template>
    </body>
</html>
```

```JavaScript
const myVM = {
    lhs: 37,
    rhs: 38
}

assignFrom(myDomElement, {
    '?.querySelector?..mainView =>': [
        {
            do: 'builtIns.lazyLoadSwitch',
            resolve:{
                lhs: '?.lhs',
                op: '===', //default
                rhs: '?.rhs',
                instantiate: 'globalThis://happyMood',
                method: 'appendChild', //default
            }
        },
        {
            do: 'builtIns.lazyLoadSwitch',
            resolve:{
                lhs: '?.lhs',
                op: '!==',
                rhs: '?.rhs',
                instantiate: 'globalThis://sadMood',
                method: 'appendChild', //default
            }
        }
    ]
}, {
    withMethods: ['querySelector'],
    from: myVM
})
```

Results in:

```html
<html>
    <head>...</head>
    <body>
        <div .mainView>
            My Mood:
            <div .mainView>
                <?start name="sadMood">
            <div>I am sad</div>
            <div>I am ill</div>
                <?end>
            </div>
        </div>

...
        <template id=happyMood>
            <div>I am happy</div>
            <div>I am healthy</div>
        </template>
        <template id=sadMood>
            <div>I am sad</div>
            <div>I am ill</div>
        </template>
    </body>
</html>
```

Support for everything that lazyLoad supports, where it makes sense, like onInstantiated would also be provided.

---

## Feedback / Questions

### The Core Idea

This is `lazyLoad` but with an inline comparison operator instead of a pre-computed boolean `if`. Instead of the consumer evaluating `lhs === rhs` in their VM and passing the result as `if`, the handler evaluates the comparison itself. This enables a pattern where multiple `lazyLoadSwitch` entries in an array represent different "cases" — each with its own condition and template — like a switch/case or router.

Makes sense. The existing `lazyLoad` works for the binary case (one condition, one template). `lazyLoadSwitch` works for the N-ary case (multiple conditions, multiple templates, potentially mutually exclusive).

### Relationship to `lazyLoad`

These two handlers share almost all their DOM logic (markers, clone, hide, remove, `onInstantiated`). The only difference is how the condition is evaluated:

| | `lazyLoad` | `lazyLoadSwitch` |
|---|---|---|
| Condition | `resolvedParams.if` (pre-evaluated boolean) | `evaluateOp(resolvedParams.lhs, resolvedParams.op, resolvedParams.rhs)` |
| Everything else | Same | Same |

**Implementation approach — subclass:**

```ts
export class LazyLoadSwitchHandler extends LazyLoadHandler {
    async assign(lhsTarget: any, resolvedParams: Record<string, any>): Promise<void> {
        const { lhs, op = '===', rhs, ...rest } = resolvedParams;
        const condition = evaluateOp(lhs, op, rhs);
        // Delegate to parent with computed condition
        return super.assign(lhsTarget, { ...rest, if: condition });
    }
}
```

This keeps all the DOM logic in `LazyLoadHandler` and just swaps the condition source. The `LazyLoadHandler` class is already exported for subclassing — this is exactly the pattern it was designed for.

### Supported Operators

What operators should `op` support?

| Operator | Semantics |
|----------|-----------|
| `'==='` | Strict equality (default) |
| `'!=='` | Strict inequality |
| `'=='` | Loose equality |
| `'!='` | Loose inequality |
| `'<'` | Less than |
| `'>'` | Greater than |
| `'<='` | Less than or equal |
| `'>='` | Greater than or equal |

Should it also support:
- `'in'` — `lhs in rhs` (property existence)?
- `'instanceof'` — probably not (hard to serialize)
- `'matches'` — regex match? e.g., `lhs.match(rhs)`?
- `'includes'` — `rhs.includes(lhs)` for array/string membership?

**My suggestion:** Start with the comparison operators (`===`, `!==`, `<`, `>`, `<=`, `>=`) and maybe loose equality (`==`, `!=`). They cover routing and the switch-case pattern. Others can be added later if needed.

### Naming Thoughts

You mentioned being open to renaming. Some options:

| Current | Rename to | Rationale |
|---------|-----------|-----------|
| `builtIns.lazyLoad` | `builtIns.ifThen` | Reads as: if condition, then show template |
| `builtIns.lazyLoadSwitch` | `builtIns.ifMatch` | Reads as: if lhs matches rhs, show template |
| — | `builtIns.when` / `builtIns.whenMatch` | Declarative "when" style |
| — | `builtIns.showIf` / `builtIns.showWhen` | Action-oriented |

Or keep the `lazyLoad` family name since it communicates the lazy-clone behavior:
- `builtIns.lazyLoad` → unchanged (binary, `if` condition)
- `builtIns.lazyLoadSwitch` → as proposed (comparison-based condition)

I don't have a strong opinion here — the naming is mostly about discoverability and reading intent in the config.

### The Routing Use Case

The example demonstrates mutual exclusion nicely — `===` for happy, `!==` for sad. For routing, the pattern would be:

```js
'?.querySelector?..routerOutlet =>': [
    { do: 'builtIns.lazyLoadSwitch', resolve: { lhs: '?.route', rhs: 'home', instantiate: 'globalThis://homeView' } },
    { do: 'builtIns.lazyLoadSwitch', resolve: { lhs: '?.route', rhs: 'settings', instantiate: 'globalThis://settingsView' } },
    { do: 'builtIns.lazyLoadSwitch', resolve: { lhs: '?.route', rhs: 'profile', instantiate: 'globalThis://profileView' } },
]
```

This works with the Multiple Handlers feature (sequential execution). When `route === 'settings'`:
- First handler: `'home' === 'settings'` → false → hide/remove homeView
- Second handler: `'settings' === 'settings'` → true → show settingsView
- Third handler: `'profile' === 'settings'` → false → hide/remove profileView

Clean.

### Questions

1. **`forget` behavior** — should the default be `forget: false` (hide with `hidden` attribute) same as `lazyLoad`? For routing, you might want `forget: true` by default (remove inactive views to save memory). Or leave it up to the consumer per-entry.

2. **Should only one match "win"?** — In the example, `===` and `!==` are mutually exclusive by logic. But what if someone writes two entries that could both match? Should `lazyLoadSwitch` enforce at-most-one, or just let multiple matches all show? I'd say let multiple show — it's the consumer's responsibility to make conditions exclusive. Enforcing exclusivity would add complexity without much benefit.

3. **`forget` for the "lost" case** — When a route changes from `home` to `settings`, the `home` handler fires with condition=false. Should it hide or remove? This should probably be a per-handler config decision, not a global one. Keep `forget` in `resolve` as it is.

4. **Looped substitution synergy** — this pairs well with `where_x_in`:
   ```js
   '?.querySelector?..routerOutlet =>': {
       do: 'builtIns.lazyLoadSwitch',
       resolve: { lhs: '?.route', rhs: '${x}', instantiate: 'globalThis://${x}View' }
   },
   where_x_in: ['home', 'settings', 'profile']
   ```
   But wait — this produces multiple ` =>` keys with the same LHS, which would overwrite in the object literal. It only works with the array form. Actually no — looped substitution expands before handler/normal split, and identical keys in the expanded entries do overwrite. So for routing with `where_x_in`, you'd need a different pattern (or use the array form manually). Worth noting in docs.

### Ready to Implement

Once you confirm:
- Operators to support (my suggestion: `===`, `!==`, `==`, `!=`, `<`, `>`, `<=`, `>=`)
- Naming (`builtIns.lazyLoadSwitch` or something else)
- Default `forget` behavior (same as `lazyLoad` → `false`)
- Subclass approach (extend `LazyLoadHandler`)


---

## Human Response I


> Should it also support:
> `'in'`

These are good ideas.  Please create a TODO document in this file's folder, and I'll mull that over.  Basically, I agree with your suggestion.

> **`forget` behavior**

default behavior should be forget: false.  Pet peeve of mine is how most frameworks dump previously loaded content, often losing the state of where things were, and the added load time to bring it back.  

> **Should only one match "win"?**

I agree.  Let multiple show.

>  **Looped substitution synergy**

This seems to be a really good catch.  I think we should revisit the implementation of how looped substitution was implemented. They should not overwrite somehow.  If that seemingly is opening a can of worms, let's definitely flag that item as a separate TODO document in this folder, which I would like to mull over, and overlook this legitimate concern for a bit.




---

## Response to Human Response I

All clear. Summary of decisions:

- **Operators:** `===` (default), `!==`, `==`, `!=`, `<`, `>`, `<=`, `>=`. Additional operators (`in`, `includes`, `matches`, etc.) noted in a separate [TODO](./AdditionalOperators.md) for future consideration.
- **Naming:** `builtIns.lazyLoadSwitch` (keeping the `lazyLoad` family name).
- **Default `forget`:** `false` (hide, don't remove). Matches `lazyLoad` behavior.
- **Multiple matches:** allowed — no enforced exclusivity.
- **Subclass approach:** `LazyLoadSwitchHandler extends LazyLoadHandler`.
- **Looped substitution duplicate key issue:** flagged in a separate [TODO](./LoopedSubstitutionDuplicateKeys.md). Won't block this work.

Ready to implement. Proceeding.
