# Join Handler

---

## Human Ask

One of the features that assignFrom gives us is that we can define a large swath of behavior in a 100% disciplined, constrained, declarative way, where the entire transaction can be represented by JSON.

In practice, these JSON modules are built from *.mjs files, so we can make use of the easier syntax, type checking etc.

It's very important to me that when it comes to building composible strings, we provide a way for the *.mjs to be able to define the pattern with a (tagged) template literal, with the best possible developer experience, even if the final "compiled" artifact is a JSON file.

The specification below focuses on the JSON target structure, but I would like to make sure we have a strategy for getting there as well.

