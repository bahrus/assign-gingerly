# Ternary Assignment

---

## Human Ask

It would be nice to support ternary, conditional assignment with AssignFrom.  One approach would be to use an asynchronous(ish) built in handler, or protocol.

Let's first explore whether there's some other syntax that feels non-hackish and avoids the ceremony of a handler or protocol

Dynamic:


```JS
const vm = {
    isHappy: true,
    happyMessage: 'I am happy',
    sadMessage: 'I am sad'
}
assignFrom(oElement, {
    '?.textContent': '?.isHappy?.@?.happyMessage?.@:?.sadMessage'
})
```

Constant:

```JS
const vm = {
    isHappy: true,
    happyMessage: 'I am happy',
    sadMessage: 'I am sad'
}
assignFrom(oElement, {
    '?.textContent': '?.isHappy?.@?.`I am happy`?.@:?.`I am sad`'
})
```

Worth doing?  Any better ideas?

---

## AI Response

Interesting problem. Let me evaluate the proposed syntax and alternatives.

### Assessment of `?.@` / `?.@:` syntax

The proposed syntax embeds ternary logic *inside* the path string itself. A few concerns:

1. **Readability** — `'?.isHappy?.@?.happyMessage?.@:?.sadMessage'` is dense. The `?.@` and `?.@:` delimiters don't visually jump out as "this is a branch point." Someone reading this cold would struggle.

2. **Parser complexity** — The current `getValues` path resolution is clean: split on `?.`, navigate segments. Adding ternary means the resolver now needs to *evaluate* a condition mid-path, then pick a branch. That's no longer path navigation — it's expression evaluation.

3. **Composability concerns** — What if you want nested ternaries? What if the condition itself is a deep path? The single-string approach gets unwieldy fast.

4. **Backtick literals** — `?.` followed by a backtick-wrapped literal is a new concept that breaks the current guarantee: "every `?.`-prefixed string resolves against the source object." Now some segments are literals. That's a semantic shift.

### Is it worth doing?

Yes — conditional value selection is a real need. But I think the path string is the wrong place for it.

### Alternative approaches (ranked by preference)

**1. Array ternary syntax (RHS tuple)**

```JS
assignFrom(oElement, {
    '?.textContent': ['?.isHappy', '?.happyMessage', '?.sadMessage']
}, { ternary: true })
```

Or without an option, using a distinctive marker:

```JS
assignFrom(oElement, {
    '?.textContent': { '?': '?.isHappy', then: '?.happyMessage', else: '?.sadMessage' }
})
```

This reads clearly: condition, then-value, else-value. It's JSON-serializable. But it collides with the existing behavior where objects on the RHS get recursively resolved by `getValues` — you'd need a way to distinguish "this is a ternary" from "this is a nested object to resolve."

**2. Conditional operator in the key (LHS)**

```JS
assignFrom(oElement, {
    '?.textContent ?= ?.isHappy': ['?.happyMessage', '?.sadMessage']
})
```

Reads as: "assign to textContent, conditional on isHappy, picking from [truthy, falsy]." But this overloads the LHS with too many concerns.

**3. Pipe/transform syntax in the path**

```JS
assignFrom(oElement, {
    '?.textContent': '?.isHappy | ?.happyMessage : ?.sadMessage'
})
```

Cleaner than `?.@` but still requires parsing a mini-expression language inside the string. The `|` is a common pipe character. The `:` is the else separator.

**4. Protocol-based (`if://`)**

```JS
assignFrom(oElement, {
    '?.textContent': 'if://isHappy?then=happyMessage&else=sadMessage'
}, { protocols: { if: ... } })
```

Leverages existing protocol infrastructure. But the URL-param encoding is ugly for this use case.

**5. A `builtIns.ternary` handler (your acknowledged fallback)**

```JS
assignFrom(oElement, {
    '?.textContent =>': {
        do: 'builtIns.ternary',
        get: {
            condition: '?.isHappy',
            then: '?.happyMessage',
            else: '?.sadMessage'
        }
    }
})
```

Most ceremony, but: dead simple to implement, self-documenting, JSON-serializable, supports any level of complexity (nested conditions, computed conditions), and uses the return-value protocol like `builtIns.join` already does.

### My recommendation

**Option 3** (pipe syntax) for simple cases, **Option 5** (handler) for complex ones. But if you want a single solution that covers everything without a new mini-language, the handler is the safest bet.

If you *do* want inline syntax, I'd riff on option 3 but use `?` and `:` directly, borrowing from the ternary operator everyone already knows:

```JS
assignFrom(oElement, {
    '?.textContent': '?.isHappy ? ?.happyMessage : ?.sadMessage'
})
```

The resolution rule: if a RHS string contains ` ? ` and ` : ` (with spaces), it's a ternary expression. Resolve the condition path, then resolve and return either the then-path or the else-path.

