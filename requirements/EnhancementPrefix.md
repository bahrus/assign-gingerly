# Namespacing attribute namespacing

One quirk related to supporting attributes using withAttrs has to do with preventing clashes with a custom element's attributes or the platform.

This proposal / polyfill is part of a suite that is designed to formally recognize what the industry is already doing -- defining custom attributes with dashes (not starting with data-) that add behaviors/enhancements on top of the underlying element in a cross-cutting way where the ownership is clear.  There is an informal understanding that built-in elements won't add built-in attributes with dashes in the name, except once in a blue moon (aria-* for example).  Using data- doesn't seem very semantic or useful to enhancing the behavior such element.  Where that pattern appears to run awry is with custom elements (and a little bit with svg elements, where there's more of a pattern of using one-off attributes with dashes in the name).

So the aforementioned suite is advocating:

1.  Allowing any attribute name that either contains a dash, or one or more non ascii characters like an emoji for built-in non SVG elements.
2.  Requiring enh- prefix for elements that are instances of SVGElement, or custom elements (based on the presence of a dash in the name, which will also include Angular elements that don't use the custom element API).
3.  For simplicity, event built-in elements should treat enh- prefix as the same attribute as the one without the enh-prefix