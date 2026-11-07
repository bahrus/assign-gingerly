# Support for pipe expressions

Setting properties, which both Object.assign and assignGingerly, do, theoretically shouldn't have any other side effects, so it is considered a "declarative operation".  But the code inside the setters can do things "on the side", plus assignGingerly allows, via the registry, instantiating enhancement classes, so there's that.

This requirement stretches the meaning of declarative syntax a bit further, to account for a significant number of use cases.


## Example 1 Adding to the classlist and the part token lists

```JavaScript
oElement.assignGingerly({
    '?.classList?.add|myClass': 0,
    '?.part?.add|myPart': 0,
});
```

The vertical pipe means: what comes before it is expected to be a method, and the pipe means "open parenthesis, and close parenthesis whenever we encounter another ?. or  when the expression finishes. If there's anything to the right of the pipe, before the next ?., that is passed in as a string into the method.  In this case, the rhs of each expression is not used, because the add method doesn't return anything to merge the rhs into.

## Example 2 Relevant rhs

```JavaScript
oElement.assignGingerly({
    '?.deref|?.querySelector|my-custom-element?.myProp': 14 
})
```

does the equivalent of:

```JavaScript
const lhs = oElement.deref().querySelector('my-custom-element');
lhs['myProp'] = 14;
```

---

## Kiro's Analysis

### Overall Assessment: Implementable with Caveats

This feature is technically implementable but introduces significant complexity. The pipe syntax creates a mini expression language within property keys.

### Syntax Clarification Needed

**Question 1: What about method arguments that aren't strings?**

Current spec says "passed in as a string", but what about:
```javascript
'?.slice|0,5?.length': 0  // Numbers?
'?.filter|x => x > 5?.length': 0  // Functions?
'?.map|JSON.parse?.length': 0  // References?
```

**Recommendation**: 
- Keep it simple: only support string literals
- If you need complex arguments, use regular JavaScript
- Document this limitation clearly

**Question 2: Multiple arguments?**

```javascript
'?.substring|5,10?.length': 0  // How to parse "5,10"?
'?.addEventListener|click,handler': 0  // What about commas in strings?
```

**Recommendation**:
- Support comma-separated arguments: `'method|arg1,arg2,arg3'`
- Parse as strings, trim whitespace
- No support for complex expressions
- Example: `'?.substring|5,10'` → `obj.substring('5', '10')`

**Question 3: What if the method doesn't exist?**

```javascript
'?.nonExistentMethod|arg?.prop': 14
```

Should this:
- Throw an error?
- Silently skip?
- Create the property anyway?

**Recommendation**: Throw a descriptive error to catch typos early.

### Parsing Challenges

**Challenge 1: Ambiguity with existing syntax**

The pipe `|` character could conflict with:
- Future JavaScript syntax
- Template literal expressions
- Bitwise OR operations (though unlikely in property keys)

**Mitigation**: This is acceptable since we're in string keys, not actual JavaScript expressions.

**Challenge 2: Nested pipes**

```javascript
'?.method1|arg1?.method2|arg2?.prop': value
```

This should work naturally with the proposed parsing, but needs careful testing.

**Challenge 3: Escaping**

What if you need a literal pipe character in an argument?
```javascript
'?.method|arg|with|pipes': value  // How to parse?
```

**Recommendation**: 
- Don't support escaping initially
- If needed later, use backslash: `'?.method|arg\|with\|pipes'`
- Document that pipe characters in arguments aren't supported

### Implementation Sketch

