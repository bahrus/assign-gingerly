import { test, expect } from '@playwright/test';
import assignGingerly from '../assignGingerly';

test.describe('-= delete command', () => {
  test('should delete a single property', () => {
    const obj = { a: 1, b: 2 };
    assignGingerly(obj, { ' -=': 'a' });
    expect(obj).toEqual({ b: 2 });
  });

  test('should delete multiple properties with array', () => {
    const obj = { a: 1, b: 2, c: 3 };
    assignGingerly(obj, { ' -=': ['a', 'b'] });
    expect(obj).toEqual({ c: 3 });
  });

  test('should delete property from nested path', () => {
    const obj = {
      a: {
        b: {
          c: true,
          d: 'hello'
        }
      }
    };
    assignGingerly(obj, { '?.a?.b -=': 'c' });
    expect(obj).toEqual({
      a: {
        b: {
          d: 'hello'
        }
      }
    });
  });

  test('should delete multiple properties from nested path', () => {
    const obj = {
      a: {
        b: {
          c: true,
          d: 'hello',
          e: 'world'
        }
      }
    };
    assignGingerly(obj, { '?.a?.b -=': ['c', 'd'] });
    expect(obj).toEqual({
      a: {
        b: {
          e: 'world'
        }
      }
    });
  });

  test('should not create intermediate paths when deleting', () => {
    const obj = { a: 1 };
    assignGingerly(obj, { '?.x?.y -=': 'z' });
    expect(obj).toEqual({ a: 1 });
  });

  test('should skip delete if parent path does not exist', () => {
    const obj = {
      a: {
        b: {
          c: true
        }
      }
    };
    assignGingerly(obj, { '?.a?.x -=': 'c' });
    expect(obj).toEqual({
      a: {
        b: {
          c: true
        }
      }
    });
  });

  test('should not throw if property does not exist', () => {
    const obj = { a: 1 };
    expect(() => {
      assignGingerly(obj, { ' -=': 'missing' });
    }).not.toThrow();
    expect(obj).toEqual({ a: 1 });
  });

  test('should handle deeply nested delete', () => {
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
    assignGingerly(obj, { '?.level1?.level2?.level3?.level4 -=': 'target' });
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

  test('should handle README example', () => {
    const obj = {
      a: {
        b: {
          c: true,
          d: 'hello'
        }
      }
    };
    assignGingerly(obj, {
      '?.a?.b -=': 'c'
    });
    expect(obj).toEqual({
      a: {
        b: {
          d: 'hello'
        }
      }
    });
  });

  test('should skip delete if parent is null', () => {
    const obj = {
      a: null
    };
    assignGingerly(obj, { '?.a -=': 'b' });
    expect(obj).toEqual({ a: null });
  });

  test('should skip delete if parent is not an object', () => {
    const obj = {
      a: 'string'
    };
    assignGingerly(obj, { '?.a -=': 'b' });
    expect(obj).toEqual({ a: 'string' });
  });

  test('should handle numeric property names', () => {
    const obj = {
      a: {
        0: 'zero',
        1: 'one'
      }
    };
    assignGingerly(obj, { '?.a -=': '0' });
    expect(obj).toEqual({
      a: {
        1: 'one'
      }
    });
  });

  test('should handle property names with special characters', () => {
    const obj = {
      data: {
        strings: {
          'my-value': 'test',
          'other': 'keep'
        }
      }
    };
    assignGingerly(obj, { '?.data?.strings -=': 'my-value' });
    expect(obj).toEqual({
      data: {
        strings: {
          'other': 'keep'
        }
      }
    });
  });

  test('should handle multiple delete operations', () => {
    const obj = {
      a: {
        b: {
          c: true,
          d: 'hello'
        }
      }
    };
    assignGingerly(obj, {
      '?.a?.b -=': 'c'
    });
    assignGingerly(obj, {
      '?.a?.b -=': 'd'
    });
    expect(obj).toEqual({
      a: {
        b: {}
      }
    });
  });

  test('should delete from nested object with other properties', () => {
    const obj = {
      a: {
        b: {
          c: {
            d: 'delete me',
            e: 'keep me'
          }
        }
      }
    };
    assignGingerly(obj, { '?.a?.b?.c -=': 'd' });
    expect(obj).toEqual({
      a: {
        b: {
          c: {
            e: 'keep me'
          }
        }
      }
    });
  });

  test('should handle deleting all properties with array', () => {
    const obj = { a: 1, b: 2, c: 3 };
    assignGingerly(obj, {
      ' -=': ['a', 'b', 'c']
    });
    expect(obj).toEqual({});
  });

  test('should delete complex nested structures', () => {
    const obj = {
      keep1: { nested: 'value' },
      delete_me: { also: 'nested' },
      keep2: [1, 2, 3]
    };
    assignGingerly(obj, { ' -=': 'delete_me' });
    expect(obj).toEqual({
      keep1: { nested: 'value' },
      keep2: [1, 2, 3]
    });
  });

  test('should skip delete of non-existent properties in array', () => {
    const obj = { a: 1, b: 2 };
    assignGingerly(obj, { ' -=': ['a', 'nonexistent', 'b'] });
    expect(obj).toEqual({});
  });

  test('should preserve symbol properties when deleting', () => {
    const sym = Symbol('test');
    const obj = {
      a: {
        b: 'delete me',
        [sym]: 'symbol value'
      }
    };
    assignGingerly(obj, { '?.a -=': 'b' });
    expect(obj).toEqual({
      a: {
        [sym]: 'symbol value'
      }
    });
  });

  test('should handle deleting from object with mixed property types', () => {
    const obj = {
      users: {
        user1: { name: 'Alice', age: 30 },
        user2: { name: 'Bob', age: 25 }
      }
    };
    assignGingerly(obj, { '?.users?.user1 -=': 'age' });
    expect(obj).toEqual({
      users: {
        user1: { name: 'Alice' },
        user2: { name: 'Bob', age: 25 }
      }
    });
  });

  test('should mix delete with other commands', () => {
    const obj = { a: 1, b: 2, c: 3 };
    assignGingerly(obj, {
      '?.a +=': 10,
      ' -=': 'b',
      '?.d': 4
    });
    expect(obj).toEqual({ a: 11, c: 3, d: 4 });
  });

  test('should handle delete on root level', () => {
    const obj = { prop1: 'value1', prop2: 'value2' };
    assignGingerly(obj, { ' -=': 'prop1' });
    expect(obj).toEqual({ prop2: 'value2' });
  });

  test('should handle empty array (no-op)', () => {
    const obj = { a: 1, b: 2 };
    assignGingerly(obj, { ' -=': [] });
    expect(obj).toEqual({ a: 1, b: 2 });
  });

  test('should handle deleting with duplicate property names in array', () => {
    const obj = { a: 1, b: 2, c: 3 };
    assignGingerly(obj, { ' -=': ['a', 'a', 'b'] });
    expect(obj).toEqual({ c: 3 });
  });

  test('should work with very deeply nested paths', () => {
    const obj = {
      a: { b: { c: { d: { e: { f: { g: 'delete', h: 'keep' } } } } } }
    };
    assignGingerly(obj, { '?.a?.b?.c?.d?.e?.f -=': 'g' });
    expect(obj).toEqual({
      a: { b: { c: { d: { e: { f: { h: 'keep' } } } } } }
    });
  });

  test('should handle multiple separate delete operations in one call', () => {
    const obj = {
      section1: { a: 1, b: 2 },
      section2: { c: 3, d: 4 }
    };
    assignGingerly(obj, {
      '?.section1 -=': 'a',
      '?.section2 -=': ['c', 'd']
    });
    expect(obj).toEqual({
      section1: { b: 2 },
      section2: {}
    });
  });

  test('should combine with += on same object', () => {
    const obj = { count: 5, remove: 'me', keep: 'this' };
    assignGingerly(obj, {
      '?.count +=': 10,
      ' -=': 'remove'
    });
    expect(obj).toEqual({ count: 15, keep: 'this' });
  });

  test('should combine with =! on same object', () => {
    const obj = { flag: true, remove: 'me', keep: 'this' };
    assignGingerly(obj, {
      '?.flag =!': '.',
      ' -=': 'remove'
    });
    expect(obj).toEqual({ flag: false, keep: 'this' });
  });
});
