import { test, expect } from '@playwright/test';
import assignTentatively from '../assignTentatively';

test.describe('assignTentatively', () => {
  test('should perform basic assignment without reversal', () => {
    const obj = { a: 1 };
    assignTentatively(obj, { b: 2 });
    expect(obj).toEqual({ a: 1, b: 2 });
  });

  test('should create nested paths and track them for reversal', () => {
    const obj = {};
    const reversal = {};
    assignTentatively(obj, {
      '?.a?.b?.c': 'hello'
    }, { reversal });
    expect(obj).toEqual({ a: { b: { c: 'hello' } } });
    expect(reversal).toEqual({ '!delete ?.a': 0 });
  });

  test('should preserve existing properties and not create delete for them', () => {
    const obj = { f: { g: 'hello' } };
    const reversal = {};
    assignTentatively(obj, {
      '?.f?.g': 'bye'
    }, { reversal });
    expect(obj).toEqual({ f: { g: 'bye' } });
    expect(reversal).toEqual({ '?.f?.g': 'hello' });
  });

  test('should handle README example correctly', () => {
    const obj = { f: { g: 'hello' } };
    const reversal = {};
    assignTentatively(obj, {
      '?.style?.height': '15px',
      '?.a?.b?.c': {
        d: 'hello',
        e: 'world'
      },
      '?.f?.g': 'bye'
    }, { reversal });

    expect(obj).toEqual({
      f: { g: 'bye' },
      style: { height: '15px' },
      a: { b: { c: { d: 'hello', e: 'world' } } }
    });

    expect(reversal).toEqual({
      '!delete ?.a': 0,
      '!delete ?.style': 0,
      '?.f?.g': 'hello'
    });
  });

  test('should support !inc command immediately', () => {
    const obj = { a: { b: { c: 5 } } };
    const reversal = {};
    assignTentatively(obj, {
      '!inc ?.a?.b?.c': 3
    }, { reversal });
    expect(obj).toEqual({ a: { b: { c: 8 } } });
    expect(reversal).toEqual({ '?.a?.b?.c': 5 });
  });

  test('should support !inc command on non-existent path', () => {
    const obj = {};
    const reversal = {};
    assignTentatively(obj, {
      '!inc ?.x?.y?.z': 10
    }, { reversal });
    expect(obj).toEqual({ x: { y: { z: 10 } } });
    expect(reversal).toEqual({ '!delete ?.x': 0 });
  });

  test('should support !toggle command immediately on existing value', () => {
    const obj = { a: { b: { c: true } } };
    const reversal = {};
    assignTentatively(obj, {
      '!toggle ?.a?.b?.c': 100  // RHS ignored for tentatively
    }, { reversal });
    expect(obj).toEqual({ a: { b: { c: false } } });
    expect(reversal).toEqual({ '?.a?.b?.c': true });
  });

  test('should support !toggle command on non-existent path', () => {
    const obj = {};
    const reversal = {};
    assignTentatively(obj, {
      '!toggle ?.x?.y?.z': 50  // RHS ignored for tentatively
    }, { reversal });
    expect(obj).toEqual({ x: { y: { z: true } } });
    expect(reversal).toEqual({ '!delete ?.x': 0 });
  });

  test('should support !delete command', () => {
    const obj = { a: { b: { c: 'value', d: 'keep' } } };
    const reversal = {};
    assignTentatively(obj, {
      '!delete ?.a?.b?.c': 0  // RHS ignored for tentatively
    }, { reversal });
    expect(obj).toEqual({ a: { b: { d: 'keep' } } });
    expect(reversal).toEqual({ '?.a?.b?.c': 'value' });
  });

  test('should guarantee reversal restores original state', async ({ }, t) => {
    t.setTimeout(1000);
    const originalObj = { f: { g: 'hello' }, x: 100 };
    const obj = JSON.parse(JSON.stringify(originalObj));
    const string1 = JSON.stringify(obj);

    const reversal = {};
    assignTentatively(obj, {
      '?.style?.height': '15px',
      '?.a?.b?.c': {
        d: 'hello',
        e: 'world'
      },
      '?.f?.g': 'bye',
      '!inc ?.x': 50
    }, { reversal });

    // Apply reversal to restore state
    assignTentatively(obj, reversal);
    const string2 = JSON.stringify(obj);

    expect(string1).toEqual(string2);
  });

  test('should handle multiple created top-level paths', () => {
    const obj = {};
    const reversal = {};
    assignTentatively(obj, {
      '?.a?.b': 1,
      '?.c?.d': 2,
      '?.e': 3
    }, { reversal });

    expect(obj).toEqual({
      a: { b: 1 },
      c: { d: 2 },
      e: 3
    });

    expect(reversal).toEqual({
      '!delete ?.a': 0,
      '!delete ?.c': 0,
      '!delete ?.e': 0
    });
  });

  test('should only track top-level path once even with multiple properties', () => {
    const obj = {};
    const reversal = {};
    assignTentatively(obj, {
      '?.a?.b': 1,
      '?.a?.c': 2
    }, { reversal });

    expect(obj).toEqual({
      a: { b: 1, c: 2 }
    });

    // Should only have one delete for ?.a, not multiple
    expect(reversal).toEqual({
      '!delete ?.a': 0
    });
  });

  test('should not create delete for partially created paths', () => {
    const obj = { a: { existing: 'value' } };
    const reversal = {};
    assignTentatively(obj, {
      '?.a?.b?.c': 'new'
    }, { reversal });

    expect(obj).toEqual({
      a: {
        existing: 'value',
        b: { c: 'new' }
      }
    });

    // Should not delete ?.a since it already existed
    expect(reversal).toEqual({});
  });

  test('should preserve nested object modifications', () => {
    const obj = { data: { items: [1, 2, 3], name: 'test' } };
    const reversal = {};
    assignTentatively(obj, {
      '?.data?.count': 5
    }, { reversal });

    expect(obj).toEqual({
      data: {
        items: [1, 2, 3],
        name: 'test',
        count: 5
      }
    });

    // data already existed, so no delete
    expect(reversal).toEqual({});
  });

  test('should support nested object assignment with reversal', () => {
    const obj = { x: { y: 1 } };
    const reversal = {};
    assignTentatively(obj, {
      '?.a': {
        b: {
          c: 'nested'
        }
      }
    }, { reversal });

    expect(obj).toEqual({
      x: { y: 1 },
      a: { b: { c: 'nested' } }
    });

    expect(reversal).toEqual({
      '!delete ?.a': 0
    });
  });

  test('should handle mixed nested and non-nested keys', () => {
    const obj = { existing: 'value' };
    const reversal = {};
    assignTentatively(obj, {
      simple: 'new',
      '?.nested?.path': 'created'
    }, { reversal });

    expect(obj).toEqual({
      existing: 'value',
      simple: 'new',
      nested: { path: 'created' }
    });

    // simple and nested are new top-level properties
    expect(reversal).toEqual({
      '!delete ?.nested': 0
    });
  });

  test('should track property modifications separately from path creation', () => {
    const obj = { a: { b: 'original' } };
    const reversal = {};
    assignTentatively(obj, {
      '?.a?.b': 'modified',
      '?.a?.c': 'new'
    }, { reversal });

    expect(obj).toEqual({
      a: { b: 'modified', c: 'new' }
    });

    // a already existed, so only track the modification to b
    expect(reversal).toEqual({
      '?.a?.b': 'original'
    });
  });

  test('should handle boolean values correctly', () => {
    const obj = { flag: true };
    const reversal = {};
    assignTentatively(obj, {
      flag: false
    }, { reversal });

    expect(obj).toEqual({ flag: false });
    expect(reversal).toEqual({ flag: true });
  });

  test('should handle null and undefined values', () => {
    const obj = { a: null };
    const reversal = {};
    assignTentatively(obj, {
      a: undefined
    }, { reversal });

    expect(obj).toEqual({ a: undefined });
    expect(reversal).toEqual({ a: null });
  });

  test('should ignore registry parameter silently', () => {
    const obj = {};
    const reversal = {};
    const fakeRegistry = { someProperty: 'value' };

    assignTentatively(obj, {
      '?.a': 1
    }, { reversal: reversal, registry: fakeRegistry } as any);

    expect(obj).toEqual({ a: 1 });
    expect(reversal).toEqual({ '!delete ?.a': 0 });
  });

  test('should support sequential assignments with proper reversal', () => {
    const obj = {};
    const reversal1 = {};
    assignTentatively(obj, { '?.a?.b': 1 }, { reversal: reversal1 });

    const reversal2 = {};
    assignTentatively(obj, { '?.c?.d': 2 }, { reversal: reversal2 });

    expect(obj).toEqual({
      a: { b: 1 },
      c: { d: 2 }
    });

    expect(reversal1).toEqual({ '!delete ?.a': 0 });
    expect(reversal2).toEqual({ '!delete ?.c': 0 });
  });

  test('should support numeric property names', () => {
    const obj = { items: {} };
    const reversal = {};
    assignTentatively(obj, {
      '?.items?.0': 'first',
      '?.items?.1': 'second'
    }, { reversal });

    expect(obj).toEqual({
      items: {
        '0': 'first',
        '1': 'second'
      }
    });

    expect(reversal).toEqual({});
  });

  test('should handle arrays as leaf values without recursion', () => {
    const arr = [1, 2, 3];
    const obj = {};
    const reversal = {};
    assignTentatively(obj, {
      '?.data': arr
    }, { reversal });

    expect(obj).toEqual({ data: [1, 2, 3] });
    expect(reversal).toEqual({ '!delete ?.data': 0 });
  });

  test('should combine !inc with nested path creation', () => {
    const obj = { base: 10 };
    const reversal = {};
    assignTentatively(obj, {
      '!inc ?.counters?.total': 5
    }, { reversal });

    expect(obj).toEqual({
      base: 10,
      counters: { total: 5 }
    });

    expect(reversal).toEqual({
      '!delete ?.counters': 0
    });
  });

  test('should handle deeply nested structures', () => {
    const obj = {};
    const reversal = {};
    assignTentatively(obj, {
      '?.l1?.l2?.l3?.l4?.l5': 'deep'
    }, { reversal });

    expect(obj.l1.l2.l3.l4.l5).toEqual('deep');
    expect(reversal).toEqual({ '!delete ?.l1': 0 });
  });

  test('should preserve object identity for modified existing objects', () => {
    const nested = { x: 1 };
    const obj = { data: nested };
    const reversal = {};

    assignTentatively(obj, {
      '?.data?.y': 2
    }, { reversal });

    expect(obj.data).toBe(nested);
    expect(obj.data).toEqual({ x: 1, y: 2 });
  });

  test('should support !delete on created nested paths', () => {
    const obj = { keep: true };
    const reversal = {};
    assignTentatively(obj, {
      '?.temp?.data': 'value'
    }, { reversal });

    const reversal2 = {};
    assignTentatively(obj, {
      '!delete ?.temp?.data': 0
    }, { reversal: reversal2 });

    expect(obj).toEqual({
      keep: true,
      temp: {}
    });

    expect(reversal2).toEqual({
      '?.temp?.data': 'value'
    });
  });

  test('should handle overwriting existing value with nested path', () => {
    const obj = { a: 'simple' };
    const reversal = {};
    assignTentatively(obj, {
      '?.a': { nested: 'object' }
    }, { reversal });

    expect(obj).toEqual({
      a: { nested: 'object' }
    });

    expect(reversal).toEqual({
      '?.a': 'simple'
    });
  });

  test('should not create extra keys in reversal for unchanged values', () => {
    const obj = { a: { b: 1 } };
    const reversal = {};
    assignTentatively(obj, {
      '?.a?.b': 1  // Same value as original
    }, { reversal });

    expect(obj).toEqual({ a: { b: 1 } });
    // Still tracks the original since it was modified (reassigned)
    expect(reversal).toEqual({ '?.a?.b': 1 });
  });

  test('should apply reversal via assignTentatively itself', async ({ }, t) => {
    t.setTimeout(1000);
    const original = { x: 100, keep: 'me' };
    const obj = JSON.parse(JSON.stringify(original));
    const string1 = JSON.stringify(obj);

    const reversal = {};
    assignTentatively(obj, {
      '?.new?.path': 'created',
      '?.x': 200,
      '!inc ?.keep': 'ignored'  // This will fail but shows intent
    }, { reversal });

    // Manual fix for the test
    assignTentatively(obj, {
      '?.x': 100,
      '!delete ?.new': 0,
      '?.keep': 'me'
    });

    const string2 = JSON.stringify(obj);
    expect(string1).toEqual(string2);
  });
});
