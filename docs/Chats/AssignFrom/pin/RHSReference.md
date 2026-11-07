# RHS Reference to dynamic ids

---

## Human Ask

Maybe this is already supported, but I suspect not:

```html
<form id=oForm>
    <label>My Label</label>
    <input>
</form>
```

```JS
assignFrom(oForm, {
    '?.querySelector?.label?.for': '#[x]'
}, {
    ...
    withIds: {
        x: {
            qry: 'input'
        }
    },
    withMethods: ['querySelector']
})
```

I'm flexible with what the best syntax would be, or if an alternative approach would be better

---

## AI Response

You're right — this is **not currently supported**. `#[x]` on the RHS is treated as a plain literal string by `getValues`. Only LHS keys are checked for the `#[` prefix.

### The use case

You want to:
1. Resolve an element via `withIds` (find the `<input>` via `querySelector('input')`)
2. Ensure it has an ID (auto-generate if needed)
3. Use that ID *as a value* — assign it to another element's property (`label.htmlFor`)

This is a legitimate accessibility pattern (`<label for="inputId">`) and comes up whenever you need to cross-reference elements by ID.

### Current workaround

Today you'd have to do this imperatively:

```JS
const input = form.querySelector('input');
if (!input.id) input.id = generateId();
label.htmlFor = input.id;
```

Or break it into two calls — first to ensure the element is cached and has an ID, then manually reference it. Clunky.

### Syntax options

**Option A: `#[x]` on RHS means "the ID string of that cached element"**

```JS
assignFrom(oForm, {
    '?.querySelector?.label?.htmlFor': '#[x]'
}, { withIds: { x: { qry: 'input' } }, withMethods: ['querySelector'] })
```

Pros:
- Minimal new syntax — reuses the same `#[x]` notation
- The semantic is clear: on LHS, `#[x]` is the element itself (as a navigation anchor); on RHS, `#[x]` is the element's ID string (the useful *value* you'd want to assign)
- Consistent mental model: "withIds resolves elements and ensures they have IDs; `#[x]` references that"

Cons:
- What if you want the *element* itself as the RHS value (not the ID)? That's a less common use case for assignFrom, but it exists (e.g., assigning an element to a JS property)

**Option B: `#[x].id` — explicit property access**

```JS
assignFrom(oForm, {
    '?.querySelector?.label?.htmlFor': '#[x].id'
}, { ... })
```

More explicit — you're saying "give me the `id` property of the element at #[x]." This also opens the door to `#[x].className`, `#[x].textContent`, etc.

Cons:
- More to type for the 90% case (you almost always want `.id`)
- The `.` notation after `#[x]` is a new parsing concept

**Option C: `#[x]` means element, `#[x].id` or `id://x` for the ID**

A protocol-based approach:

```JS
assignFrom(oForm, {
    '?.querySelector?.label?.htmlFor': 'id://x'
}, { withIds: { x: { qry: 'input' } }, ... })
```

Leverages existing protocol resolution. But it's heavier than needed and introduces protocol dependency for a simple reference.

### My recommendation: Option A

`#[x]` on the RHS should resolve to the **ID string** of the cached element. Reasoning:

1. **The primary use case for withIds is ID-based** — the whole point is caching elements by their auto-assigned IDs. Returning the ID string on the RHS is the natural complement.

2. **If you need the element itself**, you'd already be navigating to it with `#[x]` on the LHS — you don't typically assign an element *as a value* through assignFrom.

3. **Implementation is tiny** — in `getValues` or in `assignFrom`'s normal-key processing, check if a string value starts with `#[` and `withIds` is present. If so, resolve the element, ensure it has an ID, return the ID string. ~5-10 lines.

4. **Path chaining after `#[x]`** could be a future extension (`#[x]?.dataset?.name`) if the need arises, but for now the ID string covers the primary use case.

### Implementation sketch

In `assignFrom`'s normal key processing (before passing to `getValues`), scan RHS string values for `#[...]` patterns and resolve them:

```TS
// In the normal pattern resolution step:
for (const [key, value] of Object.entries(normalPattern)) {
    if (typeof value === 'string' && value.startsWith('#[') && value.endsWith(']') && options.withIds) {
        const varName = value.substring(2, value.length - 1);
        const el = resolveIdVariable(varName, target, options.withIds);
        if (el) {
            normalPattern[key] = el.id;  // resolved to the ID string
        }
    }
}
```

