# Step 5: Server-Rendered Templates

*Outline.*

**Goal:** the server runs the same `compileTree` (it's pure: string building, no DOM) and emits the flat templates once per page:

```html
<template id="tree:launch-card" data-tree-signature="…">…</template>
<template id="tree:launch-card/crew/each" data-tree-signature="…">…</template>
```

On first use of `compile: 'launch-card'`, the client looks these up in the target's root node and checks each signature. On a match it adopts them, so **even the first instance is a clone**, and the HTML parser has done the template-building work. On a mismatch or a missing template, it compiles on the client.

**Key questions to settle then:**
- **Template id scheme** for flat templates (per key and per repeat).
- **Where to look:** the document vs. the shadow root.
- **Packaging** the compiler for Node / server use.
