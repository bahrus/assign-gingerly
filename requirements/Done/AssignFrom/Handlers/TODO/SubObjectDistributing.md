# Sub Object Distributing

```html
<div id=outerDiv itemscope>
    <div itemprop=user itemscope="user-card">
        <h2>User Profile</h2>
        <p itemprop="name"></p>
        <p itemprop="email"></p>
    </div>
</div>
```

```TypeScript
import 'assign-gingerly/object-extension.js';

// Define a manager class
class UserCardManager {
  element;
  name = '';
  email = '';
  
  constructor(element, initVals) {
    this.element = element;
    if (initVals) {
      Object.assign(this, initVals);
      this.render();
    }
  }
  
  render() {
    this.element.querySelector('[itemprop="name"]').textContent = this.name;
    this.element.querySelector('[itemprop="email"]').textContent = this.email;
  }
}

// Register the manager
customElements.itemscopeRegistry.define('user-card', {
  manager: UserCardManager
});

// Use assignGingerly with the 'ish' property
const element = document.querySelector('[itemscope="user-card"]');
element.assignGingerly({
  ish: {
    name: 'Alice',
    email: 'alice@example.com'
  }
});

// Wait for async setup to complete
await customElements.itemscopeRegistry.whenDefined('user-card');

// Access the manager instance
console.log(element.ish instanceof UserCardManager); // true
console.log(element.ish.name); // 'Alice'
```
