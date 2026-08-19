# Substitution

---

## Bruce's Ask

I was hesitant to propose this, but the use cases for this just seem too compelling to not do so.  When resolving the rhs in an assignFromCall, we need the ability to substitute in values from the "from" argument:

Phase I

```JS
const myCustomElement = this;
myCustomElement.inertTarget = '#main';
assignFrom(myCustomElement, {
    inertTargetElements: '?.ownerDocument?.querySelectorAll?.${inertTarget}'
}, {
    from: myCustomElement,
    withMethods: ['querySelectorAll']
})
```

I'm open to something other than ${} if that could seem confusing due to its other uses.  

Phase Maybe Never

I don't think there's a compelling case for Phase II, but I wouldn't be shocked if a (weak) use case does arise to allow chained accessor expressions inside ${}.

Phase Too Hard To Even Consider

If we ever did consider implementing Phase Maybe Never, supporting nested ${}'s inside that seems a step too far.  

Do you think implementing Phase I is achievable?  Any ambiguities that need clarifying first?

## Kimi's Response

Phase I is definitely achievable. The rhs string is already being parsed/interpreted (the `?.` optional chaining syntax is custom), so adding a token-substitution pass on top of that is a small increment of complexity, not a fundamentally new capability. I would keep the two passes explicit:

1. **Substitution pass** — replace `#{identifier}` with the serialized value from `from`.
2. **Existing path/method parse** — parse the resulting string as usual.

That separation also makes it easy to support Phase Maybe Never later by allowing `.`/`?.` access inside the substitution, since the inner expression can be evaluated against `from` independently and then coerced to a string.

### Syntax recommendation

I would avoid `${}` because it overlaps with JavaScript template literals both visually and conceptually. In a JS codebase it will repeatedly make readers think they're looking at a template literal that got quotes around it. A few alternatives:

- `#{inertTarget}` — visually distinct, widely understood as interpolation.
- `%{inertTarget}` — less common but unambiguous.
- `{{inertTarget}}` — reads as placeholder/mustache style, but might collide with other template syntax in the ecosystem.
- Keep `${}` but require escaping (e.g. `\${}`) when a literal is intended.

My preference is `#{...}` for Phase I, because it is still compact but does not look like JS template syntax.

### Ambiguities to resolve

1. **What types can be substituted?** In your example the value is a string selector. If the substituted value is an object, function, `null`, or `undefined`, what is the serialized form? I would restrict Phase I to primitives (string, number, boolean, bigint, nullish) and throw on anything else, rather than implicitly calling `String(value)`.

2. **Where is substitution allowed?** Is it only inside rhs path strings, or also in property keys, or in the optional-chaining path segments? For Phase I I would allow it anywhere a string rhs is accepted, but not in object keys, to keep the mental model simple: "rhs strings may contain #{placeholders}".

3. **Identifier vs. expression.** Phase I should accept a single identifier only. If Phase Maybe Never happens, the same syntax can accept dot/bracket access; the implementation just changes the evaluator of the inner expression.

4. **Escaping.** If the user literally wants `#{inertTarget}` in a selector, there must be an escape hatch. Either `\#{...}` or a doubled delimiter `##{...}`.

5. **Source of values.** Are placeholders resolved from `from` only, or also from the target? I would say `from` only; reading from the target would create ordering/two-way ambiguity. If the target is also the source (`this`), the example still works because `from` is set to `myCustomElement`.

6. **Error messages.** A missing key should produce a clear error that names the placeholder and the source object, e.g. `Unknown substitution "inertTarget" in rhs "?.ownerDocument?.querySelectorAll?.#{inertTarget}"`.

### Interaction with existing features

- **withMethods / withGetters / aka** — these still apply to the final rhs. In the example, `querySelectorAll` is in `withMethods`, so the parser knows the substituted segment is a method argument, not a property.
- **TypeScript inference** — this is the biggest downside. Right now rhs strings can be parsed into typed paths; once placeholders enter the string, static type inference becomes much weaker. We may end up treating any rhs with a placeholder as effectively opaque from a type perspective. That might be acceptable for Phase I, but it should be called out.
- **Caching** — if the substituted value changes, the rhs changes, which means resolved assignments would need to be recomputed. This interacts with any caching of parsed rhs strings. I would recommend not caching strings that contain placeholders, or caching per substituted value snapshot.

