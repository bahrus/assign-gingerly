import { test, expect } from '@playwright/test';
import assignGingerly from '../assignGingerly.js';

test.describe('assignGingerly - !inc Command', () => {
  test('should increment existing numeric value', () => {
    const obj = { value: 10 };
    assignGingerly(obj, { '!inc value': 5 });
    
    expect(obj.value).toBe(15);
  });

  test('should increment negative values', () => {
    const obj = { count: 20 };
    assignGingerly(obj, { '!inc count': -5 });
    
    expect(obj.count).toBe(15);
  });

  test('should increment decimal values', () => {
    const obj = { price: 10.5 };
    assignGingerly(obj, { '!inc price': 2.5 });
    
    expect(obj.price).toBe(13);
  });

  test('should handle non-existent path - direct assignment', () => {
    const obj = { a: { b: {} } };
    assignGingerly(obj, { '!inc a.b.c': 5 });
    
    expect(obj.a.b.c).toBe(5);
  });

  test('should handle non-existent path with nested notation', () => {
    const obj = {};
    assignGingerly(obj, { '!inc ?.x?.y?.z': 10 });
    
    expect(obj.x.y.z).toBe(10);
  });

  test('should create intermediate nested structures', () => {
    const obj = {};
    assignGingerly(obj, { '!inc ?.a?.b?.c': 7 });
    
    expect(obj).toEqual({
      a: {
        b: {
          c: 7
        }
      }
    });
  });

  test('should handle README example from Requirement2', () => {
    const obj = {
      a: {
        b: {
          c: 2
        }
      }
    };
    assignGingerly(obj, {
      '!inc ?.a?.b?.c': 3,
      '!inc ?.a?.d?.e': -2
    });
    
    expect(obj).toEqual({
      a: {
        b: { c: 5 },
        d: { e: -2 }
      }
    });
  });

  test('should handle multiple !inc commands on same object', () => {
    const obj = { x: 1, y: 2, z: 3 };
    assignGingerly(obj, {
      '!inc x': 10,
      '!inc y': 20,
      '!inc z': 30
    });
    
    expect(obj).toEqual({
      x: 11,
      y: 22,
      z: 33
    });
  });

  test('should allow non-numeric increment values and let JavaScript handle coercion', () => {
    const obj = { value: 5 };
    assignGingerly(obj, { '!inc value': '3' });
    
    // JavaScript will coerce: 5 + '3' = '53' (string concatenation)
    expect(obj.value).toBe('53');
  });

  test('should handle incrementing with zero', () => {
    const obj = { count: 100 };
    assignGingerly(obj, { '!inc count': 0 });
    
    expect(obj.count).toBe(100);
  });

  test('should preserve nested object structure when incrementing', () => {
    const obj = { data: { nested: { count: 5, name: 'test' } } };
    assignGingerly(obj, { '!inc data.nested.count': 3 });
    
    expect(obj.data.nested).toEqual({
      count: 8,
      name: 'test'
    });
  });

  test('should handle !inc with existing nested paths', () => {
    const obj = { a: { b: { c: 10 } } };
    assignGingerly(obj, { '!inc ?.a?.b?.c': 5 });
    
    expect(obj.a.b.c).toBe(15);
  });

  test('should mix !inc with regular assignments', () => {
    const obj = { existing: 10 };
    assignGingerly(obj, {
      '!inc existing': 5,
      newProp: 'value'
    });
    
    expect(obj).toEqual({
      existing: 15,
      newProp: 'value'
    });
  });

  test('should mix !inc with nested path assignments', () => {
    const obj = {};
    assignGingerly(obj, {
      '!inc ?.counter': 1,
      '?.config?.setting': 'enabled'
    });
    
    expect(obj).toEqual({
      counter: 1,
      config: {
        setting: 'enabled'
      }
    });
  });

  test('should handle very deeply nested !inc paths', () => {
    const obj = {};
    assignGingerly(obj, { '!inc ?.a?.b?.c?.d?.e?.f?.g?.h': 42 });
    
    expect(obj.a.b.c.d.e.f.g.h).toBe(42);
  });

  test('should handle special characters in property names', () => {
    const obj = {};
    assignGingerly(obj, { '!inc ?.style?.background-color': 100 });
    
    expect(obj.style['background-color']).toBe(100);
  });

  test('should allow negative direct assignments for non-existent paths', () => {
    const obj = {};
    assignGingerly(obj, { '!inc ?.value': -50 });
    
    expect(obj.value).toBe(-50);
  });

  test('should handle sequential !inc calls on same path', () => {
    const obj = { count: 0 };
    assignGingerly(obj, { '!inc count': 5 });
    assignGingerly(obj, { '!inc count': 3 });
    
    expect(obj.count).toBe(8);
  });

  test('should preserve array properties when incrementing other properties', () => {
    const obj = { items: [1, 2, 3], counter: 5 };
    assignGingerly(obj, { '!inc counter': 2 });
    
    expect(obj).toEqual({
      items: [1, 2, 3],
      counter: 7
    });
  });

  test('should increment with floating point arithmetic', () => {
    const obj = { total: 0.1 };
    assignGingerly(obj, { '!inc total': 0.2 });
    
    expect(obj.total).toBeCloseTo(0.3);
  });
});
