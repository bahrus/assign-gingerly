# Adopt: check a signature before walking

*From [HowDoesRebindingWork.md](../Queries/HowDoesRebindingWork.md), Claude's Answer II: an idea taken from Lit's SSR, whose markers carry a digest of the template and are checked before hydrating.*

## The idea

Before `adopt` walks server markup, it would check a cheap "this markup came from this spec" signature. A mismatch would rebuild right away, without walking the markup first.

## Why

**The walk is all-or-nothing:** a mismatch anywhere throws away everything walked so far, then rebuilds. That's correct, but on a large page a mismatch near the end means the walk was wasted. The common causes are things a signature would catch up front:
- a **deployment skew:** the server's spec and the client's spec are different versions;
- the **wrong config** paired with a region.

It would also make the `console.debug` more useful: "the server rendered spec signature X, the client has Y" says more than "3 elements for 4 map keys".

## What exists

`compileTree` already computes a `signature` per template (`handlers/compileTree.ts`, `signatureOf`). It's a 32-bit FNV-1a of the template's baked markup and its node shape (tags, managers, repeats, nested trees, switches), and it was meant for validating server copies. It covers the **spec**, not the data. That's what's needed, since the data is checked by the walk anyway.

## What it would take

1. **The server emits it.** o2h would compute a signature per tree and write it into the start marker, e.g. `<!--?start name="tree" sig="1a2b3c4d"-->`. o2h can import `compileTree` (it's pure). It would need the same `aka` and sample value as the client: microJoin shells depend on the sample, so the signature may need to leave microJoin content out.
2. **The client compares it.** On adopt, if the start marker has a `sig` and it differs from the client's own, Tree rebuilds and logs why. Without a `sig` (e.g. hand-written markers), it walks as today.
3. **The cost without `compile`.** Computing the signature means compiling the map, which Tree only does for `compile` configs. Options:
   - compute it only when the marker has a `sig`, and cache it per map object (as `compiledMaps` does);
   - or define a cheaper **spec hash** that doesn't need the compiler: tags, literal keys and shape, from `normalize` alone. o2h and Tree would then share one function in `treeSpec.ts`.
4. **Marker parsing:** `findChildMarkers` matches the start marker's text exactly (`?start name="tree"`), so it would need to accept the extra attribute. The same applies to nested trees' markers.

## Open questions

- **Which hash:** the compile signature, or a spec hash in `treeSpec.ts` that works with and without `compile`?
- **Where it lives:** one signature per tree (the marker), or per map key (each key's root element)? Per key would allow partial adoption later, but Tree is all-or-nothing today.
- **Is it worth it** before deployment skew is a real problem? The walk's cost is small (see the adopt benchmark, about 8 ms for 12,901 elements in Chromium). So the main gain may be the clearer diagnostic rather than speed.

## Related

- [Compile/TODO/Step6-AdoptServerRenderedInstances.md](../Compile/TODO/Step6-AdoptServerRenderedInstances.md): largely done now by `adopt` (see [RebindingServerRenderedManagers.md](../WorkerRendering/RebindingServerRenderedManagers.md)), apart from declarative shadow DOM.
