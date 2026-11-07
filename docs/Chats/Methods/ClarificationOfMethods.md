# Clarification Of Methods

## Status: ✅ VERIFIED - No Changes Needed

Looking at the documentation and tests, I'm spotting a major mismatch between what I want and what I'm seeing.  I'm not sure if the mismatch is just in the documentation and examples or if, as I suspect, it is a core misunderstanding.

I see examples like this:

**Complex chaining:**

```TypeScript
const shadowRoot = {
  querySelector(selector) {
    return this.elements[selector];
  },
  elements: {
    'my-element': document.createElement('div')
  }
};

assignGingerly(shadowRoot, {
  '?.querySelector?.my-element?.classList?.add': 'highlighted'
}, { withMethods: ['querySelector', 'add'] });

// Equivalent to: shadowRoot.querySelector('my-element').classList.add('highlighted')
```

This implies that the method "querySelector" has to be defined at the root level of the passed in object.  What is important to me is that the methods be available on the object found from the chained accessor, naturally, as a consequence of what we are working with, not based on artificially created methods.  So I would have preferred to see an example like:

```JavaScript
const div = document.createElement('div');
div.innerHTML = String.raw `
    <my-element>
      <your-element></your-element>
    </my-element>
`;
assignGingerly(div, {
  '?.querySelector?.my-element?.querySelector?.your-element?.classList?.add': 'highlighted'
}, { withMethods: ['querySelector', 'add'] });
```

Can you check if the latter example would work with the existing implementation?  If not, can you fix the implementation along with the documentation and tests?  If so, do you agree it would be clearer to modify just the documentation and tests to make sure this is clear?

## Resolution

**VERIFIED**: The implementation already works correctly! Methods are called on the objects found through chained accessors, not just on the root object.

### Changes Made:

1. **Added Test** (`tests/with-methods.html` - Test 16):
   - Added test case "should call querySelector on chained DOM elements"
   - Uses real DOM elements with nested `querySelector` calls
   - Test passes ✅ (16/16 tests passing)

2. **Updated Documentation** (`README.md`):
   - Replaced the artificial "shadowRoot" example with real DOM elements
   - Added clearer explanation: "Methods are called on the objects found through chained accessors, not just on the root object"
   - Added explicit comment showing the equivalent code
   - Added verification example showing the class was actually added

### How It Works:

The `evaluatePathWithMethods()` function in `assignGingerly.ts` processes each segment in the path and:
1. Checks if the segment is in the `withMethods` set
2. If it's a method AND the property is a function, calls it on the **current object**
3. Uses the return value as the new current object for the next segment

This means methods naturally work with object hierarchies - each method is called on whatever object was returned by the previous step in the chain.

