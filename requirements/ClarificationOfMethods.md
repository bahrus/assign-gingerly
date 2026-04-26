# Clarification Of Methods


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