### Suggested first step

Add a single helper, something like `substitutePlaceholders(rhs, from, options)`, invoked by the rhs resolver before the main parse. It scans for `#{...}`, evaluates the inner identifier against `from`, serializes the result, and returns the final string. Keep it strict: throw on unknown keys, throw on non-primitive values, throw on nested delimiters.

I think the use case is compelling enough and the scope is controllable enough that it's worth doing. The main thing to lock down before implementation is the delimiter choice and the substitution-source semantics (`from` only, vs. target too).

## Bruce's Response  - AKA substitution

I'm thinking now of adopting a radically different approach:

Phase I

```JS
const myCustomElement = this;
myCustomElement.inertTarget = '#main';
assignFrom(myCustomElement, {
    inertTargetElements: '?.ownerDocument?.querySelectorAll?.inertTarget'
}, {
    from: myCustomElement,
    withMethods: ['querySelectorAll'],
    aka: {
        inertTarget: '?.inertTarget'
    }
})
```

Phase two would allow the rhs of inertTarget to be an object, and we could specify if the path to evaluate comes from the target or the from.

>  1. **What types can be substituted?** 

Since this new approach requires substitution, I think we should throw if '?.inertTarget' doesn't evaluate to a string

>  2. **Where is substitution allowed?**

Wherever aka applies currently.

>  3. **Identifier vs. expression.**

Not applicable now

> 4. **Escaping.**

Not applicable now

> 5. **Source of values.**

For Phase I, from `from` only.

> 6. **Error messages.**

I think this is now covered by 1. now?

Would this work?

## Kimi's Response - AKA substitution

Yes, this can work, but I would not silently overload the existing `aka` option because it currently does something different.

### How `aka` currently works

I checked `resolve/getValues.ts`. `aka` maps a token to another token, and `applyAliases` does a segment-for-segment replacement inside `?.`-delimited paths:

```typescript
function applyAliases(path: string, aliasMap: Map<string, string>): string {
    if (aliasMap.size === 0) return path;
    const parts = path.split('?.');
    const substituted = parts.map(part => aliasMap.get(part) ?? part);
    return substituted.join('?.');
}
```

So today `aka: { q: 'querySelector' }` turns `?.q?.foo` into `?.querySelector?.foo`. The alias value is a *path segment*, not an evaluated expression.

### What your proposal changes

Your example uses `aka: { inertTarget: '?.inertTarget' }` and expects `?.querySelectorAll?.inertTarget` to become `?.querySelectorAll?.#main`. That means `aka` has become a two-step operation:

1. Evaluate the rhs (`'?.inertTarget'`) against `from` to get a *value*.
2. Substitute that value into other path strings wherever the alias name appears.

That is a different feature from the current segment alias, even though the API shape is the same.

### Why the example resolves correctly

If `inertTarget` evaluates to `'#main'`, the rhs string becomes:

```
?.ownerDocument?.querySelectorAll?.#main
```

`#main` is not in `withMethods`, so the parser treats it as the argument to `querySelectorAll`, exactly as it would with the `${}` / `#{}` interpolation approach. So the result is `myCustomElement.ownerDocument.querySelectorAll('#main')`. Mechanically, the behavior is the same.

### The conflict with existing `aka`

If we change `aka` to mean "evaluate and substitute values," existing usage like `aka: { q: 'querySelector' }` would break or behave bizarrely:

- `?.q?.foo` would resolve `?.querySelector` against `from`, yielding a function.
- That function would be converted to a string (e.g., `"function querySelector() { [native code] }"`) and substituted into the path.
- The result would be garbage.

So we cannot simply reinterpret `aka` without a migration path.

### Options to avoid breaking `aka`

1. **Add a sibling option.** Keep `aka` as segment aliases, and add `substitutions` (or `akaValues` / `fromSubstitutions`) with the same shape but value-substitution semantics. This is the safest choice.

