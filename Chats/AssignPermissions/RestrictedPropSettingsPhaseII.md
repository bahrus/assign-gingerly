# Restricted Prop Settings Phase II

---

## Human Ask

Continuing on the work of [Restricted Prop Settings, Phase I](/Chats/AssignPermissions/RestrictedPropSettingsPhaseI.md), we move on to phase II

```JS
{
    restrictedPropSettings: [
        ...
        //Phase II
        {
            prop: 'outerHTML',
            useMethod: 'replaceWithHTML',
        },
    ]
    ...
}
```

I don't think it matters as far as implementing, but I believe [replaceWithHTML is in pilot](https://developer.chrome.com/blog/declarative-partial-updates#a_new_set_of_static_and_streaming_apis) mode on Chrome, so hopefully will become a standard soon.

Recall that Phase V will include:

```JS
restrictedMethodSettings: [
    //Phase IV
    'setHTMLUnsafe', //not allowed at all
    customSettings:{
        sanitizerOptions: {...},
    },
    
    {
        //Phase V
        method: 'replaceWithHTML',
        addArgs: [
            '?.customSettings?.sanitizerOptions'
        ]
    }
]
```

... so "leave room" for that when the time comes, if relevant.  Meaning, don't paint yourself into a corner working on this phase.

Before implementing, let's please resolve any ambiguities / open questions / honest pushback.

---

## AI Response

I think Phase II is a useful, narrowly-scoped extension of Phase I: it turns a
blocked *property setter* into an explicit, trusted-method capability.  The
important boundary is that it must be a **redirect**, never a fallback.  If the
safe replacement method is unavailable or unusable, the original property must
remain unset.

