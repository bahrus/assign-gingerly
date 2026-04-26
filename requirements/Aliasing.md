# Method and Prop Aliasing

The following syntax can be reduced if we allow for aliasing

**Before:**

```TypeScript

assignGingerly(shadowRoot, {
  '?.querySelector?.my-element?.classList?.add': 'highlighted'
  '?.querySelector?.your-element?.classList?.add': 'highlighted'
}, { withMethods: ['querySelector', 'add'] });

```

**After:**

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
  '?.$?.my-element?.classList?.add': 'highlighted'
  '?.$?.your-element?.classList?.add': 'highlighted'
}, { 
    withMethods: ['querySelector', 'add'],
    aka: [['$', 'querySelector'], ['+', 'add'], [''] 
});

```

