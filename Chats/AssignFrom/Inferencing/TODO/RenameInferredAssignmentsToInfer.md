# Rename inferredAssignments to infer

In [ByName](../ByName.md) you suggested a smaller name.  I think it reads nicely:

```ts
assignFrom(form, {}, {
    from: vm,
    infer: { '|': ['user'], '@': ['firstName'] }
});
```

Don't worry at all about backwards compatibility.  I think the context is clear enough.  If you agree, please update the name, including code, unit tests, documentation.  If there's a titled called "Inferred Assignments" in the documentation, maybe leave that as is.


---

## Implementation Notes

Renamed `inferredAssignments` → `infer` across the codebase:

**Code files updated:**
- `assignFromAsync.ts` / `.js` — interface field + usage
- `assignFrom.ts` / `.js` — usage
- `handlers/manageTemplateList.ts` / `.js` — fast-path detection + JSDoc
- `inferredAssignments.ts` / `.js` — interface updated (internal function name `processInferredAssignments` kept as-is since it's not public API)

**Documentation updated:**
- `README.md` — all 3 occurrences
- `docs/inferred-assignments.md` — all occurrences
- `docs/manage-template-list.md` — all occurrences
- `demos/js-framework-benchmark.html` — commented example

**Tests:** All passing (no test files used `inferredAssignments` directly in their assertions — they test through the HTML pages which import the JS modules).

**Section titles left as "Inferred Assignments"** per request — only the option key changed.