The proposed Chrome API matches the intended model: `replaceWithHTML(html,
options?)` replaces the entire element, while `setHTML(html, options?)` replaces
its contents.  It is presently available for developer testing in Chrome 148
behind the experimental-web-platform-features flag; the Chrome team also points
to an API-shape polyfill.  That makes feature detection necessary, rather than
assuming broad browser availability. [Chrome’s API overview](https://developer.chrome.com/blog/declarative-partial-updates)

### Recommended Phase II contract

For a setting such as:

```ts
{ prop: 'outerHTML', useMethod: 'replaceWithHTML' }
```

an ordinary assignment to `outerHTML` should become:

```ts
target.replaceWithHTML(rhs);
```

where `target` is the object that owns the final path segment.  The library
should call the method with **one argument**, without treating an array RHS as
multiple arguments.  That is the least surprising interpretation for an HTML
payload and leaves argument augmentation/array rules to Phase V.

The redirect should apply to ordinary plain and nested assignments, including
assignments that arrive through `assignFrom`, `@each`, handler follow-ons, and
event vectors—the Phase I permissions plumbing already establishes those
paths.  It should not require `useMethod` to appear in `withMethods`: the
permission object itself is the explicit authorization for this internal
redirect.

### Commands and fail-closed behavior

I recommend that `+=`, `=!`, and `Y=` recognize the property as restricted but
**do not redirect** in Phase II.  Their meanings do not map cleanly to
`replaceWithHTML`:

- `outerHTML += value` would require reading and concatenating serialized HTML,
  then replacing the element—a surprising and potentially costly operation.
- toggling or recursively merging an HTML replacement target has no useful,
  general interpretation.

For those forms, warn once and skip, just as a Phase I string setting does.
`-=` remains unchanged from Phase I.  This gives the object form the same
protective coverage as a string setting without silently inventing semantics.

If `target[useMethod]` is not a function (including browsers where
`replaceWithHTML` has not shipped), warn once and skip.  Do not assign
`target[prop]` as a compatibility fallback.  Applications that want support
today can install a deliberately chosen polyfill or provide their own method;
the permissions layer should not weaken itself based on platform support.

### Configuration normalization

Phase I's `Set<string>` should become a normalized internal map, for example
`Map<string, RestrictedPropSetting | undefined>`:

- a string entry maps to `undefined` and means **block**;
- an object with `useMethod` maps to that setting and means **redirect ordinary
  assignment**;
- object entries without `useMethod` remain reserved for later phases and, for
  now, should block their `prop` rather than accidentally do nothing.

This keeps O(1) lookup while leaving room for Phase III's `attr` and Phase V's
method-argument policy.  I would reject duplicate settings for the same `prop`
at normalization time.  In particular, silently choosing between
`'outerHTML'` and `{ prop: 'outerHTML', useMethod: 'replaceWithHTML' }` makes a
security policy difficult to audit.  A clear configuration error is preferable
to a precedence rule.

### Interactions deliberately deferred

Phase II should not inspect calls a user writes through `withMethods`, such as
`?.replaceWithHTML`, nor calls to `setAttribute`; those are method/attribute
policies for Phases III–V.  It also should not synthesize an options object for
`replaceWithHTML`.  Phase V can layer `restrictedMethodSettings` on the common
method-invocation path and append the configured sanitizer options there.

### Tests to lock down

- direct and nested `outerHTML` assignments call a test-double
  `replaceWithHTML` once with the RHS;
- the original `outerHTML` setter is never invoked;
- missing/non-function `replaceWithHTML` warns and leaves the target unchanged;
- `assignFrom` and an event vector retain the redirect;
- `outerHTML +=`, `outerHTML =!`, and `outerHTML Y=` are blocked rather than
  redirected;
- duplicate configurations fail deterministically; and
- an existing string-only Phase I policy continues to skip exactly as before.

---

## Human Response I

> I recommend that `+=`, `=!`, and `Y=` recognize the property as restricted but
**do not redirect** in Phase II.  Their meanings do not map cleanly to
`replaceWithHTML`:

This is an interesting "edge" case I hadn't thought about.  I'd prefer that the code not have to 

1.  Be aware of what replaceWithHTML means and
2.  have to judge on the spot if it applies or not.  

If it is a matter of simply not adding a hook in the code in those places for now, I can create a separate request for how to deal with that, assuming we can find valid use cases for needing this method redirecting to work in the context of `+=`, `=!`, and `Y=`

Should that happen, I guess I'm thinking we may need another configuration setting, something like "(un)supported(Commands|Operations)".

Is that inline with your thinking?

---

## AI Response II

Yes—the separation you are aiming for is exactly right.  The permissions layer
should not contain special knowledge of what `replaceWithHTML` means.  It should
only implement a generic rule: *for this property and this operation, either
block it or call the configured method with the operation's defined input.*

There is one security-critical qualification: we cannot simply omit Phase II
logic from the command handlers.  If an object-form setting is ignored by `+=`,
then `'?.outerHTML +='` falls through to the native property setter and bypasses
the restriction.  The generic default therefore needs to be:

| Operation | Phase II default for `{ prop, useMethod }` |
|---|---|
| ordinary assignment | Redirect to `useMethod(rhs)` |
| `+=`, `=!`, `Y=` | Block and warn once |
| `-=` | Preserve Phase I behavior (no new restriction) |

That is not a judgment about HTML or `replaceWithHTML`; it is a fail-closed
default for every redirected property.  Internally, the command branches would
perform the same generic policy lookup that Phase I already performs, but only
the ordinary-assignment branch would ask the policy to invoke `useMethod`.

For a later extension, I would use a name centered on **operations**, rather
than `supportedCommands`: `+=` and `=!` are surface syntax, while ordinary
assignment and merge are the underlying operations the policy needs to govern.
For example, a future design could be:

```ts
{
  prop: 'someProperty',
  useMethod: 'someMethod',
  redirectOperations: ['assign'] // Phase II implicit default
}
```

I would *not* expose `redirectOperations` in Phase II.  Before allowing
`'increment'`, `'toggle'`, or `'merge'`, we must specify what reaches the
method: the raw RHS, a computed next value, or a merge descriptor.  Deferring
that avoids baking accidental semantics into a security API.  When that later
request arrives, the implementation can add an operation-dispatch table beside
the normalized property policy; no Phase II call sites need to become
method-specific.

So the Phase II implementation remains small and future-friendly: normalize a
property policy once, have every setting path consult it, redirect only its
well-defined ordinary-assignment operation, and block all other setting
operations until their contracts are explicitly designed.

---

## Human Response II

Sounds good.  Please implement if you feel ready.

---

## Implementation Notes

Phase II is implemented.

- Object policies such as `{ prop: 'outerHTML', useMethod: 'replaceWithHTML' }` redirect ordinary plain/nested assignments to the configured method.
- Missing methods fail closed: no property setter fallback.
- `+=`, `=!`, and `Y=` block object-form settings; `-=` remains unchanged.
- Duplicate policies for one property throw during normalization.
- Redirects flow through `assignFrom`, `@each`/`@eachTime`, handler return values, and event vectors.
- `assignTentatively` remains fail-closed for object-form policies because invoking an arbitrary replacement method cannot produce a reliable reversal entry.

Please refresh:

- `http://localhost:8000/tests/restricted-prop-settings.html`

It should now report **12/12 passing**. `git diff --check` passes for the implementation and test files; the only remaining whitespace warnings are in your in-progress Phase II chat text.

