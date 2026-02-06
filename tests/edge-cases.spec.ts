import { test, expect } from '@playwright/test';
import assignGingerly from '../assignGingerly.js';

test.describe('assignGingerly - Edge Cases', () => {
  test('should handle arrays as values', () => {
    const target = {};
    assignGingerly(target, {
      items: [1, 2, 3],
      names: ['Alice', 'Bob']
    });
    
    expect(target).toEqual({
      items: [1, 2, 3],
      names: ['Alice', 'Bob']
    });
  });

  test('should not treat arrays as objects to recurse into', () => {
    const target = {};
    assignGingerly(target, {
      data: [1, 2, { nested: 'value' }]
    });
    
    expect(Array.isArray(target.data)).toBe(true);
    expect(target.data).toEqual([1, 2, { nested: 'value' }]);
  });

  test('should handle numeric values', () => {
    const target = {};
    assignGingerly(target, {
      count: 42,
      price: 19.99,
      zero: 0
    });
    
    expect(target.count).toBe(42);
    expect(target.price).toBe(19.99);
    expect(target.zero).toBe(0);
  });

  test('should handle boolean values', () => {
    const target = {};
    assignGingerly(target, {
      active: true,
      disabled: false
    });
    
    expect(target.active).toBe(true);
    expect(target.disabled).toBe(false);
  });

  test('should handle null and undefined', () => {
    const target = {};
    assignGingerly(target, {
      nullValue: null,
      undefinedValue: undefined
    });
    
    expect(target.nullValue).toBeNull();
    expect(target.undefinedValue).toBeUndefined();
  });

  test('should handle string values', () => {
    const target = {};
    assignGingerly(target, {
      text: 'hello',
      emoji: '🚀',
      empty: ''
    });
    
    expect(target.text).toBe('hello');
    expect(target.emoji).toBe('🚀');
    expect(target.empty).toBe('');
  });

  test('should ignore null as target', () => {
    const result = assignGingerly(null, { test: 'value' });
    expect(result).toBeNull();
  });

  test('should ignore undefined as target', () => {
    const result = assignGingerly(undefined, { test: 'value' });
    expect(result).toBeUndefined();
  });

  test('should handle complex nested structures', () => {
    const target = {};
    assignGingerly(target, {
      app: {
        settings: {
          theme: 'dark',
          language: 'en'
        },
        users: [
          { id: 1, name: 'Alice' },
          { id: 2, name: 'Bob' }
        ]
      }
    });
    
    expect(target.app.settings.theme).toBe('dark');
    expect(target.app.users[0].name).toBe('Alice');
  });

  test('should handle very deeply nested paths', () => {
    const target = {};
    assignGingerly(target, {
      '?.a?.b?.c?.d?.e?.f?.g?.h': 'deep-value'
    });
    
    expect(target.a.b.c.d.e.f.g.h).toBe('deep-value');
  });

  test('should handle special characters in nested paths', () => {
    const target = {};
    assignGingerly(target, {
      '?.style?.background-color': '#ff0000'
    });
    
    expect(target.style['background-color']).toBe('#ff0000');
  });

  test('should maintain object prototype chain for primitives', () => {
    const target = {};
    const source = {
      str: 'text',
      num: 123
    };
    
    assignGingerly(target, source);
    
    expect(typeof target.str).toBe('string');
    expect(typeof target.num).toBe('number');
  });

  test('should handle reassignment of values', () => {
    const target = { value: 'initial' };
    
    assignGingerly(target, { value: 'first' });
    expect(target.value).toBe('first');
    
    assignGingerly(target, { value: 'second' });
    expect(target.value).toBe('second');
  });

  test('should handle empty nested paths', () => {
    const target = { existing: 'value' };
    assignGingerly(target, {});
    
    expect(target).toEqual({ existing: 'value' });
  });

  test('should handle sequential calls', () => {
    const target = {};
    
    assignGingerly(target, { a: 1 });
    assignGingerly(target, { b: 2 });
    assignGingerly(target, { '?.c?.d': 3 });
    
    expect(target).toEqual({
      a: 1,
      b: 2,
      c: { d: 3 }
    });
  });
});