```typescript
interface PipeSegment {
  property: string;
  methodCall?: {
    args: string[];
  };
}

function parsePipePath(path: string): PipeSegment[] {
  // Split by ?. to get segments
  const segments = path.split('?.').filter(s => s.length > 0);
  
  return segments.map(segment => {
    const pipeIndex = segment.indexOf('|');
    
    if (pipeIndex === -1) {
      // No pipe - just a property access
      return { property: segment };
    }
    
    // Has pipe - it's a method call
    const property = segment.substring(0, pipeIndex);
    const argsString = segment.substring(pipeIndex + 1);
    const args = argsString.split(',').map(arg => arg.trim());
    
    return {
      property,
      methodCall: { args }
    };
  });
}

function evaluatePipePath(target: any, segments: PipeSegment[]): any {
  let current = target;
  
  for (const segment of segments) {
    if (segment.methodCall) {
      // It's a method call
      const method = current[segment.property];
      
      if (typeof method !== 'function') {
        throw new Error(`Property '${segment.property}' is not a function`);
      }
      
      current = method.apply(current, segment.methodCall.args);
    } else {
      // It's a property access
      current = current[segment.property];
    }
    
    if (current === undefined || current === null) {
      throw new Error(`Cannot access property on ${current}`);
    }
  }
  
  return current;
}

// Usage in assignGingerly:
if (isPipePath(key)) {
  const path = parsePipePath(key);
  const target = evaluatePipePath(obj, path.slice(0, -1));
  const lastSegment = path[path.length - 1];
  
  if (lastSegment.methodCall) {
    // Last segment is a method call - execute it, ignore RHS
    const method = target[lastSegment.property];
    method.apply(target, lastSegment.methodCall.args);
  } else {
    // Last segment is a property - assign RHS to it
    target[lastSegment.property] = value;
  }
}
```

### Concerns and Considerations

**Concern 1: Side Effects**

This feature explicitly introduces side effects (method calls) into what's supposed to be declarative property assignment. This is a philosophical shift.

**Mitigation**: 
- Document clearly that pipe expressions have side effects
- Consider if this belongs in assignGingerly or a separate utility
- Maybe call it `assignWithPipes()` or `assignImperatively()`?

**Concern 2: Debugging**

When a pipe expression fails, error messages could be cryptic:
```javascript
'?.deref|?.querySelector|.my-element?.classList?.add|active': 0
// Error: Cannot read property 'classList' of null
// Which part failed? deref? querySelector? classList?
```

**Mitigation**:
- Provide detailed error messages with the full path
- Show which segment failed
- Include the original key in error messages

**Concern 3: Type Safety**

TypeScript won't be able to type-check these string expressions at all.

**Mitigation**: 
- Document this limitation
- Provide runtime validation
- Consider a builder API for type-safe pipe expressions

**Concern 4: Performance**

Parsing and evaluating pipe expressions on every assignGingerly call could be slow.

**Mitigation**:
- Cache parsed pipe paths (WeakMap keyed by string)
- Only parse once per unique key string
- Benchmark to ensure acceptable performance

**Concern 5: Return Value Handling**

What if a method returns `undefined` or `null`?
```javascript
'?.querySelector|.nonexistent?.classList?.add|active': 0
// querySelector returns null - should this throw or skip?
```

**Recommendation**: Throw an error to catch issues early, similar to optional chaining behavior.

### Alternative Syntax Considerations

**Alternative 1: Use `()` instead of `|`**
```javascript
'?.classList?.add(myClass)': 0
```
- Pros: More familiar JavaScript syntax
- Cons: Harder to parse, conflicts with property names containing parentheses

**Alternative 2: Use `->` (arrow)**
```javascript
'?.classList?.add->myClass': 0
```
- Pros: Visually distinct, suggests "passing to"
- Cons: Two characters, less common

**Alternative 3: Use `@` (at)**
```javascript
'?.classList?.add@myClass': 0
```
- Pros: Single character, visually distinct
- Cons: Used for decorators in TypeScript

**Recommendation**: Stick with `|` - it's the best option and has precedent in Unix pipes.

### Edge Cases to Test