2. **Infer intent from the value shape.** For example, treat `aka` values that start with `?.` as value-substitution paths, and values that do not as segment aliases. This keeps the same option but creates a brittle rule. I would avoid it.

3. **Keep `aka` and add a new interpolation syntax.** Go back to `#{}` / `${}` inside the rhs strings, leaving `aka` untouched. The user-visible difference is where the substitution is declared (inside the string vs. in the options object).

My preference is **option 1**: a new `substitutions` option. It preserves backward compatibility and makes the intent explicit.

### New ambiguities this approach introduces

Even with a new option, the same questions need answers:

1. **Allowed result types.** You already said throw if the evaluated path is not a string. I agree. Numbers and booleans might serialize into valid path arguments in some cases, but for Phase I I would restrict it to strings only to keep the mental model simple.

2. **Injection via `?.` in the substituted value.** If the string value comes from user input or an untrusted source and contains `?.`, it can split the path and change the parse structure. For example, if `inertTarget = 'a?.b'`, substitution yields `?.querySelectorAll?.a?.b`, which calls `querySelectorAll('a')` and then accesses `.b` on the result. This is a path-injection risk. Phase I should either:
   - Escape `?.` in the substituted value, or
   - Throw if the substituted string contains `?.`.

3. **Method-name collisions.** If a substituted string happens to match a method in `withMethods`, the parser will try to call it as a method on the previous value. For example, if `inertTarget = 'querySelectorAll'`, the rhs becomes `?.ownerDocument?.querySelectorAll?.querySelectorAll`, which calls `ownerDocument.querySelectorAll('querySelectorAll')`. This is probably what the user wanted if the value is a selector string, but it shows that the substitution target is being treated as a path segment/argument, not an opaque value.

4. **Alias cycles.** If `substitutions: { a: '?.b', b: '?.a' }`, resolving `a` requires resolving `b`, which requires resolving `a`. The implementation needs a cycle detector or a recursion limit.

5. **Source for substitution evaluation.** You said `from` only for Phase I. Agreed. For Phase II, if the value path can be evaluated against `target`, we would need a clear marker such as `$0` (which already means "root" in the path syntax) or a separate source key.

6. **Caching.** `resolve/getValues.ts` caches parsed paths with `pathCache`. Once a path contains a substituted value, the same string can produce different paths on different calls, so substituted paths should not be cached or should be cached per resolved-value snapshot.

### Verdict

The `aka`-style approach is viable and arguably cleaner than string interpolation because the substitutions are declared up front in the options object. However, I would implement it as a new option rather than reusing `aka`, because the semantics are genuinely different and silently changing `aka` would be a breaking, hard-to-debug surprise for existing code.

If you want, I can sketch what the implementation would look like in `resolve/getValues.ts` using a new `substitutions` option.

## Bruce's Response - Impact?

Okay, you convinced me to go with substitutions.  This will substitute both in the lhs and the rhs, correct?

No need to sketch what the implementation would look like.  Is it reasonably low impact to add this support?  Do you have enough to go on to implement?

## Kimi's Response

I have enough to implement rhs substitutions for Phase I. Before I start, I want to clarify the lhs question.

### RHS vs LHS substitution

I would **start with rhs only** for Phase I.

- **RHS substitution** is straightforward. The path string is already resolved through `getValues` / `getValue`, so adding a pre-pass that evaluates `substitutions` and replaces names in the string is a localized change.
- **LHS substitution** (the keys of the pattern object) is a different feature. The keys are used earlier in `assignFrom` to categorize assignments (`handlerKeys`, `normalPattern`, `idRefNormalKeys`, `ternaryKeys`, etc.). If the keys themselves can contain substitutions, we have to resolve them *before* categorization, and the mapping from pattern key to target property name becomes dynamic. That touches the top-level `assignFrom` flow, not just `getValues`.

If you have a concrete use case for lhs substitution, I'm happy to include it, but I would treat it as a separate phase. Do you need it now, or is rhs enough?

### Impact estimate for RHS-only Phase I

Low-to-moderate impact:

