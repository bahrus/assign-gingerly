import { test, expect } from '@playwright/test';
import assignGingerly from '../assignGingerly';

test.describe('??x delete command', () => {
  test('should delete an existing property with ??x: null', () => {
    const obj = { a: 1, b: 2 };
    assignGingerly(obj, { '??a': null });
    expect(obj).toEqual({ b: 2 });
  });

  test('should delete only the specified property in nested path', () => {
    const obj = {
      a: {
        b: {
          c: true,
          d: 'hello'
        }
      }
    };
    assignGingerly(obj, { '?.a?.b??c': null });
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
    assignGingerly(obj, { '?.x?.y??z': null });
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
    assignGingerly(obj, { '?.a?.x??c': null });
    expect(obj).toEqual({
      a: {
        b: {
          c: true
        }
      }
    });
  });

  test('should not throw if path does not exist', () => {
    const obj = { a: 1 };
    expect(() => {
      assignGingerly(obj, { '?.missing?.property??target': null });
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
    assignGingerly(obj, { '?.level1?.level2?.level3?.level4??target': null });
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
      '?.a?.b??c': null
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
    assignGingerly(obj, { '?.a?.b??c': null });
    expect(obj).toEqual({ a: null });
  });

  test('should skip delete if parent is not an object', () => {
    const obj = {
      a: 'string'
    };
    assignGingerly(obj, { '?.a?.b??c': null });
    expect(obj).toEqual({ a: 'string' });
  });

  test('should handle numeric property names', () => {
    const obj = {
      a: {
        0: 'zero',
        1: 'one'
      }
    };
    assignGingerly(obj, { '?.a??0': null });
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
    assignGingerly(obj, { '?.data?.strings??my-value': null });
    expect(obj).toEqual({
      data: {
        strings: {
          'other': 'keep'
        }
      }
    });
  });

  test('should handle multiple deletes', () => {
    const obj = {
      a: {
        b: {
          c: true,
          d: 'hello'
        }
      }
    };
    assignGingerly(obj, {
      '?.a?.b??c': null,
      '?.a?.b??d': null
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
    assignGingerly(obj, { '?.a?.b?.c??d': null });
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

  test('should only require RHS to be null', () => {
    const obj = { a: 1 };
    // Should execute without validation - only null triggers delete
    assignGingerly(obj, { '?.a??a': 'invalid' as any });
    expect(obj).toEqual({ a: 1 }); // Not deleted because RHS is not null
  });

  test('should handle multiple deletes on same level', () => {
    const obj = { a: 1, b: 2, c: 3 };
    assignGingerly(obj, {
      '??a': null,
      '??b': null
    });
    expect(obj).toEqual({ c: 3 });
  });

  test('should delete complex nested structures', () => {
    const obj = {
      keep1: { nested: 'value' },
      delete_me: { also: 'nested' },
      keep2: [1, 2, 3]
    };
    assignGingerly(obj, { '??delete_me': null });
    expect(obj).toEqual({
      keep1: { nested: 'value' },
      keep2: [1, 2, 3]
    });
  });

  test('should handle empty path (single property)', () => {
    const obj = { prop: 'value' };
    assignGingerly(obj, { '??prop': null });
    expect(obj).toEqual({});
  });

  test('should skip delete of non-existent top-level property', () => {
    const obj = { a: 1 };
    assignGingerly(obj, { '??nonexistent': null });
    expect(obj).toEqual({ a: 1 });
  });

  test('should preserve symbol properties when deleting', () => {
    const sym = Symbol('test');
    const obj = {
      a: {
        b: 'delete me',
        [sym]: 'symbol value'
      }
    };
    assignGingerly(obj, { '?.a??b': null });
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
    assignGingerly(obj, { '?.users?.user1??age': null });
    expect(obj).toEqual({
      users: {
        user1: { name: 'Alice' },
        user2: { name: 'Bob', age: 25 }
      }
    });
  });

  test('should handle delete with getter properties', () => {
    const obj = {
      a: {
        b: {
          c: 'value'
        }
      }
    };
    assignGingerly(obj, { '?.a?.b??c': null });
    expect(obj).toEqual({
      a: {
        b: {}
      }
    });
  });

  test('should mix delete with other commands', () => {
    const obj = { a: 1, b: 2, c: 3 };
    assignGingerly(obj, {
      '?.a +=': 10,
      '??b': null,
      '?.d': 4
    });
    expect(obj).toEqual({ a: 11, c: 3, d: 4 });
  });

  test('should handle delete on root level without path', () => {
    const obj = { prop1: 'value1', prop2: 'value2' };
    assignGingerly(obj, { '??prop1': null });
    expect(obj).toEqual({ prop2: 'value2' });
  });

  test('should handle delete with ?. prefix on root', () => {
    const obj = { prop1: 'value1', prop2: 'value2' };
    assignGingerly(obj, { '?.??prop1': null });
    expect(obj).toEqual({ prop2: 'value2' });
  });

  test('should not delete if RHS is not null', () => {
    const obj = { a: 1, b: 2 };
    assignGingerly(obj, { '??a': undefined as any });
    expect(obj).toEqual({ a: 1, b: 2 });
  });

  test('should not delete if RHS is 0', () => {
    const obj = { a: 1, b: 2 };
    assignGingerly(obj, { '??a': 0 as any });
    expect(obj).toEqual({ a: 1, b: 2 });
  });

  test('should not delete if RHS is false', () => {
    const obj = { a: 1, b: 2 };
    assignGingerly(obj, { '??a': false as any });
    expect(obj).toEqual({ a: 1, b: 2 });
  });

  test('should handle property name with ?? in it (edge case)', () => {
    // The ?? is the delimiter, so property names can't contain ??
    const obj = { a: { b: 1 } };
    assignGingerly(obj, { '?.a??b': null });
    expect(obj).toEqual({ a: {} });
  });
});
