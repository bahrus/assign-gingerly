import { test, expect } from '@playwright/test';
import assignGingerly from '../assignGingerly.js';

test.describe('assignGingerly - Nested Path Assignment', () => {
  test('Example 2: Merging into an existing sub object using ?. notation', async () => {
    // Simulate DOM element
    const oInput = {
      style: {
        height: undefined as any
      }
    };
    
    await assignGingerly(oInput, { '?.style?.height': '15px' });
    
    expect(oInput.style.height).toBe('15px');
  });

  test('Example 3: Deeply nested object creation', async () => {
    const obj = {};
    await assignGingerly(obj, {
      '?.style?.height': '15px',
      '?.a?.b?.c': {
        d: 'hello',
        e: 'world'
      }
    });
    
    expect(obj).toEqual({
      style: { height: '15px' },
      a: {
        b: {
          c: {
            d: 'hello',
            e: 'world'
          }
        }
      }
    });
  });

  test('should create intermediate objects for nested paths', async () => {
    const obj = {};
    await assignGingerly(obj, {
      '?.level1?.level2?.level3': 'value'
    });
    
    expect(obj.level1.level2.level3).toBe('value');
  });

  test('should handle multiple nested paths simultaneously', async () => {
    const obj = {};
    await assignGingerly(obj, {
      '?.path1?.a': 'value1',
      '?.path2?.b': 'value2',
      '?.path3?.c?.d': 'value3'
    });
    
    expect(obj.path1.a).toBe('value1');
    expect(obj.path2.b).toBe('value2');
    expect(obj.path3.c.d).toBe('value3');
  });

  test('should preserve existing nested structures', async () => {
    const obj = {
      existing: {
        nested: 'value'
      }
    };
    
    await assignGingerly(obj, {
      '?.existing?.new': 'added'
    });
    
    expect(obj.existing.nested).toBe('value');
    expect(obj.existing.new).toBe('added');
  });

  test('should handle mixed nested and non-nested keys', async () => {
    const obj = {};
    await assignGingerly(obj, {
      simple: 'value',
      '?.nested?.key': 'nested value',
      another: 'simple value'
    });
    
    expect(obj.simple).toBe('value');
    expect(obj.another).toBe('simple value');
    expect(obj.nested.key).toBe('nested value');
  });

  test('should recursively merge nested objects', async () => {
    const obj = {};
    await assignGingerly(obj, {
      '?.config': {
        setting1: 'value1',
        setting2: 'value2'
      }
    });
    
    expect(obj.config.setting1).toBe('value1');
    expect(obj.config.setting2).toBe('value2');
  });

  test('should handle deeply nested object values', async () => {
    const obj = {};
    await assignGingerly(obj, {
      '?.data?.users': {
        user1: { name: 'Alice', age: 30 },
        user2: { name: 'Bob', age: 25 }
      }
    });
    
    expect(obj.data.users.user1.name).toBe('Alice');
    expect(obj.data.users.user2.age).toBe(25);
  });

  test('should handle overwriting nested values', async () => {
    const obj = {
      config: {
        setting: 'old value'
      }
    };
    
    await assignGingerly(obj, {
      '?.config?.setting': 'new value'
    });
    
    expect(obj.config.setting).toBe('new value');
  });
});
