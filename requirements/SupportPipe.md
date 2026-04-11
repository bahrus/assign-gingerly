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
