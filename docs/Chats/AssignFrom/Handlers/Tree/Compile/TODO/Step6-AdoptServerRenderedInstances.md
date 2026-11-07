# Step 6: Adopting Server-Rendered Instances (likely TreeScope)

*Placeholder.*

**Goal:** the server renders a fully **bound** first instance, possibly inside declarative shadow DOM. The client adopts it instead of recreating it:

- walk its elements in preorder alongside the plan;
- build `TreeNode`s;
- attach managers and events;
- then rebind (idempotent).

This is hydration, which Tree Phase I explicitly ruled out, so it's probably where the line to **TreeScope** falls. The compile plan (Step 2) and the preorder walk (Step 3) are what would make it cheap.
