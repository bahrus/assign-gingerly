# Compiling Tree Specs: Roadmap

The vision, from [TreeThoughtExperiment.md](../TreeThoughtExperiment.md):

- **Compile** a Tree spec once into templates plus a binding plan.
- **Stamp** instances by cloning and walking, instead of `createElement` + per-node pattern application.
- Eventually let the **server** render the templates, so even the first instance is a clone.

The work is split into steps, one file each. **Step 1 is spelled out in detail**; the later steps are deliberately minimal and get filled in as we reach them, since each step's results shape the next.

| Step | File | Status |
|---|---|---|
| 1 | [Fragment targets + baseline benchmarks](./Step1-FragmentTargetsAndBaseline.md) | ✅ Done. Results and two new decisions inside. |
| 1b | [Optimize Tree's own overhead (rebind and create)](./Step1b-OptimizeRebind.md) | ✅ Done. Rebind ~3–3.7× faster, create ~1.7–1.8×. |
| 1c | [Attribute operator ` :=`](../../../../TODO/AttributeOperator.md) (core feature) | ✅ Done. |
| 1d | [`join` text baking: benchmark, then build or discard](./JoinTextBaking.md) | **Next** |
| 1e | [`microJoin` sync op: implement + benchmark](../../../../TODO/MicroJoin.md) (core feature) | Planned |
| 2 | [`compileTree(spec)`: a pure compiler](./Step2-CompileTree.md) | Design in progress; resumes after 1c–1e |
| 3 | [Clone-and-bind instantiation (`compile` option)](./Step3-CloneAndBind.md) | Outline |
| 4 | [Benchmark and go / no-go](./Step4-BenchmarkAndDecide.md) | Outline |
| 5 | [Server-rendered templates](./Step5-ServerTemplates.md) | Outline |
| 6 | [Adopting server-rendered instances (likely TreeScope)](./Step6-AdoptServerRenderedInstances.md) | Outline |

## Principles

1. **No nested templates.** A compiled template never contains another compiled template. Every repeat boundary (`{ each, empty }`) and every per-key template is a **separate, flat template**, stored side by side in a template registry. The plan references them by id. Cloning an outer template therefore never copies item templates it doesn't need, and each item template is cloned straight from its single shared source. (Bruce's timing experiments point this way; Step 1 confirms it with a micro-benchmark. See "On nested templates" below.)
2. **Same `TreeNode` tree, same rebinding.** Compiling only changes how a node is *created*. Rebinding, reconciliation, managers, `ctx.rebind()` and events behave exactly as they do today.
3. **Equivalence is the test.** For any spec and VM, a compiled instance must produce the same DOM, and the same `TreeNode` structure, as today's path. Every step adds equivalence tests rather than relying on a fresh set of expectations.
4. **Measure before committing.** Compiling ships only if Step 4 shows a clear win on the target scenario (thousands of static-heavy instances).

### On nested templates

**I agree with the principle, and it falls out naturally from the design.** Some background:

- Cloning a `<template>` element copies its `.content`. So if an outer template contained the item templates, every outer clone would deep-copy item markup that's only used as a *source* for further clones. That's pure overhead, and it grows with the depth of nesting.
- With flat templates, an outer clone copies only what that instance actually displays, and each item is cloned from one shared, never-cloned source.

**One distinction to keep:** a `<template>` that the *spec itself* asks for (`['template', {}, [...]]`, whose children go into `.content`) is **output**, not a compile artifact. It has to be present in the stamped DOM, so it's cloned along with everything else. That's inherent to what the user asked for, and the principle doesn't apply to it.

I haven't measured it myself yet, so Step 1 includes a nested-vs-flat micro-benchmark. If the numbers ever contradicted the principle, we'd revisit it before Step 3.

## Prerequisites: what's done and what's left

| Prerequisite | Status |
|---|---|
| Native arrays with a repeat boundary (`{ each, of, key, empty }`) | ✅ Done (TreePhaseIII) |
| Managers as view models (`{ tag, ish }`, `ctx.rebind()`) | ✅ Done. Per instance, so they're part of the plan, never baked in. |
| Text shorthand (string pattern) and tree-level `aka` | ✅ Done. The compiler must apply `aka` when classifying keys (`_` → `textContent`). |
| Event binding on the element itself (`' +='`, `call`, default dedup key) | ✅ Done. Per instance: plan entries, never baked in. |
| `$root` / `$parent`, pipes | ✅ Done. Always dynamic. |
| `ShadowRoot` / `DocumentFragment` targets | ✅ Done (Step 1). Managers resolve through the target's, possibly scoped, registry. |
| A Tree baseline benchmark | ✅ Done (Step 1): `demos/tree-benchmark.html`. **Tree creation is ~1.3–1.5× vanilla template clone, so the headroom for compiling is limited.** See Step 1's conclusions. |
| Per-key `keepNullish` | ⚪ Not needed for compiling. Per-key templates make it independent. |
| Removing the Phase TBD headers (`$:`, bare class) from `treeTypes.d.ts` | ⚪ Cleanup, can be done any time. Not a blocker. |

As far as I can tell, there are no other blockers. The two open items both go into Step 1.