1. **Empty arguments**: `'?.method|?.prop': value`
2. **Multiple arguments**: `'?.method|arg1,arg2,arg3?.prop': value`
3. **Whitespace in arguments**: `'?.method| arg1 , arg2 ?.prop': value`
4. **Method returns undefined**: `'?.methodReturningUndefined|?.prop': value`
5. **Method throws error**: `'?.methodThatThrows|?.prop': value`
6. **Chained method calls**: `'?.method1|arg1?.method2|arg2?.method3|arg3': value`
7. **Method on primitive**: `'?.toString|?.length': value` (should work)
8. **Non-existent method**: `'?.nonExistent|arg?.prop': value`
9. **Method with no return value**: `'?.classList?.add|myClass': value` (RHS ignored)
10. **Mixing pipes with other commands**: `'?.method|arg?.prop +=': value`

### Recommendations

1. **Start simple**: Only support string arguments, no escaping
2. **Clear errors**: Provide detailed error messages showing which segment failed
3. **Document side effects**: Make it clear this is imperative, not declarative
4. **Cache parsing**: Use WeakMap to cache parsed pipe paths
5. **Test thoroughly**: Cover all edge cases above
6. **Consider naming**: Maybe `assignWithPipes()` to make the feature explicit?
7. **Limit scope**: Don't support pipes in commands like `+=`, `-=`, etc. (too complex)

### Verdict: Implementable but Complex

This feature is implementable and could be useful for certain patterns (like classList manipulation). However:

- It adds significant complexity to the parser
- It introduces side effects into declarative syntax
- It creates a mini expression language
- Error handling and debugging will be challenging
- TypeScript support will be limited

**Suggested approach**: 
- Implement as a separate opt-in feature or function
- Keep the implementation simple (string args only)
- Provide excellent error messages
- Document the side effects clearly
- Consider if the use cases justify the complexity

**Alternative**: For the classList example, users could just do:
```javascript
element.classList.add('myClass');
element.part.add('myPart');
assignGingerly(element, { /* other properties */ });
```

Is the syntactic sugar worth the added complexity?

---

## Human's Response

Good points have been raised.  Due to the added complexity and relatively limited use cases, and the fact that we've gone out of our way to avoid asynchronous operations in assign-gingerly, which would block the ability to load such complexity on demand without enlarging the footprint, I'm very open to the idea of creating  separate module, assignGingerlyExt that adds in support for pipes.  Maybe it could separate the expressions that contain a | from those that don't, and reuse assignGingerly for those expressions that don't contain |'s?

I don't like the idea of using the name "assignImperatively", because the expectation of use is that this is only used for basic assignment type situations, it's just that the assigning requires called some side-effect free methods to do the job.  Yes, it opens a potential can of worms, but I think limiting to a single string argument (at most) would greatly reduce the risk.

## Alternative proposal:

## Example 1 Adding to the classlist and the part token lists

```JavaScript
oElement.assignGingerly({
    '?.classList?.add': 'myClass',
    '?.part?.add': 'myPart',
}, {withMethods: ['add']});
```

Anywhere a "property" matches one of the methods, instead of doing ?.add?.myClass it would do ?.add('myClass'), ?.add('myPart').  If add doesn't exist as a method, it should just skip silently.

## Example 2 Relevant rhs

```JavaScript
oElement.assignGingerly({
    '?.deref?.querySelector?.my-custom-element?.myProp': 14 
}, {withMethods: ['deref', 'querySelector']})
```

does the equivalent of:

```JavaScript
const lhs = oElement?.deref()?.querySelector('my-custom-element')?.myProp = 14;
```

Could this be done with a small enough footprint that it wouldn't enlarge assignGingerly very much?

---

## Kiro's Response to Alternative Proposal

### Excellent Simplification!

This alternative is **much better** than the pipe syntax. It's cleaner, more explicit, and significantly simpler to implement. Here's my analysis:

### Advantages of the `withMethods` Approach

1. **Explicit opt-in**: The `withMethods` array makes it clear which properties should be treated as methods
2. **No parsing complexity**: No need to parse pipe characters or handle escaping
3. **Smaller footprint**: Can be implemented with minimal code addition
4. **Better error messages**: Easy to provide clear errors when methods don't exist
5. **Type-safe potential**: TypeScript could potentially type-check the method names
6. **Predictable behavior**: No ambiguity about what gets called vs what gets assigned

