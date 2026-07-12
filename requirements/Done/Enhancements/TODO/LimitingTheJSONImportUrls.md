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
