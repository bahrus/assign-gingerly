# Remove Itemscope Tree

## Bruce's Ask

In my mind, the Tree Handler is a much more intuitive and better organized handler for accomplishing much the same thing as the ItemscopeTree.  I don't see a reason to hold on to ItemscopeTree now, because no one is using it and it is just making the package more complicated that it needs to be.

Do you agree, or do you see a benefit to hanging on to the handle at least a little bit longer?

If you agree, please remove and add your implementation notes below.  If the latter, please state what reasons there are for holding on to it at least for a little bit.

## Claude's Response

**I agree, and it's removed.** Tree now covers everything ItemscopeTree did that we'd want to keep:

| ItemscopeTree feature | Tree equivalent |
|---|---|
| Pair VM keys with managers (`map`) | `{ tag, ish }` headers (class or registered name) |
| Manager per element via `ish` | Same `defineIshCore` machinery, plus `ctx.rebind()` and async `onAssigned` |
| Static `instantiate` creating the element | Declarative element specs, so managers no longer build DOM (the DX pain point that started all this) |
| Idempotent re-run (skip existing) | Full **rebinding** in place, which ItemscopeTree never had |

**What's actually lost:**
- **Microdata attributes** (`itemscope` / `itemprop`). Tree left these out on purpose. If they're ever needed, the TreeScope idea (or an opt-in in Tree) is the place for them.
- **The `<Key>ISM` naming convention**, which looks up managers implicitly by key name. Tree's explicit `map` is clearer.

Neither is a reason to keep a second, overlapping handler around, especially with no users.

### What was removed

| File | |
|---|---|
| `handlers/itemscopeTree.ts` | Deleted |
| `handlers/itemscopeTree.js` | Deleted. It's generated, but it's **orphaned build output**: `tsc` never deletes it, and `handlers/**` would still ship it in the npm package. This is the only `.js` I touched. |
| `tests/itemscope-tree.html`, `tests/itemscope-tree.spec.ts` | Deleted |
| `docs/itemscope-tree.md` | Deleted |
| `demos/itemscope-tree-demo.html` | Deleted |

### What was updated

| File | Change |
|---|---|
| `processHandlerCommands.ts` | Removed the `builtIns.itemscopeTree` entry from `BUILT_IN_MAP` |
| `DX/emojis.ts` | Removed the `🌳` alias (`🌲` → `builtIns.tree` stays) |
| `tsconfig.json` | Removed the `handlers/itemscopeTree.ts` include |
| `types/assign-gingerly/types.d.ts` | Removed `ItemscopeTreeConfig` and `ItemscopeTreeContext`. Removed `instantiate` and `static itemscope` from `ItemscopeManager`; `static is` is now the one explicit-name hook. |
| `handlers/tree.ts`, `treeTypes.d.ts`, `docs/tree.md` | Class names now resolve as `Class.is ?? Class.name`, dropping the `itemscope` fallback |
| `handleIshProperty.ts` | Doc comment: `defineIshCore` is used by Tree only |
| `README.md` | Replaced the `builtIns.itemscopeTree` section with a short `builtIns.tree` section (there wasn't one), linking to `docs/tree.md`, pipes, root references and the demo |
| `docs/tree.md`, `demos/tree-demo.html` | Removed the "compared to itemscopeTree" framing and the link to the deleted demo |
| `demos/data/launch.json` | The fictional `details` text now says it demonstrates `builtIns.tree` |
| `AGENTS.md` | The named-context example now points at `IshManagerContext` instead of `ItemscopeTreeContext` |

### Left alone

- **Chat history** under `Chats/` (including this folder): it's the design record.
- **`inferencer/types/assign-gingerly/types.d.ts`**: it's a separate submodule with its own copy of the types, and it still mentions ItemscopeTree. Updating it is up to that submodule.
- **Generated `.js` for the edited modules** (`processHandlerCommands.js`, `DX/emojis.js`, `handleIshProperty.js`, `handlers/tree.js`) is stale until you rebuild. Your `tsc --watch` wasn't running.

### Verified

- `tsc` is clean, in a fresh scratch copy of the repo.
- **Full suite: 120 passed, 0 failed** in Chromium, Firefox and WebKit. That's the previous 123 minus the 3 itemscopeTree specs (one per browser).
- No references to `itemscopeTree`, `ItemscopeTreeContext`, `ItemscopeTreeConfig` or the `🌳` alias remain outside `Chats/` and the `inferencer` submodule.