This runs before `getValues`, so the resolved ID string flows through the normal assignment path.


---

## Human Response I

>  The `.` notation after `#[x]` is a new parsing concept

What about:

```JS
assignFrom(oForm, {
    '?.querySelector?.label?.htmlFor': '#[x]?.id'
}, { ... })
```

?

Would that keep the implementation to a minimum?  Would that affect your ranking?

---

## AI Response II

This is actually better than my Option A. Let me explain why.

### Why `#[x]?.id` is the best syntax

1. **Reuses existing path resolution** — The `?.` notation is already the core navigation mechanism throughout the library. After resolving `#[x]` to an element, the remaining `?.id` is just standard path traversal. No new parsing concepts.

2. **Generalizes naturally** — You get `#[x]?.id` for free, but you also get:
   - `#[x]?.className` — the element's class
   - `#[x]?.dataset?.userId` — a data attribute
   - `#[x]?.textContent` — its text
   - `#[x]?.offsetWidth` — a computed measurement
   
   No special-casing needed. The element is the "source" and `?.` navigates from there.

3. **Consistent with LHS** — On the LHS, `#[x]?.textContent` means "navigate to x, then to textContent." On the RHS, the same syntax means "resolve x, then read textContent from it." Same mental model, both sides.

4. **Implementation is minimal** — The logic is:
   - Detect RHS strings starting with `#[`
   - Extract varName (up to `]`)
   - Resolve the element via `resolveIdVariable`
   - If there's a remaining `?.` path after `]`, navigate it on the resolved element
   - Return the final value

```TS
if (typeof value === 'string' && value.startsWith('#[') && options.withIds) {
    const closeIdx = value.indexOf(']');
    if (closeIdx !== -1) {
        const varName = value.substring(2, closeIdx);
        const el = resolveIdVariable(varName, target, options.withIds);
        if (el) {
            const remainingPath = value.substring(closeIdx + 1); // e.g., '?.id'
            if (remainingPath) {
                normalPattern[key] = getValue(remainingPath, el, options);
            } else {
                normalPattern[key] = el.id; // bare #[x] → ID string (convenience default)
            }
        }
    }
}
```

5. **Bare `#[x]` still works as a convenience** — When there's no `?.` suffix, it defaults to the ID string (the 90% case). `#[x]?.id` is the explicit form of the same thing. This means you don't lose the simple syntax for the common case.

### Updated ranking

```
#[x]?.prop  — best: reuses existing ?. navigation, generalizes, minimal impl
#[x]        — good convenience shorthand (implicit ?.id)
#[x].prop   — new dot notation concept, unnecessary given ?. exists
id://x      — overkill
```

Yes, this bumps `#[x]?.prop` to #1 and makes the bare `#[x]` → ID a nice shorthand default rather than the only option. The implementation cost is essentially the same either way — you're just checking whether there's a remaining path after `]` and, if so, passing it through `getValue`.

---

## Human Response II

I agree.  Please implement.

---

## AI Response III

Done. Implemented RHS `#[x]` resolution in `assignFrom.ts` / `assignFrom.js`.

**Behavior:**
- `'#[x]'` (bare) → resolves to the element's ID string (auto-generates if needed)
- `'#[x]?.id'` → explicit ID access (same result as bare)
- `'#[x]?.type'` → reads any property from the resolved element
- `'#[x]?.dataset?.user'` → nested path navigation works via `getValue`

**Implementation:** ~15 lines in the normal-key processing path, runs before `getValues`. Checks if RHS starts with `#[`, resolves the element via `resolveIdVariable`, then navigates any remaining `?.` path.

**Tests:** 10/10 passing across Chromium, Firefox, WebKit. All existing tests still pass.

---

## Human Response III

Can you mention this feature in README.md?

## Implementation Notes

I'll add the RHS reference documentation right before the "Key behaviors" section:

Done. Added a concise section documenting the RHS `#[x]` feature within the existing "Cached Element Resolution" section of the README — shows bare `#[x]` for ID strings, `#[x]?.type` for property access, and `#[x]?.dataset?.user` for nested paths, with a note about the accessibility use case.