# Make AssignFeatures Async but predictable


---

## Human Ask

I'm finding that the onAssigned features aren't called in sequence.  Tracing through the code, it seems to go all the way back to assignFeatures. Since it returns a promise, can't we make the change of calls to all be async / await.

If you see any issues that need ironing out, please discuss, otherwise please make the changes and document your changes below.