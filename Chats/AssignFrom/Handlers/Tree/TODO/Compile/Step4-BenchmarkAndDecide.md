# Step 4: Benchmark and Go / No-Go

*Outline.*

**Goal:** rerun the Step 1 benchmarks with `compile` on, and compare against the Step 1 baseline and the vanilla-template lower bound.

**The bar (agreed in Step 1):** for example, ≥ 1.5× faster creation of 1,000 static-heavy instances, with no rebind regression.

**Outcomes:**
- **Pass:** document `compile`, and continue to Step 5.
- **Marginal:** look at where the time goes (walk? dynamic-key application? template lookup?) before deciding.
- **Fail:** keep the compiler (it's still useful for Step 5's server-side templates, possibly), but don't ship the runtime `compile` path.