**Pros:**
- Reads like JavaScript's ternary operator
- Whitespace-delimited, so no collision with `?` in property names or URLs
- Constant values could just be unquoted: `'?.isHappy ? I am happy : I am sad'` (non-`?.` strings pass through as literals already)

**Cons:**
- Spaces in literal values would need escaping or quotes
- Only supports single-level ternary (no nesting without getting ugly)

**For constants**, the literal-passthrough already works:

```JS
'?.isHappy ? happyMessage : sadMessage'   // resolves paths
'?.isHappy ? I am happy : I am sad'       // literal strings (no ?. prefix)
```

Wait — that doesn't work cleanly because the literal might contain spaces and colons. You'd need the `?.` prefix to distinguish paths from literals:

```JS
'?.isHappy ? ?.happyMessage : ?.sadMessage'  // both are paths
'?.isHappy ? "I am happy" : "I am sad"'     // quoted literals
```

The quoted-literal approach is clean and unambiguous. And it's a small addition to `getValues`: detect the ` ? ... : ...` pattern, resolve condition, pick branch, resolve branch value.

### Bottom line

The `?.@` syntax is creative but too cryptic. I'd go with either:
- **Inline ternary** (`'?.cond ? ?.then : ?.else'`) for the 80% case — simple, readable, small parser change
- **`builtIns.ternary` handler** for complex/nested conditions — zero new parsing, uses existing infrastructure

---

## Human Response I

Where would you rank:

```JS
assignFrom(oElement, {
    '?.textContent ?=': ['?.isHappy', '?.happyMessage', '?.sadMessage']
})
```

---

## AI Response II

I'd rank this highly — possibly the best option. Let me explain why:

### Why `?=` with array RHS works well

1. **Operator consistency** — It joins the family (` +=`, ` -=`, ` =!`, ` Y=`, ` =>`). The space-before-suffix convention is already established. `?=` visually reads as "conditional assignment" — the `?` evokes ternary, the `=` says assignment.

2. **No string parsing** — Unlike the inline ternary (`'?.cond ? ?.then : ?.else'`), this doesn't require parsing a mini-expression language inside a string. The condition and branches are array elements — they get resolved individually through the existing `getValues` pipeline.

3. **Unambiguous** — A 3-element array as the RHS of a `?=` key has exactly one interpretation: `[condition, truthy, falsy]`. No collision with existing array semantics (arrays on normal keys are passed through or resolved element-by-element).

4. **JSON-serializable** — Works perfectly with config files, server-generated patterns, and `JSON.parse`.

5. **Composable with paths** — `'?.querySelector?..panel?.textContent ?='` works with the existing path + operator suffix pattern.

6. **Constant values are natural** — Non-`?.` strings pass through as literals already:
   ```JS
   '?.textContent ?=': ['?.isHappy', 'I am happy', 'I am sad']
   ```
   No quoting ceremony needed.

7. **Implementation** — Straightforward: detect ` ?=` suffix, resolve array[0] as condition, if truthy resolve array[1], else resolve array[2]. ~10 lines in `assignFrom`.

### Where it ranks

```
?= with array    — best overall: operator-shaped, no string parsing, JSON-friendly, composable
inline ternary   — good for single values but needs string parsing and has literal edge cases
builtIns.ternary — most powerful but most ceremony, best reserved for complex cases
?.@ syntax       — too cryptic
```

### One question: what about `else` being optional?

Should a 2-element array mean "assign if truthy, skip if falsy"?

```JS
'?.textContent ?=': ['?.isHappy', '?.happyMessage']  // no else — assign only when condition is true
```

That's a useful pattern (conditional assignment without a fallback). The 3-element form is ternary; the 2-element form is "guard."

### Extended: comparison operators?

If you later want `!==`, `>`, etc., the array could grow:

```JS
'?.textContent ?=': ['?.score', '>', 90, '?.excellentMsg', '?.okMsg']
```

But that's a slippery slope toward expression evaluation. I'd keep `?=` to simple truthiness for now and leave comparison operators to `builtIns.ternary` or `builtIns.lazyLoadSwitch` (which already has `lhs`/`op`/`rhs`).

## Human Response II

I'm inclined to support (ranked in order of importance)

[ifTruthy, thenResult]
[ifTruthy, thenResult, elseResult]
[ifTrue, ifTrueResult, ifFalseResult, ifNeitherResult]
[[lhs, rhs], ifEqualsResult]
[[lhs, rhs], ifEqualsResult, ifNotEqualsResult],
[[lhs, op, rhs], ifOpSatisfiedResult]
[[lhs, op, rhs], ifOpSatisfiedResult, ifOpNotSatisfiedResult]

The concern is this can't load asynchronously, so it will add to the footprint.

---

## AI Response III

This is a well-thought-out progression. Let me address the footprint concern and the design.

### The footprint concern