### Implementation Feasibility

**Yes, this can be done with a very small footprint!** Here's why:

```typescript
// Add to IAssignGingerlyOptions
interface IAssignGingerlyOptions {
  registry?: typeof EnhancementRegistry | EnhancementRegistry;
  bypassChecks?: boolean;
  withMethods?: string[];  // <-- Just add this!
}

// In the nested path handling, add a check:
if (isNestedPath(key)) {
  const pathParts = parsePath(key);
  const lastKey = pathParts[pathParts.length - 1];
  const parent = ensureNestedPath(target, pathParts);
  
  // NEW: Check if lastKey is in withMethods
  if (options?.withMethods?.includes(lastKey)) {
    const method = parent[lastKey];
    if (typeof method === 'function') {
      // Call the method with value as argument
      method.call(parent, value);
      continue; // Skip normal assignment
    }
    // If not a function, silently skip (as requested)
    continue;
  }
  
  // ... rest of existing logic
}
```

**Estimated code addition**: ~15-20 lines of code. Very minimal!

### Clarifications Needed

**Question 1: What about non-string values?**

```javascript
assignGingerly(obj, {
  '?.classList?.add': ['class1', 'class2'],  // Array?
  '?.setAttribute': { name: 'data-id', value: '123' },  // Object?
  '?.scrollTo': 100,  // Number?
}, { withMethods: ['add', 'setAttribute', 'scrollTo'] });
```

**Recommendation**: 
- Support any value type, pass it directly to the method
- For arrays, pass the array as a single argument (not spread)
- Document that it's the developer's responsibility to match method signatures

**Question 2: Multiple arguments?**

Your Example 2 shows `querySelector('my-custom-element')` where `'my-custom-element'` is the next path segment. This is clever! But what about methods that need multiple arguments?

```javascript
assignGingerly(obj, {
  '?.setAttribute?.data-id?.123': 0  // setAttribute needs 2 args
}, { withMethods: ['setAttribute'] });
```

**Options:**

