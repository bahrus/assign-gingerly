import { test, expect } from '@playwright/test';
import assignGingerly from '../assignGingerly.js';

test.describe('assignGingerly - =! Command', () => {
  test('should toggle self with =! and RHS="."', () => {
    const obj = { value: true };
    assignGingerly(obj, { '?.value =!': '.' });
    
    expect(obj.value).toBe(false);
  });

  test('should toggle false to true with self-reference', () => {
    const obj = { active: false };
    assignGingerly(obj, { '?.active =!': '.' });
    
    expect(obj.active).toBe(true);
  });

  test('should negate another property', () => {
    const obj = { 
      a: { 
        b: { 
          c: true 
        } 
      } 
    };
    assignGingerly(obj, { 
      '?.a?.d?.e =!': '?.a?.b?.c'
    });
    
    // e should be set to !c (which is !true = false)
    expect(obj.a.d.e).toBe(false);
  });

  test('should treat non-existent RHS path as truthy', () => {
    const obj = {};
    assignGingerly(obj, { 
      '?.result =!': '?.nonexistent?.path'
    });
    
    // Non-existent path evaluates to true, so !true = false
    expect(obj.result).toBe(false);
  });

  test('should handle README example', () => {
    const obj = {
      a: {
        b: {
          c: true
        }
      }
    };
    
    assignGingerly(obj, {
      '?.a?.b?.c =!': '.',
      '?.a?.d?.e =!': '?.a?.d?.e'
    });
    
    expect(obj).toEqual({
      a: {
        b: { c: false },  // toggled itself
        d: { e: false }   // non-existent treated as truthy, negated to false
      }
    });
  });

  test('should create intermediate nested structures', () => {
    const obj = {};
    assignGingerly(obj, { '?.x?.y?.z =!': '.' });
    
    expect(obj).toEqual({
      x: {
        y: {
          z: true  // !undefined = true
        }
      }
    });
  });

  test('should handle multiple =! commands', () => {
    const obj = { a: true, b: false, c: true };
    assignGingerly(obj, {
      '?.a =!': '.',
      '?.b =!': '.',
      '?.c =!': '.'
    });
    
    expect(obj).toEqual({
      a: false,
      b: true,
      c: false
    });
  });

  test('should mix =! with regular assignments', () => {
    const obj = { flag: true };
    assignGingerly(obj, {
      '?.flag =!': '.',
      'name': 'test'
    });
    
    expect(obj).toEqual({
      flag: false,
      name: 'test'
    });
  });

  test('should mix =! with += commands', () => {
    const obj = { count: 5, enabled: true };
    assignGingerly(obj, {
      '?.count +=': 3,
      '?.enabled =!': '.'
    });
    
    expect(obj.count).toBe(8);
    expect(obj.enabled).toBe(false);
  });

  test('should negate non-boolean values', () => {
    const obj = { value: 0 };
    assignGingerly(obj, { '?.result =!': '?.value' });
    
    // !0 = true
    expect(obj.result).toBe(true);
  });

  test('should negate truthy non-boolean values', () => {
    const obj = { value: 'hello' };
    assignGingerly(obj, { '?.result =!': '?.value' });
    
    // !'hello' = false
    expect(obj.result).toBe(false);
  });

  test('should handle very deep nested paths', () => {
    const obj = { a: { b: { c: { d: { e: true } } } } };
    assignGingerly(obj, { '?.a?.b?.c?.d?.e =!': '.' });
    
    expect(obj.a.b.c.d.e).toBe(false);
  });

  test('should handle special characters in property names', () => {
    const obj = { 'my-prop': true };
    assignGingerly(obj, { '?.my-prop =!': '.' });
    
    expect(obj['my-prop']).toBe(false);
  });

  test('should preserve other properties when toggling', () => {
    const obj = { toggleMe: true, keepMe: 'unchanged', nested: { value: 42 } };
    assignGingerly(obj, { '?.toggleMe =!': '.' });
    
    expect(obj).toEqual({
      toggleMe: false,
      keepMe: 'unchanged',
      nested: { value: 42 }
    });
  });

  test('should negate value from different branch', () => {
    const obj = { 
      source: { value: false },
      target: {}
    };
    assignGingerly(obj, { 
      '?.target?.result =!': '?.source?.value'
    });
    
    expect(obj.target.result).toBe(true); // !false = true
  });

  test('should handle self-negation on non-existent property', () => {
    const obj = {};
    assignGingerly(obj, { '?.newProp =!': '.' });
    
    // Self-reference to non-existent property: !undefined = true
    expect(obj.newProp).toBe(true);
  });

  test('should chain negations', () => {
    const obj = { a: true };
    assignGingerly(obj, { 
      '?.b =!': '?.a',
      '?.c =!': '?.b'
    });
    
    expect(obj.a).toBe(true);
    expect(obj.b).toBe(false); // !true
    expect(obj.c).toBe(true);  // !false
  });

  test('should handle null values', () => {
    const obj = { value: null };
    assignGingerly(obj, { '?.result =!': '?.value' });
    
    // !null = true
    expect(obj.result).toBe(true);
  });

  test('should handle undefined values', () => {
    const obj = { value: undefined };
    assignGingerly(obj, { '?.result =!': '?.value' });
    
    // !undefined = true
    expect(obj.result).toBe(true);
  });

  test('should handle numeric values', () => {
    const obj = { zero: 0, one: 1, negative: -5 };
    assignGingerly(obj, { 
      '?.notZero =!': '?.zero',
      '?.notOne =!': '?.one',
      '?.notNegative =!': '?.negative'
    });
    
    expect(obj.notZero).toBe(true);      // !0 = true
    expect(obj.notOne).toBe(false);      // !1 = false
    expect(obj.notNegative).toBe(false); // !-5 = false
  });

  test('should handle array values', () => {
    const obj = { emptyArray: [], fullArray: [1, 2, 3] };
    assignGingerly(obj, { 
      '?.notEmpty =!': '?.emptyArray',
      '?.notFull =!': '?.fullArray'
    });
    
    expect(obj.notEmpty).toBe(false);  // ![] = false (arrays are truthy)
    expect(obj.notFull).toBe(false);   // ![1,2,3] = false
  });

  test('should handle object values', () => {
    const obj = { emptyObj: {}, fullObj: { a: 1 } };
    assignGingerly(obj, { 
      '?.notEmptyObj =!': '?.emptyObj',
      '?.notFullObj =!': '?.fullObj'
    });
    
    expect(obj.notEmptyObj).toBe(false);  // !{} = false (objects are truthy)
    expect(obj.notFullObj).toBe(false);   // !{a:1} = false
  });
});
