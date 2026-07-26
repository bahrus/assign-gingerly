# Dispatch Support

---

## Human Ask

As mentioned in [LHSElementRhsObject](./LHSElementRhsObject.md), the += operator can also add event handlers when the LHS is a DOM element and the RHS is an object or array of objects.

This planning chat is to allow the matching element to dispatch an event with a unique name for more targeted event handling.

As the [types indicate](../../../../types/assign-gingerly/types.d.ts) we can dispatch multiple events, data coming from different sources.

There's still a number of decisions that need to be finalized, but this is the opening of the discussion.