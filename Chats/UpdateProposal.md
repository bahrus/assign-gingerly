# Update Proposal

---

## Human Ask

I've temporarily moved in to the root folder separate packages custom-enhancements and mount-observer as folders, for your reference (and in the case of custom-enhancements, your edits).

custom-enhancements/README.md is my WHATWG proposal, as an issue, which is limited to 65,536 characters (I think), that I would like you to please update. Due to the size limit, I had to stop the issue with the table of contents for more items around (maybe you know or can infer what the size limit is):

## How custom elements can opt in

I have another WHATWG proposal as an issue for mount-observer, which is currently close to what the mount-observer/README.md folder has.

The tricky thing is that what the custom-enhancements proposal supports is 90% assign-gingerly and 10% mount-observer, because custom-enhancements is advocating automatically detecting elements that satisfy the withAttr criteria.

The current custom-elements proposal, which I would like you to significantly modify, was still laboring under the desire to ask the platform to support not only initial parsing of the attributes during the initialization handshake, but also maintaining updates as attributes change.  I think the justification for using attributes to update the enhancements vs updating properties via assign gingerly is too weak to ask the platform to support, so any such mentions can go away, or at least be considered outside the scope of the proposal.

Please do your best to make the custom-enhancements/README.md accurate to what assign-gingerly (and 10% of mount-observer) does, and consise, with lots of links to https://github.com/bahrus/assign-gingerly with bookmarks for more detailed explanations.


---

## Kiro's Comments

This is a significant rewrite. The current document is ~1376 lines and covers a lot of speculative/aspirational content that doesn't match what's actually implemented. Let me outline my approach:

### What I'll keep (core of the proposal)
- The motivation/backdrop (why enhancements are needed, WebKit concerns, etc.)
- The `enh` property gateway concept
- The `mount` API shape (simplified to match what mount-observer actually does)
- Custom attributes with `baseAttr` / `withAttrs`
- The `spawn` class pattern with constructor signature
- Symbol-based dependency injection
- The `enhKey` concept

### What I'll remove or significantly trim
- Attribute change observation / `attributeChangedCallback` (per your instruction — outside scope)
- Template instantiation integration (speculative, not implemented)
- The `do` function (mount-observer handles this differently)
- The `attrTree` / branch/leaf coordinate system (replaced by `withAttrs` in assign-gingerly)
- The `defer-*` pattern (not implemented in assign-gingerly)
- Much of the "has" attribute debate (resolved)

### What I'll update to match reality
- API examples using actual assign-gingerly types (`EnhancementConfig`, `withAttrs`, `AttrPatterns`)
- Links to https://github.com/bahrus/assign-gingerly with anchors for detailed docs
- Custom Element Features section → link to assign-gingerly's README
- Itemscope Managers → link to assign-gingerly's README
- The `enh.get()` / `enh.whenResolved()` API (matches what's implemented)

### Character limit concern
GitHub issues have a 65,536 character limit. The current doc is well over that. The rewrite needs to be concise. I'll aim for ~40,000 characters to leave room for future edits.

I'll proceed with the rewrite now. This will be a full replacement of the file.
