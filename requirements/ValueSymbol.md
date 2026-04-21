# Value Symbol

assign gingerly supports a way to (please confirm that these are all true):

1.  Register a function prototype or class in the custom element registry (global or scoped) and then:
2.  Assuming object-extension.js is imported, the "set" property is added to proxy to all objects?  all Elements?  Definition around line 778 of assignGingerly.ts

There's a really common requirement that has come up with a number of enhancements that have come up.  I just want to set the "value" of an Element, without worrying too much about what the specific property should be to set the value.

I think for this requirement, we may also need get added to 

This is Kiro's advice:  https://raw.githubusercontent.com/bahrus/do-toggle/refs/heads/baseline/kiroAdvice.md

I actually ended up with much more complex logic than what is shown there:

https://raw.githubusercontent.com/bahrus/trans-render/refs/heads/baseline/asmr/shareTo/StIn.ts

So this requirement is to something like that, but making use of an extension object:

```TypeScript
import {value} from 'assign-gingerly/somewhere.js';

oElement.set[value] = 'hello'
//if oElement is an input with type=text or password or submit, sets .value = 'hello'
// a bunch of other special conditins
// otherwise sts oElement's textContent = 'hello';
```

---

## Kiro's Comments

### Understanding the Current State

**Confirming your questions:**

1. ✅ **Yes** - Classes/functions can be registered in EnhancementRegistry (which is attached to customElementRegistry)
2. ⚠️ **Partially** - The `set` property is added as a lazy getter (line 778) but **only when**:
   - A `registry` option is provided to assignGingerly
   - The target doesn't already have a `set` property
   - Currently works for dependency injection via symbols, not for general property setting

**Current `set` behavior:**
- Returns a Proxy that intercepts symbol property assignments
- Looks up the symbol in the registry to find enhancement configs
- Spawns enhancement instances and maps values to their properties
- **Does NOT handle string properties or value inference**

### Analysis of the Requirement

**What you're asking for:**

A smart "value" symbol that infers the correct property to set based on element type:

```typescript
import { value } from 'assign-gingerly/value-symbol.js';

element.set[value] = 'hello';
// Intelligently sets the right property based on element type
```

**The complexity you've encountered (from StIn.ts):**

The `StIn.setValue()` method shows the real-world complexity:
- Different elements have different "value" properties
- Some have both `valueProp` and `displayProp` (e.g., `<time>` has `dateTime` and `textContent`)
- Type coercion varies (Date → ISO string for `<time>`, boolean → 'true'/'false' for ARIA)
- Special actions (toggle, increment, set-class, set-part)
- Fallback to `ish` property for itemscope elements
- Security concerns (blocking `innerHTML` assignments)

### Proposed Implementation

**Option 1: Simple Value Symbol (Minimal)**

Create a special symbol that triggers smart value inference:

```typescript
// value-symbol.ts
export const value = Symbol.for('assign-gingerly:value');

// In assignGingerly.ts, enhance the set proxy:
if (prop === value) {
  // Infer the correct property
  const targetProp = inferValueProperty(target);
  (target as any)[targetProp] = value;
  return true;
}

function inferValueProperty(element: Element): string {
  const tagName = element.tagName.toLowerCase();
  
  if (tagName === 'input') {
    const type = element.getAttribute('type');
    if (type === 'checkbox' || type === 'radio') return 'checked';
    return 'value';
  }
  
  if (tagName === 'textarea' || tagName === 'select') return 'value';
  if (tagName === 'time') return 'dateTime';
  if (tagName === 'data') return 'value';
  if (tagName === 'meter' || tagName === 'progress') return 'value';
  
  // Check for itemprop hint
  const itemprop = element.getAttribute('itemprop');
  if (itemprop) return itemprop;
  
  return 'textContent';
}
```

