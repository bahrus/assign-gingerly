# ConsolidateIsAsyncSpawn

---

## Human Ask

Please don't add any new unit tests for this.

The function isAsyncSpawn appears in three places:  assignFeatures.ts, defineWithFeatures.ts, resolveAndAssignFeatures.ts

Please add an exportable module for this function in utils, and reuse it in all three places.