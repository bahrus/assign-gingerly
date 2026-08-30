# ClassList nuance

## Bruce's Request

One fundamentally important operation why *might* not yet support with the existing assignFrom functionality is:

```JS
const vm: {
    isTrue: boolean
} = {isTrue: false}
if(vm.isTrue) {
    oElement.classList.add('isTrueCls');
}else{
    oElement.classList.remove('isTrueCls');
}
```

Am I mistaken?  If so, please provide the syntax I'm missing / forgetting.

If not, how would you recommend enhancing the syntax to support this?

---

## Response

### Short answer

You're **not** missing a dedicated "conditional classList" syntax — there isn't one. But the
operation is already fully expressible today, because the DOM already has the exact primitive
your `if/else` block is emulating:

```JS
oElement.classList.toggle('isTrueCls', vm.isTrue);
```

`classList.toggle(token, force)` with an explicit boolean `force` **is** your `if/else`:
`force === true` adds, `force === false` removes. So the only question is whether `assignFrom`
can call `toggle` with a *resolved* second argument. It can.

### Form 1 — array-arg method call (works today)

```JS
assignFrom(oElement, {
    '?.classList?.toggle': ['isTrueCls', '?.isTrue']
}, { from: vm, withMethods: ['toggle'] });
```

- The RHS array is resolved element-wise against `from` (`getArray` in [resolve/getValues.ts](../../../resolve/getValues.ts)),
  so `'?.isTrue'` becomes `false`.
- `toggle` being last and in `withMethods`, the resolved array is spread as arguments
  (README §"Array arguments"), producing `classList.toggle('isTrueCls', false)`.

Verified: `isTrue: false` removes the class, `isTrue: true` adds it.

**Nuance / gotcha:** if `?.isTrue` resolves to `undefined`/`null` (path absent on the VM),
you get `toggle('isTrueCls', undefined)` — which is the *no-force* form, i.e. it **flips**
(non-idempotent), it does not "remove". So Form 1 is only safe when the value is guaranteed
to be a real boolean. Your typed `vm` guarantees that; a loosely-shaped JSON source does not.

### Form 2 — `?=` ternary (safe against nullish)

```JS
assignFrom(oElement, {
    '?.classList?.toggle ?=': ['?.isTrue', ['isTrueCls', true], ['isTrueCls', false]]
}, { from: vm, withMethods: ['toggle'] });
```

The `?=` result is fed back through `assignGingerly` with `withMethods`, so the chosen
`['isTrueCls', true|false]` array is spread into `toggle`. Nullish `?.isTrue` takes the
falsy branch → explicit `false` → removes. Idempotent, and it matches your `if/else`
including the implicit "else on undefined".

**Its own gotcha:** the then/else entries must be *literal* arrays. If the class token itself
is VM-driven (`['?.clsName', true]`), `isNestedTernary` sees a `?.`-prefixed first element and
mis-parses the entry as a *nested ternary* — `?.clsName` gets evaluated as a condition and
`toggle` is called with a single truthy value. So Form 2 breaks with a dynamic token; Form 1
handles a dynamic token fine (`['?.clsName', '?.isTrue']`).

### Summary of what already works

| Case | Form 1 (`toggle: [tok, '?.cond']`) | Form 2 (`toggle ?=`) |
|------|-----------------------------------|----------------------|
| static token, guaranteed boolean | ✅ | ✅ |
| static token, possibly-nullish condition | ⚠️ flips instead of removing | ✅ |
| VM-driven token | ✅ | ❌ mis-parsed as nested ternary |

For your literal example (`vm.isTrue: boolean`, static token) **Form 1 is the answer you were
looking for** — no enhancement needed.

### If you want a dedicated syntax anyway

The table above shows the composition works but has sharp edges. A first-class command would
remove them. Recommended spelling, consistent with the existing ` Y=` / ` +=` / ` ?=` family:

```JS
assignFrom(oElement, {
    '?.classList C=': {
        isTrueCls:  '?.isTrue',
        loadingCls: '?.isLoading',
        errorCls:   ['?.status', '===', 'error']   // reuse the ?= condition grammar
    }
}, { from: vm });
```

Semantics: for each `key: cond` pair, resolve `cond` against `from`, then
`domTokenList.toggle(key, Boolean(resolved))`. Properties:

- **Always boolean-coerced** → nullish means "remove", never "flip". Idempotent.
- **Tokens are object keys** → no `?.`-prefix ambiguity, so dynamic tokens are fine via
  `where_x_in` expansion or `substitutions`.
- **Multiple classes in one entry**, mirroring how `Y=` merges multiple sub-keys.
- No `withMethods: ['toggle']` boilerplate — the command implies it.
- Condition values could accept the full `?=` RHS grammar (bare path, `[lhs, op, rhs]`,
  `['?.a', '||', '?.b']`) for free by delegating to `evaluateTernary`.

