# Reorganize Tree Documentation

## Bruce's Ask

The [documentation for the tree handler](../../../../../docs/tree.md) feels very much out of order.

Please move the sections around, starting maybe with the basic example, and make sure things progressively get more advanced, maybe include more examples.  I think it's very tough reading for a newbie.


## Claude's Implementation Notes

[docs/tree.md](../../../../../docs/tree.md) is reordered to go from basic to advanced. **The section texts are unchanged,** except where noted below: I moved them, and didn't rewrite them, so nothing that was accurate became inaccurate.

### The new order

1. **Intro and contents:**
   - **A rewritten intro:** what Tree does, the two ways to write it (the notation, and `` tree`…` ``), and the demo link.
   - **A grouped table of contents.**
2. **Getting started:**
   - **Basic Example,** plus a new **"A little more"** example. It shows the common shapes (text shorthand, an attribute with static children, literals), the resulting HTML, and the same map written with `` tree`…` ``. I ran both forms in Chromium, and they produce exactly the HTML shown.
   - **Then:** Element Specifications, Keys (with `'*'`), and Second and Later Calls.
3. **Building blocks:**
   - **`` tree`…` ``:** the intro, the example, typing the paths, and the mapping table. Its long "Details" list moved to the reference part.
   - **Then:** Arrays (with a new one-line pointer to Compiling for large lists), Switches, Nested Trees, Itemscope Managers (local managers, `ctx.rebind()`, async `onAssigned`), Events, and Snippets (with holes). Events moved after Managers, since its example calls a manager method.
4. **Going further:**
   - **Targets,** now including "Several trees in one target", moved from "Second and Later Calls".
   - **Config,** with `adopt?: boolean | 'pending'`, which was out of date.
   - **Compiling** (with its measurements), and Performance Notes.
5. **Server rendering:**
   - **Server Side Rendering [WIP],** with Hydration, the walk, `adopt: 'pending'` and pending marks. It was the first section; it's now here, with a one-line lead-in.
   - **Pure building blocks,** whose table now lists `isSnippet`, `snippetSource` and `snippetParts`.
6. **Reference:**
   - **"More on `` tree`…` ``":** whitespace, microdata props, attribute values, caching, the parser, errors, and `analyzeTree`.
   - **Editor support (VS Code).**
   - **Design discussion:** the Chats link.

### Removed

**The stub "Compiling to a template for optimum performance":** its demo link is in the intro, its pointer is in the contents and in Arrays, and its Chats link is at the end.

### Links

- **The `` tree`…` `` heading** is now "Authoring with `` tree`…` `` (optional)". Its anchor, `#authoring-with-tree-optional`, is the one README.md, paths-dx.md and tree.md itself already linked to. That anchor didn't exist before: those four links were broken.
- **The old long anchor,** used by AddPropWithMicroJoinDX.md, still works through an `<a id>`.
- **Every other heading** that other docs link to kept its text, so its anchor is unchanged. That includes `#adopt-pending-experimental-…`, `#compiling-compile-experimental`, `#ctxrebind`, `#how-the-walk-pairs-spec-and-markup`, `#nested-trees`, `#pending-marks-data-pending` and `#snippets-static-html`.

### Possible next steps

Say if you'd like any of these:
- **A short "Common patterns" section** after Getting started: a list with an empty state, a conditional badge, and a formatted date.
- **Splitting the reference material,** such as the `` tree`…` `` details and the compile measurements, into their own pages.
- **Result HTML for the Arrays and Switches examples,** as "A little more" has.
