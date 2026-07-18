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