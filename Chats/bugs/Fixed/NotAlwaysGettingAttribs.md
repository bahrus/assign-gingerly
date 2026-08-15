# Not Always Getting Attribs

object-extension.ts class ElementEnhancementContainer method get has an issue:

It only gets the attrInitVals if registryItem.enhKey has a value.

The withAttribs should be parsed regardless of whether registryItem has an enhkey.  The only difference is if there is an enhKey, then the existingInitVals found at line 101 should be merged with the attriInitVls.

In other words, line 116 should pass the attrInitVals.