# Filtering and other operations on JSON Attributes

---

## Human Ask

There are some properties where programmatically we want to be able to set it to a robust object, fully unfettered, but from an attribute, we want to filter out certain sections so as not to expose sensitive configuration information, and possibly also insert some non JSON information into it.  

```JSON
{
    "enhConfig": {
        ...
        "withAttrs": {
            "base": "...",
            "_base": {
                "mapsTo": "assignConfig",
                "instanceOf": "Object",
                "assign": {
                    '?.security -=': 'myVerySensitiveProperty'
                }
            },
            "host": "${base}-host"
        }
    },
    ...
}
```

So the sequence is parse the JSON, then do the assign (use assignGingerly for now), then set assignConfig to the value.

There may be a follow-up proposal to switch to assignFrom. 


---

## Kimi Code's Response

### This fits the existing pipeline cleanly

`parseWithAttrs` (`parseWithAttrs.ts:401-420`) already has a natural slot for this: right after the parser produces `parsedValue` and before the `mapsTo` assignment/spread. The change is small — roughly:

```TS
const parsedValue = config.parseCache
  ? parseWithCache(attrValue, config, parser, parserContext)
  : callParser(parser, attrValue, parserContext);

// NEW: post-parse shaping via assignGingerly
if (config.assign && parsedValue && typeof parsedValue === 'object') {
    assignGingerly(parsedValue, config.assign);
}
```

Your example then works as intended: `instanceOf: 'Object'` JSON-parses the attribute, `assignGingerly(parsed, { '?.security -=': 'myVerySensitiveProperty' })` strips the sensitive sub-key, and the filtered object lands on `assignConfig`. The full command vocabulary (`-=`, `+=`, `Y=`, nested `?.` paths) comes for free, and multiple commands per `assign` object execute in key order.

Worth stating the security framing precisely: this is a **sanitizer for attribute-supplied input**, not a hiding mechanism — the raw attribute text remains visible in the DOM. The boundary it enforces is "HTML-authored config cannot inject these sections into the live config object," which matches your use case (programmatic sets stay unfettered, attribute sets get filtered).

### Inserting non-JSON information works, but note why

The `assign` object is authored in JavaScript (inside `enhConfig`), not in the HTML attribute — so its *values* can be anything: class instances, functions, live object references. `assignGingerly` will set them by reference. That covers "insert some non JSON information" with no extra machinery. Just don't expect `${base}` template resolution inside `assign` — template strings are only resolved for attribute *names* in the first pass, not inside config objects. If interpolation inside `assign` is ever wanted, that's a separate feature.

### The one real trap: `parseCache` interaction

If `config.parseCache` is set, `parseWithCache` may return a **shared reference** (`parseWithAttrs.ts:124-125`). Since `assign` mutations (especially `-=`) mutate in place, applying `assign` to a shared cached value would corrupt the cache — the second consumer of the same attribute value would get an already-filtered (or double-filtered) object, and worse, the damage silently persists.

Two rules resolve it:

1. **Apply `assign` before caching**, so the cache stores the post-filter value. Filtering runs once, and both `'shared'` and `'cloned'` consumers get correct results.
2. **Include `assign` in the cache key.** `getCacheKey` (`parseWithAttrs.ts:70-86`) currently keys on `instanceOf|parser` — two configs identical except for `assign` would collide. Since `assign` values may be non-serializable (functions, instances), `JSON.stringify` alone won't do; a nested `Map` keyed by the `assign` object *reference* (like the existing config-level cache structure) is the safer approach.

This means the sketch above needs restructuring: the `assign` step moves *inside* the cached path (or `parseWithCache` gains a post-parse hook), rather than sitting after it as a flat post-step.

### Smaller decisions to pin down

- **`valIfNull`**: recommend `assign` does *not* apply to `valIfNull` defaults — those are author-provided constants, not attribute input, so there's nothing to sanitize.
- **Non-object parse results**: guard with `typeof parsedValue === 'object'` as sketched; silently skip otherwise (consistent with the library's silent-skip posture).
- **Import strategy**: `parseWithAttrs.ts` is synchronous, so `assignGingerly` must be a static import — no import cycle exists (`assignGingerly` never imports `parseWithAttrs`), and `assignGingerly` is the package's core module that consumers already load. A dynamic import would force `parseWithAttrs` async, a breaking change — not worth it.
- **Types**: `AttrConfig` gains `assign?: Record<string, any>`, defined in `types/assign-gingerly/types.d.ts` per project convention.

### On the assignFrom follow-up

Deferring is right. The `assign` field as specified is a plain `assignGingerly` source; a future `assignFrom` variant would add a `from` context for RHS path resolution (pulling values from a viewModel instead of literals). Keeping `assign` minimal now leaves that door open — e.g. a sibling `assignFrom` config key rather than breaking the `assign` shape later.