A smaller, more general alternative that also fixes Form 2: a **boolean-coercion marker** on
RHS paths, e.g. `'!!?.isTrue'`, meaning "resolve then `Boolean(...)`". Then
`['isTrueCls', '!!?.isTrue']` is unconditionally safe and the marker is reusable anywhere a
path feeds a boolean sink (`hidden`, `disabled`, `aria-*`, etc.).

**Recommendation:** ship the `!!` coercion marker regardless (cheap, broadly useful), and add
` C=` if conditional class lists show up often enough in real configs to justify a command.

## Bruce's Response I

I think supporting `!!` coercion might be sufficient, if we also added support for [Ditto Notation](/requirements/TODO/DittoNotation.md).

What are thoughts on the feasibility of such a solution?

---

## Response to Bruce's Response I

Feasible, yes — and the architecture already has the right seam for it. But it's really
**three** changes, not two, and only the first is small. Breaking it down:

### Piece 1 — the `!!` coercion marker (small, do it regardless)

Localized to [resolve/getValues.ts](../../../resolve/getValues.ts). Today `getArray` /
`getValues` / `getValue` branch on `item.startsWith('?.')`, `.startsWith('$0')`, and protocol
strings. Add one more: a leading `!!` (and, for free, a single `!` = coerce-then-negate)
means "resolve the remainder, then `Boolean(...)`".

```JS
['isTrueCls', '!!?.isTrue']     // → toggle('isTrueCls', Boolean(vm.isTrue))
['isTrueCls', '!?.isHidden']    // → toggle('isTrueCls', !vm.isHidden)
```

Notes:
- Strip `!!` / `!` before alias + substitution + path-cache handling, coerce after navigate.
- Consistent with the existing `=!` operator's use of `!` for negate/toggle on the LHS.
- Applies in all three resolve spots (object value, array item, `$0` ref) — a few lines each.
- Open question: `'!!plain-literal'` (no `?.`) — coerce the literal string (`→ true`), or treat
  `!!` as literal text unless followed by a path/protocol? Minor; I'd say coerce, for
  consistency.

This piece alone fixes Form 1's nullish gotcha and is reusable for every boolean sink
(`hidden`, `disabled`, `aria-expanded`, …). Worth shipping on its own.

### Piece 2 — ditto key expansion (small–medium, broadly useful)

Very feasible, and the seam already exists. [assignFrom.ts](../../../assignFrom.ts)'s
`expandSubstitutions` works on an **`[key, value][]` tuple array** right up until
`mergeHandlerDuplicates` collapses it to an object. Duplicate keys are legal in that tuple
form. A ditto pass slots in there: walk the tuples, replace `` ` `` / `` `N `` with the
Nth-previous non-backtick key. ~15 lines, order preserved, no collision until collapse.

### Piece 3 — the part ditto does *not* give you (medium)

Ditto solves "I can't write the same key twice in an object literal." It does **not** teach
the assignment engine to *call `classList.toggle` more than once*. Today, when a
`withMethods` method is the last segment, the engine calls it exactly once, spreading an
array value as its args. Two ditto entries resolving to `'?.classList?.toggle'` still have to
collapse to a single object key, so something has to define what that collapse means for a
**method** key.

The precedent is right there: `mergeHandlerDuplicates` already does exactly this for ` =>`
keys — collision → collect values into an array → handler layer invokes once per element.
Generalizing it to method keys means: at categorize time, check whether the key's last
segment is in `options.withMethods`; if so and it collides, collect the arg-tuples and have
the invoke step call the method once per tuple.

```JS
assignFrom(oElement, {
    '?.classList?.toggle': ['isTrueCls', '!!?.isTrue'],
    '`':  ['loadingCls', '!!?.isLoading'],
    '`2': ['errorCls',   ['?.status', '===', 'error']],
}, { from: vm, withMethods: ['toggle'] });
```

Effort: contained, but it's a genuine new rule in the categorize + invoke path, and it must
not disturb the existing "single call, spread the array" behavior.

### Alternative: skip ditto entirely (Piece 1 + a smaller Piece 3)

If the *only* motivation for ditto here is repeating one method call, you don't need
duplicate keys at all — let an **array whose every element is itself an array** on a method
key mean "invoke once per sub-array":

```JS
assignFrom(oElement, {
    '?.classList?.toggle': [
        ['isTrueCls',  '!!?.isTrue'],
        ['loadingCls', '!!?.isLoading'],
        ['errorCls',   ['?.status', '===', 'error']],
    ]
}, { from: vm, withMethods: ['toggle'] });
```

One key, no duplicate-key machinery, no ditto. Cost: a heuristic to tell this apart from a
single call that happens to take an array argument — rule would be "**all** elements are
arrays ⇒ multi-invoke; mixed ⇒ single spread call." For DOM methods that's unambiguous
(`toggle`/`add`/`setAttribute` never take array args); as a general `withMethods` rule it's
slightly magic. An explicit sentinel (`['()', [...], [...]]`) removes the guesswork at the
cost of a little noise.

### Verdict

- **Piece 1 (`!!`)**: yes, do it — small, orthogonal, broadly useful.
- **Piece 2 (ditto)**: yes, feasible and cheap, but justify it on its *own* merits (handlers,
  ordered ops, config composition per the requirements doc), not on this use case.
- **Piece 3**: unavoidable if you want N method calls from one target, whether you reach it
  via ditto or via the all-arrays form. It's the same amount of engine work either way.

So "`!!` + ditto" is a real solution and roughly the same total effort as a focused ` C=`
command — the difference is that `!!` and ditto are reusable elsewhere, while ` C=` reads
better for this one case and needs no new resolver/marker syntax. If you're only going to
build one thing right now, build `!!`; it closes the sharpest edge (Form 1 nullish → flip)
and leaves the multi-class question to whichever of ditto / `C=` / all-arrays you later
decide you like.

## Bruce's Response II

I'm a little lost about the significant overhead that **Piece 3** seems to incur.  I'm not too interested in maximizing performance here.  The way I kind of visualized the way the logic would flow is:

1.  Have a variable that holds the last lhs key.
2.  Process the lhs key the way the code currently does.
3.  If the lhs key matches the ditto start of a ` character, just substitute in the last lhs key and process just like doing 2, but with that lhs substituted it.

