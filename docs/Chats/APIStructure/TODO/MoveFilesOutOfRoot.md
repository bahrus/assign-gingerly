# Move Files Out Of Root

## Bruce's Ask

I'd like to move some files out of the root folder so that the top level folder is a little less filled with miscellaneous files.

A clear candiddate is moving markerUtils.ts to the utils folder.

Other candidates are beVigilant, handleIshProperty.  Any other suggestions?

## Claude's Response

### Done

Moved into `utils/` with `git mv`, so file history follows:

| File | Importers updated |
|---|---|
| `markerUtils.ts` | `index.ts`, `handlers/lazyLoad.ts`, `handlers/manageTemplateList.ts`, `handlers/scope.ts`, `handlers/tree.ts` |
| `beVigilant.ts` | `assignFrom.ts`, `assignFromAsync.ts` (dynamic `import()`) |
| `handleIshProperty.ts` | `assignGingerly.ts` (dynamic `import()`), `handlers/scope.ts`, `handlers/tree.ts` |

The relative imports inside the moved files were fixed too. That includes the dynamic `import('./utils/waitForEvent.js')` in `handleIshProperty.ts`, which is now `import('./waitForEvent.js')`.

**Backward compatibility.** `be-switched` imports `assign-gingerly/markerUtils.js`. The old `./markerUtils.js` and `./beVigilant.js` entries in the package.json `exports` map still exist and now point to the `utils/` files, so nothing downstream breaks. I added new `./utils/markerUtils.js` and `./utils/beVigilant.js` entries alongside them. You can drop the old aliases at a future breaking version. `handleIshProperty` was never exported, so it needed no alias.

The sibling repos (gingerly-tree, navigate-gingerly, o2h, …) don't import any of the three files directly.

`tsc --noEmit` is clean. All 67 Playwright tests pass on Chromium.

### More suggestions

**Leave at the root:** the public entry points that README examples and consumers import by name: `index`, `assignGingerly`, `assignTentatively`, `assignFrom`, `assignFromAsync`, `assignFrom-extension`, `assignFromAsync-extension`, `object-extension`, `assignFeatures`, `defineWithFeatures`, `buildCSSQuery`, and the two `playwright*.config.ts` files (tooling expects them at the root).

**Can move freely. They're internal only and not in `exports`:**

| File | Only importer | Suggested home |
|---|---|---|
| `eachTime.ts` | `assignGingerly.ts` | `utils/` |
| `processHandlerCommands.ts` | `assignFrom.ts` | `handlers/` (it dispatches handler commands) or `utils/` |

**Can move, but each needs a back-compat `exports` alias (as above):**

| File | Used by | Suggested home |
|---|---|---|
| `evaluatePathWithAsyncMethods.ts` | `assignGingerly.ts` | `utils/` or `resolve/` (it's path evaluation, so it fits beside `resolveLhsPath`/`getValues`) |
| `enhanceAll.ts` | `assignFrom`, `assignFromAsync`, `assignGingerly` | `utils/` |
| `inferredAssignments.ts` | `assignFrom`, `assignFromAsync`, `manageTemplateList` | `inferencer/` is a submodule, so `utils/` instead |
| `transitionHelper.ts` | `handlers/lazyLoad.ts` | `utils/` |
| `getHost.ts` | `index.ts` | `resolve/` or `utils/`. It's re-exported from `index`, so few people would deep-import it |

**A new `parsers/` folder** for the attribute-parsing cluster: `parseWithAttrs.ts`, `parserRegistry.ts`, `ScopedParserRegistry.ts`, `SplitParser.ts`. They only import each other. The catch: `parseWithAttrs.js` appears in many `tests/` and `wpt/` HTML files and in README examples, so this is the most churn for the least gain. Moving just the three registry/parser helpers and keeping `parseWithAttrs.ts` at the root would be a cheaper middle ground.

Making all of the moves above would leave 11 `.ts` files at the root instead of 25.

### Unrelated issues I noticed

- The package.json export `"./installForwarding.js"` points to `./installForwarding.ts/.js` at the root, but the file lives in `DX/installForwarding.ts`. That subpath is currently broken for consumers.
- The `"./parserRegistry.js"` export has no `types` entry, unlike the others.


