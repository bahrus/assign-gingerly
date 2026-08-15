# Bug with SmoothOver

---

## Human Ask

I've placed the assign-gingerly package / source folder inside the plus-minus custom element project, because there appears to be a bug with assign-gingerly.  I've pointed the imports.html file in the root to the local assign-gingerly, so that the local copy of assign-gingerly gets served.  I also have typescript running on assign-gingerly so no need to compile separately or copy fixes into the js files.

According to the [documentation for assign-gingerly](/assign-gingerly/docs/paths-dx.md#smoothovervalue), I should be able to drop the end of ".path" on the rhs of my expressions.

But when I try to do this in [el-maker.mjs](/el-maker.mjs), line 58:

```JS
expandButton: $.clone.querySelector('[name=expand]').path,
```

or line 65:

```JS
[$.ariaExpanded.path]: $.expanded.path,
```

the line disappears from the JSON output.