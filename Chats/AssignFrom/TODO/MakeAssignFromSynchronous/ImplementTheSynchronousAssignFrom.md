# Implement the Synchronous assignFrom

---

## Human Ask

Like we did with resolveValues.ts, let's do the same with assignFromAsync.js

1.  Define module assignFrom.js
2.  Move all the synchronous functions from assignFromAsync.js to the more time sensitive assignFrom.js.
3.  The function assignFromAsync is quite lengthy, and contains many sections where everything is synchronous.  Judiciously break up those sections into synchronous functions and move them to assignFrom.js module
4.  Define the synchronous assignFrom that reuses as much of the logic as possible.