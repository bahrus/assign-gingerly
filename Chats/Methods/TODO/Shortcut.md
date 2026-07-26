# Method / Aliasing Shortcut

This pattern will appear frequently:

```JS
{
    from: this, /* this is the Source */
    withMethods: ['querySelector'],
    aka: {'🔍', 'querySelector'}
}
```

It would be nice to reduce the verbosity:

```JS
{
    from: this, /* this is the Source */
    akaMethods: {'🔍', 'querySelector'},
}
```