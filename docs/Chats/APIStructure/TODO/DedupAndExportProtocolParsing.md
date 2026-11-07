# Dedup And Export Protocol Parsing

## Bruce's Ask

In chatting with Claude how the integration of assign-gingerly's getValues and resolveValues could more easily integrate with [fifteenth](https://github.com/bahrus/fifteenth) Claude made some reasonable [sounding recommendations](https://github.com/bahrus/fifteenth/blob/baseline/Chats/Strategy.md#claudes-response-re-exportable-primitives)

I really don't like exercises like this discovering duplicates blocks of code.  Can you please consolidate all the common methods between getValues and resolveValues?  resolveValues is already importing getValues, so I think rather than creating a common module they both share, it would be fine to consolidate them into getValues.js module.  I guess the argument in favor of a common separate module is what if users of the fifteenth package don't use the getValues function.  But I think realistically, they will. 

I will defer to your judgment on that, but those are my thoughts.

If any clarifications are needed, please list them below.  Otherwise, please implement and add your implementation notes below.

## Claude's Implementation Notes

### Decision on where the shared code lives

Consolidated into `resolve/getValues.js` (your preferred option), not a new shared
module. `resolveValues` already imports from `getValues`, and any realistic
consumer of the async path also has the sync path in the bundle. The extracted
helpers are all **exported**, which simultaneously satisfies the
[fifteenth "exportable primitives" ask](https://github.com/bahrus/fifteenth/blob/baseline/Chats/Strategy.md#claudes-response-re-exportable-primitives)
(items 1, 2, and 4) — fifteenth can now delete its `parse.ts` copy.

### What was actually duplicated (and is now not)

| Duplicated thing | Before | After |
|---|---|---|
| `hasProtocol(value)` | byte-identical copy in each file | one exported fn in `getValues.ts`; `resolveValues.ts` imports it |
| Protocol string parsing (`://` split, key/`?.` split) | ~8 lines inline in both `getProtocolValue` (sync) and `resolveProtocolValue` (async) | one exported `parseProtocolRef(value): ParsedProtocolRef`; both resolvers call it |
| "is this a plain object" prototype check | 4 copies (`getValues`, `getArray`, `resolveValues`, `resolveArray`) | one exported `isPlainObject(value)`; all 4 call sites use it |

### New exports

From `resolve/getValues.js` (and re-exported from `index.js`, and re-exported
from `resolve/resolveValues.js` for the deep-import entry point):

- `hasProtocol(value: string): boolean`
- `parseProtocolRef(value: string): ParsedProtocolRef` — pure outer-grammar
  tokenizer, no handler lookup / no resolution. `{ protocol, key, path }`;
  `protocol` is `''` and `path` is `null` when there is no `://`.
- `isPlainObject(value: any): boolean`

New types in `types/assign-gingerly/types.d.ts`:

- `ProtocolHandler = (key: string) => any | Promise<any>`
- `SyncProtocolHandler = (key: string) => any`
- `ProtocolHandlers` / `SyncProtocolHandlers` (the `Record<string, …>` maps)
- `ParsedProtocolRef { protocol: string; key: string; path: string | null }`

`GetValuesOptions.protocols`, `ResolveValuesOptions.protocols`, and
`AssignFromOptions.protocols` now reference these named types instead of inline
`Record<string, …>` literals. No shape change.

### What was deliberately NOT merged

The pattern-object walk (`getValues` vs `resolveValues`) and the array walk
(`getArray` vs `resolveArray`) look parallel but differ in every branch by
sync-vs-`await` control flow, and their string branches have genuinely different
semantics (`getValues` runs the full `resolveStringValue` pipeline —
`!`-negation, `looksLikeReference`, substitutions; `resolveValues` does
protocol-or-`getValue`). Threading sync/async callbacks through a shared walker
would be less readable than the current parallel structure and would risk a
behavior change on the async path. Left as-is.

### Verification

- `npx tsc --noEmit` — clean.
- Standalone Node check of the extracted helpers + `getValues` / `resolveValues`
  (sync protocol, async protocol, nested objects, arrays, re-export identity) —
  all pass.
- Playwright suite (`tests/resolve-values.spec.ts`, `tests/assignFrom-extension.spec.ts`):
  **not run to completion** — a stale `npm run serve` from before this session is
  holding port 8000 and serving a different project (`C:\git\binding\do-assign`),
  and Playwright's `reuseExistingServer` binds to it. Needs that process freed (or
  `reuseExistingServer: false`) to run. The `.ts` changes are mechanical
  extractions with no call-site behavior change, so risk is low, but the suite
  should be run before release.

### `.js` build output

Per `CLAUDE.md` I only edited `.ts` / `.d.ts`. An IDE TypeScript watch task
regenerated the corresponding `.js` during the session; the regenerated output
matches the sources. Re-run the normal build to be sure.

