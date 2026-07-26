# Use of destructuring

---

## Human Ask

I've added some //TODO 's to the latest code changes made by copilot (I ran out of tokens for the month, so I used copilot for a bit).  But I've noticed this tendency to do a little bit of forward planning in general:


I think this code is much nicer:

```JS
  const {withMethods, aka, akaMethods, protocols, from} = options;
  for (const key of idRefNormalKeys) {
    const parsed = parseIdRef(key);
    if (!parsed) continue;

    const el = resolveIdVariable(parsed.varName, target, ids);
    if (!el) continue;

    const value = expandedPattern[key];
    if (parsed.remainingPath) {
      const resolvedValue = getValues(
        { __v: value }, options.from,
        { withMethods, aka, akaMethods, protocols, root: target }
      );
      assignGingerly(el, { [parsed.remainingPath]: resolvedValue.__v }, options);
    } else {
      const resolvedValue = getValues(
        typeof value === 'object' && value !== null ? value : { __v: value },
        options.from,
        { withMethods, aka, akaMethods, protocols, root: target }
      );
      if (!('__v' in resolvedValue)) {
        assignGingerly(el, resolvedValue, options);
      }
    }
  }
```

than this:

```JS
  //TODO
  for (const key of idRefNormalKeys) {
    const parsed = parseIdRef(key);
    if (!parsed) continue;

    const el = resolveIdVariable(parsed.varName, target, ids);
    if (!el) continue;

    const value = expandedPattern[key];
    if (parsed.remainingPath) {
      const resolvedValue = getValues(
        { __v: value }, options.from,
        { withMethods: options.withMethods, aka: options.aka, akaMethods: options.akaMethods, protocols: options.protocols, root: target }
      );
      assignGingerly(el, { [parsed.remainingPath]: resolvedValue.__v }, options);
    } else {
      const resolvedValue = getValues(
        typeof value === 'object' && value !== null ? value : { __v: value },
        options.from,
        { withMethods: options.withMethods, aka: options.aka, akaMethods: options.akaMethods, protocols: options.protocols, root: target }
      );
      if (!('__v' in resolvedValue)) {
        assignGingerly(el, resolvedValue, options);
      }
    }
  }
```

I don't know what happens after minification or other tooling, but certainly before, can you see how the code change would make the footprint smaller?

In addition, lookups seem likely to be more expensive than local variable access.

What are the reasons AI seems to not take advantage of this coding nicety?

