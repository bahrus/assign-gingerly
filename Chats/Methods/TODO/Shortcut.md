# Method / Aliasing Shortcut

---

## Human Ask

This pattern will appear frequently:

```JS
{
    from: this, /* this is the Source */
    withMethods: ['querySelector'],
    aka: {'🔍', 'querySelector'}
}
```

It would be nice to reduce the verbosity:

```JS
{
    from: this, /* this is the Source */
    akaMethods: {'🔍', 'querySelector'},
}
```

This is additive, not replacing anything.

---

## Git-committable note from GitHub Copilot

I like this shorthand. It feels like a good additive convenience layer that can be implemented by expanding `akaMethods` into the existing `withMethods` + `aka` behavior rather than introducing a separate execution path.

Proposed semantics:
- `akaMethods` should be treated as a shorthand for "bind these methods from the source and expose them under these aliases".
- The most natural form is a mapping from alias to method name, for example `akaMethods: { '🔍': 'querySelector' }`.
- It should remain fully additive: existing `withMethods` and `aka` continue to work unchanged, and `akaMethods` simply provides a more compact spelling.

Suggested implementation direction:
- Normalize `akaMethods` into the existing internal representation during option processing.
- Keep the public API backward-compatible and avoid any behavior change for callers using the current verbose form.

---

## Human Response I

Do you have everything you need to implement this?  What does the implementation sketch look like?

---

## Git-committable note from GitHub Copilot

Yes, the shape is clear enough to sketch. The implementation can stay very small and local:

1. During option normalization, detect `akaMethods`.
2. Convert each entry from the shorthand mapping into the existing internal form used by `withMethods` plus `aka`.
3. Preserve the current semantics for `withMethods` and `aka`, so this is strictly additive.

Conceptually:

```JS
function normalizeAliasMethodOptions(options) {
  const { akaMethods, withMethods = [], aka = [] } = options;

  if (akaMethods) {
    for (const [alias, methodName] of Object.entries(akaMethods)) {
      withMethods.push(methodName);
      aka.push(alias);
    }
  }

  return { ...options, withMethods, aka };
}
```

The main design choice is whether `akaMethods` should accept a plain array of method names, or only a mapping from alias to method name. The mapping form is the more explicit and least ambiguous choice, so I would favor that.

---

## Human Response II

Looks good, and I agree, stick to the mapping form only.  Please proceed with implementation.

---

## Git-committable note from GitHub Copilot

That direction is reasonable. I would implement this as an additive normalization step in the existing option-processing path, with no new runtime semantics beyond translating the shorthand into the established `withMethods` + `aka` form.

Implementation sketch:
- Add a small normalization branch that recognizes `akaMethods` when parsing assignment options.
- For each entry in the mapping, append the method name to the internal `withMethods` list and the alias to the internal `aka` list.
- Leave all existing behavior intact for the legacy verbose form.
- If the library already has a dedicated option-normalization helper, place the conversion there so the rest of the pipeline stays unchanged.

This keeps the change narrow, easy to test, and fully backward-compatible.

---

## Implementation Notes

I’m locating the existing option-processing path for method aliasing so I can implement the shorthand cleanly and verify it with tests.

Searched for regex `withMethods|akaMethods|aka\s*:` (`**/{*.ts,*.js,tests/**}`), 300 results

