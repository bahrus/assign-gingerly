import { test, expect } from '@playwright/test';
import assignGingerly from '../assignGingerly';

test.describe('!delete command', () => {
  test('should immediately delete an existing property with RHS=0', () => {
    const obj = { a: 1, b: 2 };
    assignGingerly(obj, { '!delete ?.a': 0 });
    expect(obj).toEqual({ b: 2 });
  });

  test('should delete only the last property in nested path with RHS=0', () => {
    const obj = {
      a: {
        b: {
          c: true,
          d: 'hello'
        }
      }
    };
    assignGingerly(obj, { '!delete ?.a?.b?.c': 0 });
    expect(obj).toEqual({
      a: {
        b: {
          d: 'hello'
        }
      }
    });
  });

  test('should not create intermediate paths when deleting', () => {
    const obj = { a: 1 };
    assignGingerly(obj, { '!delete ?.x?.y?.z': 0 });
    expect(obj).toEqual({ a: 1 });
  });

  test('should skip delete if any intermediate path does not exist', () => {
    const obj = {
      a: {
        b: {
          c: true
        }
      }
    };
    assignGingerly(obj, { '!delete ?.a?.x?.c': 0 });
    expect(obj).toEqual({
      a: {
        b: {
          c: true
        }
      }
    });
  });

  test('should delay delete with RHS > 0', ({ }, t) => {
    t.setTimeout(100);
    const obj = { a: 1, b: 2 };
    assignGingerly(obj, { '!delete ?.a': 20 });
    expect(obj).toEqual({ a: 1, b: 2 });
  });

  test('should delete after setTimeout delay', async ({ }, t) => {
    t.setTimeout(100);
    const obj = { a: 1, b: 2 };
    assignGingerly(obj, { '!delete ?.a': 30 });
    expect(obj).toEqual({ a: 1, b: 2 });
    
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(obj).toEqual({ b: 2 });
  });

  test('should handle multiple deletes with different delays', async ({ }, t) => {
    t.setTimeout(150);
    const obj = {
      a: {
        b: {
          c: true,
          d: 'hello'
        }
      }
    };
    assignGingerly(obj, {
      '!delete ?.a?.b?.c': 0,
      '!delete ?.a?.b': 40
    });
    
    expect(obj).toEqual({
      a: {
        b: {
          d: 'hello'
        }
      }
    });
    
    await new Promise(resolve => setTimeout(resolve, 60));
    expect(obj).toEqual({
      a: {}
    });
  });

  test('should not throw if path does not exist and RHS=0', () => {
    const obj = { a: 1 };
    expect(() => {
      assignGingerly(obj, { '!delete ?.missing?.property': 0 });
    }).not.toThrow();
    expect(obj).toEqual({ a: 1 });
  });

  test('should delete from deeply nested structure', () => {
    const obj = {
      level1: {
        level2: {
          level3: {
            level4: {
              target: 'delete me',
              keep: 'keep me'
            }
          }
        }
      }
    };
    assignGingerly(obj, { '!delete ?.level1?.level2?.level3?.level4?.target': 0 });
    expect(obj).toEqual({
      level1: {
        level2: {
          level3: {
            level4: {
              keep: 'keep me'
            }
          }
        }
      }
    });
  });

  test('should be case sensitive', () => {
    const obj = { a: 1 };
    assignGingerly(obj, { '!DELETE ?.a': 0 }); // Wrong case, treated as regular nested key
    // This will be handled as a nested path assignment, not a delete command
    expect('a' in obj).toBe(true); // Original 'a' still exists
  });

  test('should require exactly one space after !delete', () => {
    const obj = { a: 1 };
    assignGingerly(obj, { '!delete  ?.a': 0 }); // Two spaces, treated as regular nested key
    // This will be handled as a nested path assignment, not a delete command
    expect('a' in obj).toBe(true); // Original 'a' still exists
  });

  test('should skip if intermediate path is null', () => {
    const obj = {
      a: null
    };
    assignGingerly(obj, { '!delete ?.a?.b': 0 });
    expect(obj).toEqual({ a: null });
  });

  test('should skip if intermediate path is not an object', () => {
    const obj = {
      a: 'string'
    };
    assignGingerly(obj, { '!delete ?.a?.b': 0 });
    expect(obj).toEqual({ a: 'string' });
  });

  test('should work with numeric property names', () => {
    const obj = {
      a: {
        0: 'first',
        1: 'second'
      }
    };
    assignGingerly(obj, { '!delete ?.a?.0': 0 });
    expect(obj).toEqual({
      a: {
        1: 'second'
      }
    });
  });

  test('should work with mixed content types', () => {
    const obj = {
      data: {
        strings: { name: 'test', value: 'remove' },
        numbers: { x: 1, y: 2 }
      }
    };
    assignGingerly(obj, { '!delete ?.data?.strings?.value': 0 });
    expect(obj).toEqual({
      data: {
        strings: { name: 'test' },
        numbers: { x: 1, y: 2 }
      }
    });
  });

  test('should handle delete in README example', async ({ }, t) => {
    t.setTimeout(100);
    const obj = {
      a: {
        b: {
          c: true,
          d: 'hello'
        }
      }
    };
    assignGingerly(obj, {
      '!delete ?.a?.b?.c': 0,
      '!delete ?.a?.b': 20
    });
    expect(obj).toEqual({
      a: { b: { d: 'hello' } },
    });

    await new Promise(resolve => setTimeout(resolve, 30));
    expect(obj).toEqual({
      a: {}
    });
  });

  test('should delete only the specified final property even with longer chains', () => {
    const obj = {
      a: {
        b: {
          c: {
            d: 'delete',
            e: 'keep'
          },
          f: 'keep'
        }
      }
    };
    assignGingerly(obj, { '!delete ?.a?.b?.c?.d': 0 });
    expect(obj).toEqual({
      a: {
        b: {
          c: {
            e: 'keep'
          },
          f: 'keep'
        }
      }
    });
  });

  test('should allow error if RHS is not a valid number', () => {
    const obj = { a: 1 };
    // Should execute without validation - browser setTimeout will handle the non-numeric value
    assignGingerly(obj, { '!delete ?.a': 'invalid' as any });
    expect(obj).toEqual({ a: 1 });
  });

  test('should delete with zero delay (immediate)', () => {
    const obj = { a: 1, b: 2, c: 3 };
    assignGingerly(obj, {
      '!delete ?.a': 0,
      '!delete ?.b': 0
    });
    expect(obj).toEqual({ c: 3 });
  });

  test('should not affect other properties during delete', () => {
    const obj = {
      delete_me: true,
      keep1: { nested: 'value' },
      keep2: [1, 2, 3]
    };
    assignGingerly(obj, { '!delete ?.delete_me': 0 });
    expect(obj).toEqual({
      keep1: { nested: 'value' },
      keep2: [1, 2, 3]
    });
  });

  test('should handle empty path (single property)', () => {
    const obj = { prop: 'value' };
    assignGingerly(obj, { '!delete ?.prop': 0 });
    expect(obj).toEqual({});
  });

  test('should skip delete of non-existent top-level property', () => {
    const obj = { a: 1 };
    assignGingerly(obj, { '!delete ?.nonexistent': 0 });
    expect(obj).toEqual({ a: 1 });
  });

  test('should work with symbol keys present', () => {
    const sym = Symbol.for('test');
    const obj = {
      a: { b: 'delete me' },
      [sym]: 'symbol value'
    };
    assignGingerly(obj, { '!delete ?.a?.b': 0 });
    expect(obj).toEqual({
      a: {},
      [sym]: 'symbol value'
    });
  });

  test('should execute multiple deletes in sequence', async ({ }, t) => {
    t.setTimeout(200);
    const obj = {
      x: { y: { z1: 1, z2: 2, z3: 3 } }
    };
    assignGingerly(obj, {
      '!delete ?.x?.y?.z1': 0,
      '!delete ?.x?.y?.z2': 10,
      '!delete ?.x?.y?.z3': 20
    });
    
    expect(obj).toEqual({ x: { y: { z2: 2, z3: 3 } } });
    
    await new Promise(resolve => setTimeout(resolve, 15));
    expect(obj).toEqual({ x: { y: { z3: 3 } } });
    
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(obj).toEqual({ x: { y: {} } });
  });

  test('should preserve object structure after delete', () => {
    const obj = {
      users: {
        user1: { name: 'Alice', age: 30 },
        user2: { name: 'Bob', age: 25 }
      }
    };
    assignGingerly(obj, { '!delete ?.users?.user1?.age': 0 });
    expect(obj).toEqual({
      users: {
        user1: { name: 'Alice' },
        user2: { name: 'Bob', age: 25 }
      }
    });
  });

  test('should not delete if path partially exists but diverges', () => {
    const obj = {
      a: {
        b: 'not an object'
      }
    };
    assignGingerly(obj, { '!delete ?.a?.b?.c': 0 });
    expect(obj).toEqual({
      a: {
        b: 'not an object'
      }
    });
  });
});