Am I missing something?  I want to make sure we are on the same page.

---

## Response to Bruce's Response II

You're right that there's no performance cost, and "overhead" was a poor word choice on my
part — I didn't mean CPU. The snag is **structural**: your steps 1–2 are a list of
`(key, value)` pairs, but step 3's "process just like 2" assumes that list survives far
enough down the pipeline to be processed. It doesn't — it collapses to a plain object almost
immediately, and objects can't hold the same key twice.

### Where the list stops being a list

Trace the actual flow in [assignFrom.ts](../../../assignFrom.ts):

1. `expandSubstitutions(pattern, options)` — operates on `Object.entries(pattern)` tuples
   (duplicates OK here), does `where_x_in` expansion, then ends by calling…
2. `mergeHandlerDuplicates(entries)` — **returns `Record<string, any>`**. This is where
   duplicates collapse. For every key *except* ones ending in ` =>`, a second occurrence
   **silently overwrites** the first (plain JS object semantics). ` =>` keys are the one
   special case: they're collected into an array.
3. `categorizeKeys` → `getValues` → `assignGingerly` — all keyed by a unique string from here on.
4. `assignGingerly` ([assignGingerly.ts:693-705](../../../assignGingerly.ts)) does **one**
   method call per key: `method.apply(target, [...value])` if the value is an array, else
   `method.call(target, value)`.

So after ditto rewrites `` ` `` → `'?.classList?.toggle'`, you have two tuples with an
identical key. At step 2 the second overwrites the first, and nothing downstream ever sees
two. Your step-3 substitution is trivial and correct; it's the *collision that substitution
creates* that has nowhere to go.

### What makes your model work — and it's small

Two localized edits, mirroring the ` =>` precedent that already exists:

1. **`mergeHandlerDuplicates`** ([assignFrom.ts:354](../../../assignFrom.ts)): widen the
   special case. Right now it's `if (key.endsWith(' =>') && key in result)`. Add: *or* the
   key's terminal segment is a `withMethods` method → collect colliding values into an array
   instead of overwriting. (~5 lines.)
2. **`assignGingerly`** ([assignGingerly.ts:701](../../../assignGingerly.ts)): where it
   currently does `method.apply(target, [...value])` for an array value, detect "array whose
   elements are *all* arrays" (or an explicit sentinel) → loop and `apply` once per inner
   array. (~5 lines.)

That's it. Not a redesign — just extending "one key ⇒ one op" to "one key ⇒ N ops" in
the two spots that assumption lives. I flagged it as a separate "Piece 3" only because it's a
real behavior change in load-bearing code, not because it's large.

### Note

This is also exactly why the **all-arrays-on-one-key** form and **ditto** need the *same*
edit #2 — the multi-invoke loop is the actual work; ditto vs. `[[...],[...]]` is just how the
input is spelled. And ditto for ` =>` handler keys needs *neither* edit — it already works
via `mergeHandlerDuplicates`'s existing branch. It's method keys (and plain keys) that need
the widening.

So yes — we're on the same page. Your 3-step model is right; it just needs `mergeHandlerDuplicates`
to not throw away the collision, and `assignGingerly` to loop when it finds one.

## Bruce's Response III

Before plunging in, can you think of any notation that would be easier to implement than ditto above, but that would be as clear or clearer?  I think trying to recognize any array on the RHS as multiple statements to execute has way too much overriding.  The only thing I could think of is reserving some  something like:


```JS
assignFrom(oElement, {
    '?.classList?.toggle': {
        '@doForEach':  [
            ['isTrueCls',  '!!?.isTrue'],
            ['loadingCls', '!!?.isLoading'],
            ['errorCls',   ['?.status', '===', 'error']],
        ]
    }
}, { from: vm, withMethods: ['toggle'] });
```

If no such simplification jumps out, please proceed with `!!` + ditto notation and add your implementation notes below.
