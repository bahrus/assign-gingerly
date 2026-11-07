# Limiting the JSON ImportUrls

---

## Human Ask

I'm trying to remember which package it was in, but just in case, has this package ever limited url's to only allow relative urls (starting wit ./, ../, / but not http... or //) or bare specifiers for anything?  I know it came up in a separate package, pipe-in that depends on this package.  

I think allowing enhanceAll to import any JSON emc from anywhere can open up a dangerous cross scripting scenario.  If it's invoked from trusted script it's probably fine.  But I envision scenarios where HTML attributes can specify the assignFrom options, so I think maybe by default we should block imports unless an override parameter is passed in.

First of all, can you implement a stalone, exportable module that checks the url for this condition.  While you are at it, can you check if all the exported modules and files section is up to date?  I think we need to check that, especially with the inferencer submodule.

Second, can you add a flag to enhanceAll to override the default limitation, and explore how that can be passes down the food chain?

---

## Feedback

### Yes, This Package Already Has the Check

`isAllowedImportPath` exists as a **private** function in `processHandlerCommands.ts` — added when we implemented the `handlers` option (which validates user-provided import paths for handler classes). It does exactly this:

```ts
function isAllowedImportPath(path: string): boolean {
    return path.startsWith('./') || path.startsWith('../') || path.startsWith('/')
        || (!path.includes('://') && !path.startsWith('//'));
}
```

Allows: `./foo.js`, `../bar.js`, `/absolute/path.js`, `bare-specifier/file.js`  
Blocks: `https://evil.com/script.js`, `//cdn.example.com/file.js`

### What Needs to Happen

1. **Extract to a standalone, exported module** (`isAllowedImportPath.ts/.js`) so it's reusable across `processHandlerCommands`, `enhanceAll`, and by downstream packages.

2. **Apply it in `enhanceAll`** — validate the `emc` path before importing. Default: block cross-domain. Add an `allowCrossDomain?: boolean` flag to `EnhanceConfig` (or the `enhanceAll` call) that overrides.

3. **Pass it down the chain** — when `assignFrom` calls `enhanceAll`, the `allowCrossDomain` flag could come from `AssignFromOptions` or be per-entry in the `enhance` array.

### Proposed API

```ts
// Per-entry override:
enhance: [
    { emc: 'be-bound/emc.json', matching: '[name]' },                    // safe: bare specifier
    { emc: 'https://cdn.example.com/emc.json', allowCrossDomain: true },  // explicit opt-in
]

// Or global override on assignFrom:
await assignFrom(el, {}, { from: vm, enhance: [...], allowCrossDomain: true });
```

I'd prefer **per-entry** — it's more granular and makes it clear which specific import is trusted.

### On the Exports Audit

Looking at `package.json` exports, I spotted issues:

**Should be removed:**
- `./withScopePerimeter.js` — we deleted these files (moved into `inferencer/`)

**Missing (new modules we've created):**
- `./inferredAssignments.js`
- `./beVigilant.js`
- `./resolveIdRef.js` (already there ✓)
- `./inferencer/inferencer.js` — should we export the submodule's entry point?
- `./inferencer/withScopePerimeter.js` — if external packages need it

**On inferencer exports:** Since inferencer is a submodule with its own `package.json`, consumers would typically import it as `inferencer/inferencer.js` (its own package). But when used *within* assign-gingerly (like `inferredAssignments` does), the path is `./inferencer/inferencer.js`. Should we re-export it from assign-gingerly's exports map? I'd say yes for `withScopePerimeter` (since external packages like mount-observer may want to import it from here), but the inferencer itself should probably stay as its own package import.

### Implementation Plan

1. Create `isAllowedImportPath.ts/.js` — standalone exported module
2. Update `processHandlerCommands.ts` to import from it (remove private copy)
3. Update `enhanceAll.ts/.js` to validate `emc` paths, with `allowCrossDomain` override
4. Fix `package.json` exports (remove stale, add missing)
5. Add export for `isAllowedImportPath.js`

### Questions

1. **Per-entry `allowCrossDomain` or global on the options object?** I suggest per-entry.
2. **Should `inferencer/inferencer.js` be in this package's exports map?** Or rely on consumers importing inferencer as its own package?
3. **Should `beVigilant.js` and `inferredAssignments.js` be exported?** They're dynamically imported internally — exporting them would let advanced consumers use them standalone.

---

## Human Response I

> **Extract to a standalone, exported module** (`isAllowedImportPath.ts/.js`) so it's reusable across `processHandlerCommands`, `enhanceAll`, and by downstream packages.

Total agreement.

I'm not convinced ./beVigilant.js should be exportable.  Other than that, the missing ones should be.

Is:

```JSON
  "files": [
    "*.js",
    "*.ts",
    "README.md",
    "LICENSE",
    "types/assign-gingerly/types.d.ts"
  ],
```

going to allow the inferencer files to be published?

I guess this ties in to your further inquiry.

I think it would be convenient to export the same files the inferencer package exports, and certainly withScopePerimeter (but with the extra inferencer in the path) so libraries can import fewer packages and keep import maps a bit smaller.

As far as the security limitation, I think I'd like to suggest the following approach:

We add an entirely additional optional parameter to assignGingerly, assignFrom, enhanceAll, called allow: TBD

```TS
interface TBD {
    crossDomainImports: boolean
}
```

We should not allow the enhance setting to specify this, because that is precisely the configuration I would like to allow HTML attributes to specify.

So signatures would look like:

```TS
await assignFrom(el, {}, { from: vm, enhance: [...] }, {crossDomainImport: true});
```



---

## Response

### On the 4th Parameter Approach

Makes sense — separating "what to do" (options, potentially from untrusted HTML attributes) from "what's allowed" (permissions, only settable by trusted script) is a solid security boundary.

```ts
// Signature:
assignFrom(target, pattern, options, permissions?)
assignGingerly(target, source, options, permissions?)
enhanceAll(target, configs, permissions?)
```

Where `permissions`:
```ts
interface AssignPermissions {
    crossDomainImports?: boolean;  // default: false
}
```

The key insight: `options` can come from parsed HTML attributes (untrusted). `permissions` can only come from the JavaScript that calls the function (trusted). An attacker who controls HTML attributes can't escalate to cross-domain imports because they can't set the 4th argument.

### On the Name `TBD`

For the interface name, some options:

| Name | Feel |
|------|------|
| `AssignPermissions` | Clear, descriptive |
| `SecurityOptions` | Generic |
| `AllowList` | Implies more granularity than we have |
| `Permissions` | Short, clear |
| `TrustLevel` | Hmm |

I'd go with **`AssignPermissions`** — it's specific to this package and clearly communicates "these are permissions the caller grants."

### On Inferencer Exports

The `files` field in `package.json`:
```json
"files": ["*.js", "*.ts", "README.md", "LICENSE", "types/assign-gingerly/types.d.ts"]
```

This glob (`*.js`, `*.ts`) only matches files in the root — not `inferencer/` subdirectory. To publish inferencer files, you'd need to add:
```json
"files": ["*.js", "*.ts", "inferencer/**", "README.md", "LICENSE", "types/assign-gingerly/types.d.ts"]
```

And for the exports map, re-exporting inferencer's modules with the prefix:
```json
"./inferencer/inferencer.js": {
    "default": "./inferencer/inferencer.js",
    "types": "./inferencer/inferencer.ts"
},
"./inferencer/withScopePerimeter.js": {
    "default": "./inferencer/withScopePerimeter.js",
    "types": "./inferencer/withScopePerimeter.ts"
}
```

This way consumers can:
```ts
import { Infer } from 'assign-gingerly/inferencer/inferencer.js';
import { withScopePerimeter } from 'assign-gingerly/inferencer/withScopePerimeter.js';
```

Without needing `inferencer` as a separate dependency in their `package.json`.

### Implementation Plan

1. Create `isAllowedImportPath.ts/.js` — standalone exported module
2. Add `AssignPermissions` interface
3. Update function signatures: `assignGingerly`, `assignFrom`, `enhanceAll` get optional 4th/3rd `permissions` parameter
4. Wire `isAllowedImportPath` check into `enhanceAll` and `processHandlerCommands`, gated by `permissions.crossDomainImports`
5. Fix `package.json`:
   - Add `"inferencer/**"` to `files`
   - Remove stale `./withScopePerimeter.js` export
   - Add inferencer exports, `isAllowedImportPath`, `inferredAssignments`, `beVigilant`
6. Pass `permissions` through from `assignFrom` → `enhanceAll` and → `processHandlerCommands`

### One Consideration

Adding a 4th parameter to `assignGingerly` is a signature change. Currently:
```ts
assignGingerly(target, source, options?)
```
Becomes:
```ts
assignGingerly(target, source, options?, permissions?)
```

Since `options` is already optional and `permissions` is also optional, this is backward-compatible. No existing callers break.

Same for `assignFrom`:
```ts
assignFrom(target, pattern, options)  // options is required (has `from`)
```
Becomes:
```ts
assignFrom(target, pattern, options, permissions?)
```

And `enhanceAll`:
```ts
enhanceAll(target, configs)
```
Becomes:
```ts
enhanceAll(target, configs, permissions?)
```

All backward-compatible.

### Ready to implement if you confirm:
- Interface name: `AssignPermissions`
- Field: `crossDomainImports: boolean` (default `false`)
- Position: last parameter on all three functions

---

## Human Response II

We are in agreement.  Please proceed implementing.