1. **Add `substitutions?: Record<string, string>` to `AssignFromOptions`.**
2. **Resolve substitution paths against `from`.** This reuses the existing `getValue` machinery, with a cycle guard.
3. **Replace substitution names in rhs strings.** Same approach as `applyAliases` in `resolve/getValues.ts` — split on `?.`, replace whole segments, rejoin.
4. **Validation.** Throw if a substitution path does not resolve to a string. Throw on cycles. Throw if a substitution name is not defined.
5. **Caching adjustment.** Paths containing substitutions should not be cached, or should be cached per resolved-value snapshot.
6. **Update types** in `types/assign-gingerly/types.d.ts`.

No changes to the core path parser or the `?.` syntax.

### Open questions before I implement

1. **LHS substitution needed?** Yes or no.
2. **Substituted value validation.** I propose: throw unless the resolved value is a string. Agreed?
3. **`?.` injection guard.** If the substituted string contains `?.`, it can alter the path structure. I propose throwing or escaping. Agreed?
4. **Where substitutions are applied.** Should they apply only to string rhs values, or also inside nested arrays/objects, protocols, `$0` paths, etc.? I recommend: anywhere `getValues` resolves a path string, including arrays and `$0`, but *not* inside object keys.
5. **Option name.** `substitutions`? Or do you prefer `substitutionPaths`, `akaValues`, `fromSubstitutions`? I like `substitutions` for brevity.

Let me know on those and I'll implement rhs Phase I.

## Bruce's Response - Answers

> 1. **LHS substitution needed?**

No

> 2. **Substituted value validation.**

Agreed.

> 3. **`?.` injection guard.**

Agreed.

> 4. **Where substitutions are applied.** 

I agree with your recommendation

> 5. **Option name.**

substitutions it is.

Please proceed and provide implementation notes below.

## Implementation Notes

Implemented RHS-only `substitutions` support. Summary of changes:

### API

```javascript
assignFrom(target, {
    inertTargetElements: '?.ownerDocument?.querySelectorAll?.inertTarget'
}, {
    from: myCustomElement,
    withMethods: ['querySelectorAll'],
    substitutions: {
        inertTarget: '?.inertTarget'
    }
})
```

- `substitutions` maps a placeholder name to a `?.`-delimited path.
- The path is resolved against `from` and the resulting string value replaces any matching whole path segment before the path is parsed.
- Substitution values must be strings and must not contain `?.` (throws otherwise).
- Substitutions are applied before aliases, so `aka` can further transform the resulting path segments.

### Files changed

1. `types/assign-gingerly/types.d.ts`
   - Added `substitutions?: Record<string, string>` to `IAssignGingerlyOptions` and `AssignFromOptions`.

2. `resolve/getValues.ts`
   - Added `applySubstitutions(path, substitutionMap?)` — segment-level replacement.
   - Added `resolveSubstitutions(substitutions, source, options)` — resolves each substitution path against `from`, validates string/type, and returns a `Map`.
   - Wired substitutions into `getValues`, `getValue`, and `getArray` so they apply to `?.` paths, `$0` paths, protocol path suffixes, and nested arrays.

3. `assignFrom.ts`
   - Passed `substitutions` through in `resolveTernaryValue`, `processIdRefNormalKeys`, and the `#[x]` pre-resolution path.

4. `assignFromAsync.ts`
   - Passed `substitutions` through in `resolveValues` calls for normal keys and `#[x]` keys.

5. `processHandlerCommands.ts`
   - Passed `substitutions` through in `getValues`/`resolveValues` calls for handler `get`/`resolve` maps.

6. `tests/substitutions.spec.ts` and `tests/substitutions.html`
   - Added 10 browser tests covering method arguments, property names, arrays, `assignFrom`, `$0` root refs, async `resolveValues`, and error cases.

### Validation

- `npx tsc` compiles without errors.
- Full Playwright suite passes (102 tests across Chromium, Firefox, and WebKit).

### Caching note

Substituted paths are cached by their final substituted string, not the original template string. If substitution values change frequently, this can grow `pathCache`. If this becomes an issue in practice, we can add a per-call cache bypass for strings containing substitution placeholders.



