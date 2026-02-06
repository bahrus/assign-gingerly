import { test, expect } from '@playwright/test';
import assignGingerly, { BaseRegistry } from '../assignGingerly.js';

test.describe('assignGingerly - Basic Functionality', () => {
  test('Example 1: Basic object assignment (like Object.assign)', () => {
    const sourceObj = { hello: 'world' };
    assignGingerly(sourceObj, { hello: 'Venus', foo: 'bar' });
    
    expect(sourceObj).toEqual({
      hello: 'Venus',
      foo: 'bar'
    });
  });

  test('should handle empty source object', () => {
    const target = { existing: 'value' };
    assignGingerly(target, {});
    
    expect(target).toEqual({ existing: 'value' });
  });

  test('should handle multiple key-value pairs', () => {
    const target = {};
    assignGingerly(target, {
      name: 'John',
      age: 30,
      email: 'john@example.com'
    });
    
    expect(target).toEqual({
      name: 'John',
      age: 30,
      email: 'john@example.com'
    });
  });

  test('should preserve existing properties when adding new ones', () => {
    const target = { existing: 'value' };
    assignGingerly(target, { new: 'property' });
    
    expect(target).toEqual({
      existing: 'value',
      new: 'property'
    });
  });

  test('should overwrite existing properties', () => {
    const target = { prop: 'old' };
    assignGingerly(target, { prop: 'new' });
    
    expect(target.prop).toBe('new');
  });

  test('should handle non-object values gracefully', () => {
    const result = assignGingerly(null, { test: 'value' });
    expect(result).toBeNull();
  });

  test('should handle non-object source', () => {
    const target = { existing: 'value' };
    assignGingerly(target, {} as any);
    
    expect(target).toEqual({ existing: 'value' });
  });
});
