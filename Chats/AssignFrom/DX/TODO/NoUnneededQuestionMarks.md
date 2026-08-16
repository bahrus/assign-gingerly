# No Unneeded Question Marks

---

## Bruce's Ask

```JS
import {paths, doAssign, set, smoothOver} from 'assign-gingerly/DX/paths.js';

...


...doAssign(
    set($.expandButton).to($.clone.querySelector('[name=expand]')),
    set($.collapseButton).to($.clone.querySelector('[name=collapse]')),
)
```

generates:

```JSON
assign: {
    "?.expandButton": "?.clone?.querySelector?.[name=expand]",
    "?.collapseButton": "?.clone?.querySelector?.[name=collapse]"
}
```

I think it would be a bit nicer if it generated:

```JS
assign: {
    expandButton: "?.clone?.querySelector?.[name=expand]",
    collapseButton: "?.clone?.querySelector?.[name=collapse]"
}
```

I.e. if it's only one level deep, just leave it without the "?."

How difficult would it be to do this?