You're right — since `?=` is an operator in the key (like `+=`, `Y=`), it has to be handled in the main `assignFrom` path. It can't be lazy-loaded like a handler. But let's scope the actual cost:

**The evaluation logic itself** is small. The branching is just:
1. Is the first element an array? → comparison mode. Otherwise → truthiness mode.
2. Resolve the condition/comparison operands.
3. Pick the result branch.
4. Resolve and assign the picked value.

That's maybe 40-60 lines of code. The resolution of individual values (`?.path` strings, literals, protocols) is already handled by the existing `getValue` function — no duplication needed.

**Mitigation strategy:** You could keep the `?=` *detection* inline (just the `key.endsWith(' ?=')` check + array type guard), but move the actual evaluation logic to a separate module that's imported statically at the top of `assignFrom.ts`. Since `assignFrom` is already its own module (not bundled into `assignGingerly`), the footprint only grows for consumers who import `assignFrom` — which is exactly the audience who'd use `?=`.

### Design thoughts on the forms

Your ranking makes sense. A few observations:

**`[ifTrue, ifTrueResult, ifFalseResult, ifNeitherResult]`** — this implies a three-state distinction: `true`, `false`, and "neither" (presumably `null`/`undefined`). That's useful for data that distinguishes "explicitly false" from "not yet determined." The 4-element array is unambiguous. Clear semantics:
- `condition === true` → element [1]
- `condition === false` → element [2]
- `condition` is nullish → element [3]

**`[[lhs, rhs], ...]`** — The nested array as first element is a clean signal: "this is a comparison, not a simple truthiness check." No ambiguity with the truthiness forms since those always have a flat first element (a string or resolved value, never an array).

**`[[lhs, op, rhs], ...]`** — Same pattern, just with an explicit operator. Supported ops would be the usual suspects: `===`, `!==`, `>`, `>=`, `<`, `<=`, maybe `includes` or `startsWith` for strings.

### One edge case: what if the condition path itself resolves to an array?

With truthiness mode, the first element is resolved via `getValue`. If `?.myArray` resolves to `[1, 2, 3]`, that's truthy — fine. The key distinction is whether the *literal authored value* is an array (comparison mode) vs. the *resolved value* being an array (irrelevant — it's the condition result). Since you're checking the raw authored value before resolution, this is safe: `['?.myArray', '?.thenVal']` — first element is a string, so it's truthiness mode.

### Recommended implementation approach

1. Keep `?=` detection inline in `assignFrom.ts` (cheap — one `endsWith` check)
2. Put the evaluation logic in a small helper function in `assignFrom.ts` (not a separate file — the overhead of a dynamic import would defeat the purpose, and it's small enough to not warrant a separate module)
3. Support forms 1-5 initially (truthiness + equality). Defer the `op` forms (6-7) until a use case demands them — they add operator dispatch logic

```TS
function evaluateTernary(arr: any[], source: any, options: AssignFromOptions): any {
    const condition = arr[0];
    
    if (Array.isArray(condition)) {
        // Comparison mode: [[lhs, rhs], ...] or [[lhs, op, rhs], ...]
        const lhs = resolveValue(condition[0], source, options);
        if (condition.length === 2) {
            // Equality: [[lhs, rhs], result, elseResult?]
            const rhs = resolveValue(condition[1], source, options);
            return lhs === rhs
                ? resolveValue(arr[1], source, options)
                : arr.length > 2 ? resolveValue(arr[2], source, options) : undefined;
        } else {
            // Operator: [[lhs, op, rhs], result, elseResult?]
            const op = condition[1];
            const rhs = resolveValue(condition[2], source, options);
            const satisfied = compareWithOp(lhs, op, rhs);
            return satisfied
                ? resolveValue(arr[1], source, options)
                : arr.length > 2 ? resolveValue(arr[2], source, options) : undefined;
        }
    } else {
        // Truthiness mode
        const resolved = resolveValue(condition, source, options);
        if (arr.length === 4) {
            // [ifTrue, trueResult, falseResult, neitherResult]
            if (resolved == null) return resolveValue(arr[3], source, options);
            return resolved ? resolveValue(arr[1], source, options) : resolveValue(arr[2], source, options);
        } else if (arr.length === 3) {
            // [ifTruthy, thenResult, elseResult]
            return resolved ? resolveValue(arr[1], source, options) : resolveValue(arr[2], source, options);
        } else {
            // [ifTruthy, thenResult] — guard, skip if falsy
            return resolved ? resolveValue(arr[1], source, options) : undefined;
        }
    }
}
```

The `undefined` return for the guard form (2-element) would mean "don't assign" — you'd check for this in the caller and skip the assignment.

### Footprint summary

Realistically: ~50 lines for the evaluator + ~10 lines for operator dispatch. That's negligible compared to the rest of `assignFrom`. And it only runs when a `?=` key is encountered — zero cost for patterns without it.