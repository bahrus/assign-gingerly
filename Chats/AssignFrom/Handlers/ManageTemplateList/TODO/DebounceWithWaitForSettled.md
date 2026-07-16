# Debounce With Wait For Settled with ManageTemplateList handler

---

## Human Ask

The mount-observer package contains a utility module, [waitForSettled.ts](https://raw.githubusercontent.com/bahrus/mount-observer/refs/heads/baseline/waitForSettled.ts).

I'd like us provide an option we can set, so that this utility is used before committing the fragment of rows before adding it to the live DOM Tree.

That would mean porting over that code into this project (and I will follow up by making the downstream mount-observer package use it).

This is to make performance better (hopefully) to handle asynchronous rendering changes before adding to the live DOM tree.

Unless you have a better idea, can we incorporate this module?