**Usage:**
```typescript
import { value } from 'assign-gingerly/value-symbol.js';

inputElement.set[value] = 'hello';        // Sets .value
checkboxElement.set[value] = true;        // Sets .checked
divElement.set[value] = 'content';        // Sets .textContent
timeElement.set[value] = new Date();      // Sets .dateTime (needs type handling)
```

**Option 2: Enhanced Value Symbol (With Type Handling)**

Add type coercion and display property handling:

```typescript
export const value = Symbol.for('assign-gingerly:value');
export const display = Symbol.for('assign-gingerly:display');

interface ValueSetOptions {
  valueProp?: string;
  displayProp?: string;
  allowUnsafe?: boolean;
  action?: 'set' | 'toggle' | 'increment' | 'decrement';
}

// Enhanced set proxy handling:
if (prop === value || prop === display) {
  const options = getValueSetOptions(target);
  const targetProp = prop === value 
    ? (options.valueProp ?? inferValueProperty(target))
    : (options.displayProp ?? inferDisplayProperty(target));
  
  const coercedValue = coerceValue(value, target, targetProp);
  (target as any)[targetProp] = coercedValue;
  return true;
}

function coerceValue(val: any, element: Element, prop: string): any {
  const tagName = element.tagName.toLowerCase();
  
  // Date handling for time elements
  if (tagName === 'time' && prop === 'dateTime' && val instanceof Date) {
    return val.toISOString();
  }
  
  // Boolean to string for ARIA
  if (prop.startsWith('aria') && typeof val === 'boolean') {
    return val ? 'true' : 'false';
  }
  
  // Locale string for display properties
  if (prop === 'textContent' && (typeof val === 'number' || val instanceof Date)) {
    return val.toLocaleString();
  }
  
  return val;
}
```

**Option 3: Configuration-Based (Most Flexible)**

Allow elements to declare their value property preferences:

```typescript
// On the element or via data attribute
element.dataset.valueProp = 'myCustomProp';
element.dataset.displayProp = 'textContent';

// Or via a WeakMap registry
const valuePropertyRegistry = new WeakMap<Element, ValueSetOptions>();

element.set[value] = 'hello';
// Checks registry first, then infers
```

### Recommendations

**For assign-gingerly:**

1. **Start with Option 1** - Simple inference without type coercion
   - Covers 80% of use cases
   - Minimal complexity
   - Easy to understand and debug

2. **Add a separate utility module** for complex scenarios:
   ```typescript
   // element-value.ts
   export function setValue(element: Element, value: any, options?: ValueSetOptions)
   export function getValue(element: Element, options?: ValueSetOptions)
   export function inferValueProperty(element: Element): string
   export function inferDisplayProperty(element: Element): string
   ```

3. **Keep the symbol simple** - Don't try to handle all the complexity from StIn.ts in the symbol handler
   - Actions (toggle, increment) should use separate symbols or methods
   - Type coercion should be explicit or use the utility functions
   - Security checks should be opt-in

**Concerns:**

1. **Type safety:** TypeScript won't know what property is being set
2. **Debugging:** Harder to trace where values are going
3. **Magic:** Implicit behavior can be confusing
4. **Edge cases:** The StIn.ts complexity shows there are MANY edge cases

**Alternative approach:**

Instead of a magic symbol, consider a method:

```typescript
element.setValue('hello');  // More explicit, easier to type
element.getValue();         // Symmetric API
```

This could be added via object-extension.ts and would be more discoverable and type-safe.

### Implementation Path

If you want to proceed with the symbol approach:

1. Create `value-symbol.ts` with the symbol export
2. Enhance the `set` proxy in assignGingerly.ts to handle the value symbol
3. Implement `inferValueProperty()` with comprehensive element type coverage
4. Add tests for various element types
5. Document the behavior and limitations
6. Consider adding `getValue()` support via a `get` proxy

**Estimated complexity:** Medium
**Estimated footprint:** ~100-150 lines for basic implementation
**Risk:** Medium (implicit behavior, edge cases)

Would you like me to implement Option 1 as a starting point?