A. **Use the value as arguments** (if it's an array):
```javascript
assignGingerly(obj, {
  '?.setAttribute': ['data-id', '123']
}, { withMethods: ['setAttribute'] });
// Calls: obj.setAttribute('data-id', '123')
```

B. **Use next path segment as first arg, value as second**:
```javascript
assignGingerly(obj, {
  '?.setAttribute?.data-id': '123'
}, { withMethods: ['setAttribute'] });
// Calls: obj.setAttribute('data-id', '123')
```

C. **Only support single-argument methods**:
```javascript
// Just don't support multi-arg methods
```

**Recommendation**: Start with Option A (array spreading) as it's most flexible:
```javascript
if (Array.isArray(value)) {
  method.apply(parent, value);  // Spread array as arguments
} else {
  method.call(parent, value);   // Single argument
}
```

**Question 3: Method chaining?**

In Example 2, you have two methods in sequence: `deref` then `querySelector`. How does this work exactly?

```javascript
'?.deref?.querySelector?.my-custom-element?.myProp': 14
```

Should this:
1. Call `deref()` with no arguments
2. Call `querySelector('my-custom-element')` on the result
3. Assign `14` to `myProp` on that result

**Clarification needed**: 
- If a method is in `withMethods` and has no value to pass, call it with no arguments?
- The next path segment becomes the argument?
- How do we know when to stop consuming path segments as arguments?

**Suggested behavior**:
```javascript
// Each method in withMethods consumes the NEXT path segment as its argument
'?.deref?.querySelector?.my-custom-element?.myProp': 14

// Evaluates as:
obj.deref()  // No next segment, called with no args
   .querySelector('my-custom-element')  // Next segment is the arg
   .myProp = 14  // Final assignment
```

But this creates ambiguity:
```javascript
'?.querySelector?.myElement?.classList?.add?.myClass': 0

// Is this:
// A) querySelector('myElement').classList.add('myClass')
// B) querySelector('myElement.classList.add.myClass')
```

**Recommendation**: Keep it simple - methods only use the RHS value, not path segments:

```javascript
assignGingerly(obj, {
  '?.deref': undefined,  // Call with no args
  '?.querySelector': 'my-custom-element',  // Call with this arg
  '?.myProp': 14  // Normal assignment
}, { withMethods: ['deref', 'querySelector'] });

// Or chain them:
assignGingerly(
  assignGingerly(obj, {
    '?.deref': undefined
  }, { withMethods: ['deref'] }),
  {
    '?.querySelector': 'my-custom-element',
    '?.myProp': 14
  },
  { withMethods: ['querySelector'] }
);
```

This is more verbose but much clearer and easier to implement.

### Proposed Implementation

```typescript
interface IAssignGingerlyOptions {
  registry?: typeof EnhancementRegistry | EnhancementRegistry;
  bypassChecks?: boolean;
  /**
   * List of property names that should be treated as methods to call
   * rather than properties to assign.
   * 
   * When a path segment matches a name in this array:
   * - If the property is a function, call it with the RHS value as argument
   * - If the RHS value is an array, spread it as multiple arguments
   * - If the property is not a function, silently skip
   * 
   * Example:
   * assignGingerly(element, {
   *   '?.classList?.add': 'myClass'
   * }, { withMethods: ['add'] });
   * // Calls: element.classList.add('myClass')
   */
  withMethods?: string[];
}

// In the nested path handling:
if (isNestedPath(key)) {
  const pathParts = parsePath(key);
  const lastKey = pathParts[pathParts.length - 1];
  const parent = ensureNestedPath(target, pathParts);
  
  // Check if lastKey is a method to call
  if (options?.withMethods?.includes(lastKey)) {
    const method = parent[lastKey];
    if (typeof method === 'function') {
      // Call the method with value as argument(s)
      if (Array.isArray(value)) {
        method.apply(parent, value);
      } else {
        method.call(parent, value);
      }
    }
    // Silently skip if not a function (as requested)
    continue;
  }
  
  // ... rest of existing logic for normal assignment
}

// Also handle non-nested paths:
if (options?.withMethods?.includes(key)) {
  const method = target[key];
  if (typeof method === 'function') {
    if (Array.isArray(value)) {
      method.apply(target, value);
    } else {
      method.call(target, value);
    }
  }
  continue;
}
```

### Footprint Estimate

- **Code addition**: ~25-30 lines
- **Type definition**: 1 line
- **No new dependencies**: Uses existing parsing logic
- **No performance impact**: Simple array lookup

**Verdict: Very small footprint!**

### Recommendations for This Approach

1. **Keep it simple**: Methods only use RHS value, not path segments
2. **Support array spreading**: If value is array, spread as arguments
3. **Silent skip**: If property isn't a function, skip silently (as you suggested)
4. **Document clearly**: Explain that this is for side-effect-free methods
5. **Add to both nested and non-nested paths**: Consistency
6. **Consider caching**: Convert `withMethods` array to Set for O(1) lookup

### Example Usage Patterns

```javascript
// Simple method call
assignGingerly(element, {
  '?.classList?.add': 'active'
}, { withMethods: ['add'] });

// Multiple arguments via array
assignGingerly(element, {
  '?.setAttribute': ['data-id', '123']
}, { withMethods: ['setAttribute'] });

// Multiple method calls
assignGingerly(element, {
  '?.classList?.add': 'active',
  '?.classList?.remove': 'inactive',
  '?.part?.add': 'custom-part'
}, { withMethods: ['add', 'remove'] });

// Mix methods and assignments
assignGingerly(element, {
  '?.classList?.add': 'active',
  '?.dataset?.userId': '123',
  '?.style?.height': '100px'
}, { withMethods: ['add'] });
```

### Final Verdict

**This alternative is excellent!** It:
- Solves the use cases you identified
- Has minimal implementation complexity
- Adds very little code (~25-30 lines)
- Is explicit and predictable
- Avoids the parsing complexity of pipes
- Maintains the declarative feel

**Recommendation: Implement this approach directly in assignGingerly, not as a separate module.** The footprint is small enough that it doesn't warrant a separate module, and having it built-in makes it more discoverable and easier to use.

The only remaining question is how to handle method chaining (Example 2). I'd recommend keeping it simple and requiring separate calls for chained methods, or clarifying exactly how path segments should be consumed as arguments.

---

## Human Response to clarification requests

I think we are fully on the same page as far as when the lastKey is a method:


```JavaScript
// In the nested path handling:
if (isNestedPath(key)) {
  const pathParts = parsePath(key);
  const lastKey = pathParts[pathParts.length - 1];
  const parent = ensureNestedPath(target, pathParts);
  
  // Check if lastKey is a method to call
  if (options?.withMethods?.includes(lastKey)) {
    const method = parent[lastKey];
    if (typeof method === 'function') {
      // Call the method with value as argument(s)
      if (Array.isArray(value)) {
        method.apply(parent, value);
      } else {
        method.call(parent, value);
      }
    }
    // Silently skip if not a function (as requested)
    continue;
  }
  
  // ... rest of existing logic for normal assignment
}
```

I think maybe the withMethods can accept either an array of strings, or a Set of strings.  If an array is passed in, it is converted internally to a set for the performance optimization.

This should allow the rhs (value) to be things other than strings, including arrays and numbers.

As far as the ambiguity of chained methods within the lhs that isn't the last token of the lhs:

We should only support passing in at most one string parameter into the method.  If two consecutive "properties" are both listed as methods, then the first "property" is evaluated with no parameters.  If only the first is listed as a method, then the second property is passed into the first.  So this is out of scope (permanently):

```JavaScript
assignGingerly(obj, {
  '?.setAttribute?.data-id?.123': 0  // setAttribute needs 2 args
}, { withMethods: ['setAttribute'] });
```

This is supported:

```JavaScript
assignGingerly(oElementRef, {
    '?.deref?.getRootNode?.querySelector?.myElement?.classList?.add': 'myClass'
}, {withMethods: ['deref', 'getRootNode', 'querySelector', 'add']})

```

would do:

```JavaScript
oElementRef?.deref()?.getRootNode()?.querySelector('myElement')?.classList?.add('myClass');
```

If the developer forgets to add one of the methods, for example:

```JavaScript
assignGingerly(oElementRef, {
    '?.deref?.getRootNode?.querySelector?.myElement?.classList?.add': 'myClass'
}, {withMethods: ['deref', 'getRootNode', 'add']})

```

then the code would fail silently (garbage in, garbage out):

```JavaScript
oElementRef?.deref()?.getRootNode('querySelector')?.myElement?.classList?.add('myClass');
```

---

## Kiro's Final Analysis - No Remaining Ambiguities!

Perfect! The specification is now crystal clear. Here's my understanding:

### Confirmed Behavior

**1. Method Detection:**
- Check if `lastKey` is in `withMethods` (converted to Set for O(1) lookup)
- If yes and it's a function, call it with the RHS value
- If yes but not a function, silently skip
- If no, proceed with normal assignment

**2. Chained Methods (non-last segments):**
- If consecutive properties are both in `withMethods`: first is called with no args
- If only first is in `withMethods`: second property name is passed as string argument
- Maximum one string parameter per method call

**3. Value Types:**
- Strings: passed as-is
- Arrays: spread as multiple arguments via `apply()`
- Numbers/other types: passed as-is
- This allows flexibility for different method signatures

**4. Error Handling:**
- Silent failure if method not in `withMethods` (garbage in, garbage out)
- This is acceptable - developer responsibility to list all methods

### Implementation Clarity

The chained method logic is now clear:

```typescript
function evaluateNestedPathWithMethods(
  target: any,
  pathParts: string[],
  value: any,
  withMethods: Set<string>
): any {
  let current = target;
  
  for (let i = 0; i < pathParts.length - 1; i++) {
    const part = pathParts[i];
    const nextPart = pathParts[i + 1];
    
    if (withMethods.has(part)) {
      const method = current[part];
      if (typeof method === 'function') {
        // Check if next part is also a method
        if (withMethods.has(nextPart)) {
          // Both are methods - call first with no args
          current = method.call(current);
        } else {
          // Only current is method - call with next part as arg
          current = method.call(current, nextPart);
          i++; // Skip next part since we consumed it
        }
      } else {
        // Not a function - just access property
        current = current[part];
      }
    } else {
      // Not a method - normal property access
      current = current[part];
    }
  }
  
  // Handle last segment
  const lastKey = pathParts[pathParts.length - 1];
  if (withMethods.has(lastKey)) {
    const method = current[lastKey];
    if (typeof method === 'function') {
      if (Array.isArray(value)) {
        method.apply(current, value);
      } else {
        method.call(current, value);
      }
    }
    // Silently skip if not a function
  } else {
    // Normal assignment
    current[lastKey] = value;
  }
  
  return current;
}
```

### Examples Validated

**Example 1 - Simple method call:**
```javascript
assignGingerly(element, {
  '?.classList?.add': 'myClass'
}, { withMethods: ['add'] });
// ✓ element.classList.add('myClass')
```

**Example 2 - Chained methods:**
```javascript
assignGingerly(elementRef, {
  '?.deref?.getRootNode?.querySelector?.myElement?.classList?.add': 'myClass'
}, { withMethods: ['deref', 'getRootNode', 'querySelector', 'add'] });
// ✓ elementRef.deref().getRootNode().querySelector('myElement').classList.add('myClass')
```

**Example 3 - Missing method in list:**
```javascript
assignGingerly(elementRef, {
  '?.deref?.getRootNode?.querySelector?.myElement?.classList?.add': 'myClass'
}, { withMethods: ['deref', 'getRootNode', 'add'] });
// ✓ elementRef.deref().getRootNode('querySelector').myElement.classList.add('myClass')
// Silent failure - developer's responsibility
```

**Example 4 - Array arguments:**
```javascript
assignGingerly(element, {
  '?.setAttribute': ['data-id', '123']
}, { withMethods: ['setAttribute'] });
// ✓ element.setAttribute('data-id', '123')
```

**Example 5 - Mix methods and assignments:**
```javascript
assignGingerly(element, {
  '?.classList?.add': 'active',
  '?.dataset?.userId': '123'
}, { withMethods: ['add'] });
// ✓ element.classList.add('active')
// ✓ element.dataset.userId = '123'
```

### No Remaining Ambiguities!

All questions have been answered:
- ✅ How to handle non-string values: Pass as-is, spread arrays
- ✅ Multiple arguments: Use arrays with `apply()`
- ✅ Method chaining: Consecutive methods = no args, otherwise consume next segment
- ✅ Missing methods: Silent failure (garbage in, garbage out)
- ✅ Performance: Convert array to Set internally
- ✅ Scope: Single string parameter max, no complex multi-arg support

### Implementation Estimate

- **Code addition**: ~40-50 lines (slightly more than initial estimate due to chaining logic)
- **Complexity**: Medium (chaining logic requires careful index management)
- **Performance**: O(1) method lookup with Set
- **Breaking changes**: None (purely additive)

### Ready to Implement!

The specification is complete and unambiguous. This feature:
- Solves real use cases (classList, querySelector chains)
- Has acceptable complexity
- Maintains backward compatibility
- Provides clear, predictable behavior
- Has reasonable footprint

**Recommendation: Proceed with implementation!**