Read [](file:///c%3A/git/binding/assign-gingerly/package.json)

The implementation point is in the shared option normalization path, and I’m reading the relevant modules and tests before I wire the new shorthand in.

Read [](file:///c%3A/git/binding/assign-gingerly/assignGingerly.ts#1-1), lines 1 to 220

Read [](file:///c%3A/git/binding/assign-gingerly/getValues.ts#1-1), lines 1 to 260

Read [](file:///c%3A/git/binding/assign-gingerly/assignFrom.ts#1-1), lines 1 to 220

Read [](file:///c%3A/git/binding/assign-gingerly/types/assign-gingerly/types.d.ts#220-220), lines 220 to 320

The core user-facing types are clear, and I’m wiring the shorthand through the shared normalization layer rather than scattering it through each caller.

Read [](file:///c%3A/git/binding/assign-gingerly/assignGingerly.ts#720-720), lines 720 to 860

Read [](file:///c%3A/git/binding/assign-gingerly/tsconfig.json)

Read [](file:///c%3A/git/binding/assign-gingerly/resolveValues.ts)

Read [](file:///c%3A/git/binding/assign-gingerly/tests/aliasing.html#1-1), lines 1 to 260

Read [](file:///c%3A/git/binding/assign-gingerly/tests/aliasing.html#260-260), lines 260 to 335

Searched for regex `interface GetValuesOptions|interface ResolveValuesOptions|type GetValuesOptions|type ResolveValuesOptions` (`**/types/**/*.d.ts`), 4 results

Read [](file:///c%3A/git/binding/assign-gingerly/types/assign-gingerly/types.d.ts#340-340), lines 340 to 430

Read [](file:///c%3A/git/binding/assign-gingerly/tests/with-methods.spec.ts)

Searched for text `aliasing\.html|Aliasing Tests|aliasing` (`**/tests/**`), 5 results

Read [](file:///c%3A/git/binding/assign-gingerly/tests/aliasing.spec.ts)

I’ve isolated the shared path and am adding a regression test first so the new shorthand is exercised before the implementation is finalized.

Read [](file:///c%3A/git/binding/assign-gingerly/playwright.config.ts)

I’m introducing a small browser regression test for the shorthand so I can verify the behavior before and after the change.

Replacing 23 lines with 44 lines in [](file:///c%3A/git/binding/assign-gingerly/tests/aliasing.html)


```

```


Ran terminal command: npx playwright test tests/aliasing.spec.ts --project=chromium
Completed with input: npx playwright test tests/aliasing.spec.ts --project=chromium

Searched for regex `withMethods: options\.withMethods|aka: options\.aka|akaMethods` (`**/{assignFrom*.ts,assignFrom*.js,getValues.ts,getValues.js,resolveValues.ts,resolveValues.js,assignGingerly.ts,assignGingerly.js,paths.ts,paths.js}`), 24 results

Read [](file:///c%3A/git/binding/assign-gingerly/getValues.ts#260-260), lines 260 to 293

Read [](file:///c%3A/git/binding/assign-gingerly/assignFrom.ts#300-300), lines 300 to 440

Read [](file:///c%3A/git/binding/assign-gingerly/assignFromAsync.ts#1-1), lines 1 to 140

Read [](file:///c%3A/git/binding/assign-gingerly/getValues.js#1-1), lines 1 to 260

Read [](file:///c%3A/git/binding/assign-gingerly/assignGingerly.js#1-1), lines 1 to 220

Read [](file:///c%3A/git/binding/assign-gingerly/processHandlerCommands.ts#130-130), lines 130 to 190

The failing test confirms the feature is not yet recognized, and I’m now updating the shared option normalization so the shorthand feeds the existing alias engine everywhere it’s used.

Replacing 116 lines with 136 lines in [](file:///c%3A/git/binding/assign-gingerly/getValues.ts), [](file:///c%3A/git/binding/assign-gingerly/assignGingerly.ts), [](file:///c%3A/git/binding/assign-gingerly/assignFrom.ts), [](file:///c%3A/git/binding/assign-gingerly/assignFromAsync.ts), [](file:///c%3A/git/binding/assign-gingerly/types/assign-gingerly/types.d.ts)


```

```

```

```

```

```

```

```

```

```


Read [](file:///c%3A/git/binding/assign-gingerly/getValues.ts#1-1), lines 1 to 120

Read [](file:///c%3A/git/binding/assign-gingerly/assignGingerly.ts#1-1), lines 1 to 130

Read [](file:///c%3A/git/binding/assign-gingerly/assignGingerly.ts#748-748), lines 748 to 830

Read [](file:///c%3A/git/binding/assign-gingerly/assignFrom.ts#320-320), lines 320 to 430

Read [](file:///c%3A/git/binding/assign-gingerly/assignFromAsync.ts#60-60), lines 60 to 125

Read [](file:///c%3A/git/binding/assign-gingerly/types/assign-gingerly/types.d.ts#240-240), lines 240 to 290

The normalization branch is in place; I’m tightening it so it also covers the no-existing-withMethods case and syncing the runtime JavaScript files used by the browser tests.

Replacing 93 lines with 94 lines in [](file:///c%3A/git/binding/assign-gingerly/getValues.ts), [](file:///c%3A/git/binding/assign-gingerly/getValues.js), [](file:///c%3A/git/binding/assign-gingerly/assignGingerly.js), [](file:///c%3A/git/binding/assign-gingerly/assignFrom.js), [](file:///c%3A/git/binding/assign-gingerly/assignFromAsync.js)


```

```

```

```


Read [](file:///c%3A/git/binding/assign-gingerly/getValues.js#1-1), lines 1 to 220

Read [](file:///c%3A/git/binding/assign-gingerly/getValues.js#220-220), lines 220 to 279

Searched for text `akaMethods` (`**/{assignGingerly.js,assignFrom.js,assignFromAsync.js,resolveValues.js,resolveValues.ts,getValues.js,getValues.ts,assignGingerly.ts,assignFrom.ts,assignFromAsync.ts,types/assign-gingerly/types.d.ts}`), 25 results

The shorthand is now flowing through the shared resolver and the main assignment path; I’m running the browser test again to confirm the regression is green.

Ran terminal command: npx playwright test tests/aliasing.spec.ts --project=chromium

The regression is passing, and I’m also checking the broader suite for any spillover before I hand this over.

Ran terminal command: npx playwright test tests/with-methods.spec.ts --project=chromium

Implemented support for the new shorthand option and verified it end to end.

### What changed
- Added support for an additive option named akaMethods in the shared normalization path.
- It now:
  - maps aliases to method names,
  - feeds the existing alias engine for path substitution,
  - and automatically registers the target method names in the method-call set.
- Wired the support through the main assignment flow and the value-resolution helpers used by assignFrom and assignFromAsync.
- Added a browser regression test covering the new shorthand.

### Files updated
- getValues.ts
- assignGingerly.ts
- assignFrom.ts
- assignFromAsync.ts
- types.d.ts
- aliasing.html

### Verification
I verified this with fresh test runs:
- Aliasing suite: 16/16 passed
- WithMethods suite: 16/16 passed

If you want, I can also add a short note to the README/docs describing the new shorthand.

Made changes.