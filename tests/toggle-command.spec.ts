import { test, expect } from '@playwright/test';
import assignGingerly from '../assignGingerly.js';

test.describe('assignGingerly - !toggle Command', () => {
  test('should toggle existing boolean value immediately when RHS is 0', () => {
    const obj = { value: true };
    assignGingerly(obj, { '!toggle value': 0 });
    
    expect(obj.value).toBe(false);
  });

  test('should toggle false to true immediately', () => {
    const obj = { active: false };
    assignGingerly(obj, { '!toggle active': 0 });
    
    expect(obj.active).toBe(true);
  });

  test('should not create non-existent path on immediate toggle (RHS = 0)', () => {
    const obj = {};
    assignGingerly(obj, { '!toggle nonExistent': 0 });
    
    expect(obj).toEqual({});
  });

  test('should toggle nested path immediately when RHS is 0', () => {
    const obj = { a: { b: { c: true } } };
    assignGingerly(obj, { '!toggle a.b.c': 0 });
    
    expect(obj.a.b.c).toBe(false);
  });

  test('should toggle with ?. nested path notation immediately', () => {
    const obj = { a: { b: { c: true } } };
    assignGingerly(obj, { '!toggle ?.a?.b?.c': 0 });
    
    expect(obj.a.b.c).toBe(false);
  });

  test('should handle delayed toggle with setTimeout', () => {
    const obj = { value: true };
    assignGingerly(obj, { '!toggle value': 10 });
    
    // Should still be true immediately
    expect(obj.value).toBe(true);
    
    // Use setTimeout to check after delay
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(obj.value).toBe(false);
        resolve();
      }, 30);
    });
  });

  test('should initialize non-existent path to true on delayed toggle', () => {
    const obj = {};
    assignGingerly(obj, { '!toggle ?.newPath': 15 });
    
    // Should not exist immediately
    expect(obj).toEqual({});
    
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(obj.newPath).toBe(true);
        resolve();
      }, 30);
    });
  });

  test('should handle README example from Requirement3', () => {
    const obj = {
      a: {
        b: {
          c: true
        }
      }
    };
    
    assignGingerly(obj, {
      '!toggle ?.a?.b?.c': 0,
      '!toggle ?.a?.d?.e': 20
    });
    
    // Immediately after assignGingerly
    expect(obj).toEqual({
      a: {
        b: { c: false },  // c toggled immediately
        // d doesn't exist yet
      }
    });
    
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        // After 20ms timeout
        expect(obj).toEqual({
          a: {
            b: { c: false },
            d: { e: true }  // e created and set to true
          }
        });
        resolve();
      }, 40);
    });
  });

  test('should create intermediate nested structures on delayed toggle', () => {
    const obj = {};
    assignGingerly(obj, { '!toggle ?.x?.y?.z': 20 });
    
    expect(obj).toEqual({});
    
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(obj).toEqual({
          x: {
            y: {
              z: true
            }
          }
        });
        resolve();
      }, 40);
    });
  });

  test('should handle multiple immediate toggles', () => {
    const obj = { a: true, b: false, c: true };
    assignGingerly(obj, {
      '!toggle a': 0,
      '!toggle b': 0,
      '!toggle c': 0
    });
    
    expect(obj).toEqual({
      a: false,
      b: true,
      c: false
    });
  });

  test('should handle multiple delayed toggles with different timings', () => {
    const obj = { x: true, y: false };
    assignGingerly(obj, {
      '!toggle x': 10,
      '!toggle y': 20
    });
    
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        // After 15ms, only x should be toggled
        expect(obj.x).toBe(false);
        expect(obj.y).toBe(false); // Not yet toggled
        
        setTimeout(() => {
          // After total 35ms, both should be toggled
          expect(obj.x).toBe(false);
          expect(obj.y).toBe(true);
          resolve();
        }, 25);
      }, 15);
    });
  });

  test('should mix immediate and delayed toggles', () => {
    const obj = { immediate: true, delayed: true };
    assignGingerly(obj, {
      '!toggle immediate': 0,
      '!toggle delayed': 15
    });
    
    expect(obj.immediate).toBe(false);
    expect(obj.delayed).toBe(true);
    
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(obj.delayed).toBe(false);
        resolve();
      }, 30);
    });
  });

  test('should mix !toggle with regular assignments', () => {
    const obj = {};
    assignGingerly(obj, {
      '!toggle ?.flag': 0,
      'name': 'test'
    });
    
    expect(obj).toEqual({
      name: 'test'
    });
  });

  test('should mix !toggle with !inc commands', () => {
    const obj = { count: 5, enabled: true };
    assignGingerly(obj, {
      '!inc count': 3,
      '!toggle enabled': 0
    });
    
    expect(obj.count).toBe(8);
    expect(obj.enabled).toBe(false);
  });

  test('should handle toggle with non-numeric RHS and let it throw', () => {
    const obj = { value: true };
    
    // Non-numeric value as delay should be handled by setTimeout
    // setTimeout('string') might not throw but behavior is unpredictable
    assignGingerly(obj, { '!toggle value': 'invalid' as any });
    
    expect(obj.value).toBe(true); // Still true immediately
  });

  test('should toggle non-boolean values', () => {
    const obj = { value: 0 };
    assignGingerly(obj, { '!toggle value': 0 });
    
    // !0 = true
    expect(obj.value).toBe(true);
  });

  test('should toggle truthy non-boolean values', () => {
    const obj = { value: 'hello' };
    assignGingerly(obj, { '!toggle value': 0 });
    
    // !'hello' = false
    expect(obj.value).toBe(false);
  });

  test('should handle very deep nested toggle', () => {
    const obj = { a: { b: { c: { d: { e: true } } } } };
    assignGingerly(obj, { '!toggle ?.a?.b?.c?.d?.e': 0 });
    
    expect(obj.a.b.c.d.e).toBe(false);
  });

  test('should handle special characters in property names', () => {
    const obj = { 'my-prop': true };
    assignGingerly(obj, { '!toggle ?.my-prop': 0 });
    
    expect(obj['my-prop']).toBe(false);
  });

  test('should preserve other properties when toggling', () => {
    const obj = { toggleMe: true, keepMe: 'unchanged', nested: { value: 42 } };
    assignGingerly(obj, { '!toggle toggleMe': 0 });
    
    expect(obj).toEqual({
      toggleMe: false,
      keepMe: 'unchanged',
      nested: { value: 42 }
    });
  });

  test('should case-sensitive detect !toggle', () => {
    const obj = { value: true };
    
    // This should be treated as a regular key, not a !toggle command
    assignGingerly(obj, { '!TOGGLE value': 0 } as any);
    
    // Should have added a new property, not toggled
    expect(obj).toHaveProperty('!TOGGLE value');
  });

  test('should allow sequential delayed toggles on same path', () => {
    const obj = { flag: true };
    
    assignGingerly(obj, { '!toggle flag': 10 });
    assignGingerly(obj, { '!toggle flag': 20 });
    
    expect(obj.flag).toBe(true);
    
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        // After 15ms, first toggle completes: true -> false
        expect(obj.flag).toBe(false);
        
        setTimeout(() => {
          // After 35ms, second toggle completes: false -> true
          expect(obj.flag).toBe(true);
          resolve();
        }, 25);
      }, 15);
    });
  });
});
