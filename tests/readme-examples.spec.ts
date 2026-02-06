import { test, expect } from '@playwright/test';
import assignGingerly, { BaseRegistry } from '../assignGingerly.js';

test.describe('assignGingerly - README Examples', () => {
  test('Example 1: Basic assignment (superset of Object.assign)', async () => {
    const sourceObj = { hello: 'world' };
    await assignGingerly(sourceObj, { hello: 'Venus', foo: 'bar' });
    
    expect(sourceObj).toEqual({ hello: 'Venus', foo: 'bar' });
  });

  test('Example 2: Merging into existing sub object', async () => {
    // Simulate DOM element with style property
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
    
    // Verify the structure matches the README expected output
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

  test('Example 4: Dependency injection with symbols', async () => {
    // Define symbols
    const isHappy = Symbol.for('TFWsx0YH5E6eSfhE7zfLxA');
    const isMellow = Symbol.for('BqnnTPWRHkWdVGWcGQoAiw');
    
    // Define enhancement classes
    class MyEnhancement {
      isHappy = false;
    }

    class YourEnhancement {
      isMellow = false;
      madAboutFourteen = false;
    }
    
    // Create and configure registry
    const baseRegistry = new BaseRegistry();
    baseRegistry.push([
      {
        map: {
          [isHappy]: 'isHappy'
        },
        spawn: MyEnhancement
      },
      {
        map: {
          [isMellow]: 'isMellow',
          madAboutFourteen: 'madAboutFourteen'
        },
        spawn: YourEnhancement
      }
    ]);
    
    // Use assignGingerly with dependency injection
    const asyncResult = await assignGingerly({}, {
      [isHappy]: true,
      [isMellow]: true,
      '?.style?.height': '40px',
      '?.enhancements?.mellowYellow?.madAboutFourteen': true
    }, {
      registry: baseRegistry
    });
    
    // Verify the result structure
    expect(asyncResult).toBeDefined();
    expect(asyncResult.style?.height).toBe('40px');
    expect(asyncResult.enhancements?.mellowYellow?.madAboutFourteen).toBe(true);
    
    // Verify set property exists for lazy assignment
    expect('set' in asyncResult).toBe(true);
  });

  test('Example 4 extended: Using set property for lazy assignment', async () => {
    const isMellow = Symbol.for('BqnnTPWRHkWdVGWcGQoAiw');
    
    class YourEnhancement {
      isMellow = false;
    }
    
    const baseRegistry = new BaseRegistry();
    baseRegistry.push({
      map: { [isMellow]: 'isMellow' },
      spawn: YourEnhancement
    });
    
    const asyncResult = await assignGingerly({}, {}, { registry: baseRegistry });
    
    // Use the set proxy to assign symbol values
    asyncResult.set[isMellow] = false;
    
    expect(asyncResult).toBeDefined();
  });

  test('Async spawn example from README', async () => {
    const isMellow = Symbol.for('async-example');
    
    class AsyncEnhancement {
      isMellow = false;
    }
    
    const baseRegistry = new BaseRegistry();
    baseRegistry.push({
      map: { [isMellow]: 'isMellow' },
      spawn: Promise.resolve(AsyncEnhancement) // Return class after async operation
    });
    
    const result = await assignGingerly({}, {
      [isMellow]: true
    }, {
      registry: baseRegistry
    });
    
    expect(result).toBeDefined();
  });

  test('Multiple async and sync spawns together', async () => {
    const syncSym = Symbol.for('sync-spawn');
    const asyncSym = Symbol.for('async-spawn');
    
    class SyncClass {
      value = 'sync';
    }
    
    class AsyncClass {
      value = 'async';
    }
    
    const registry = new BaseRegistry();
    registry.push([
      {
        map: { [syncSym]: 'value' },
        spawn: SyncClass
      },
      {
        map: { [asyncSym]: 'value' },
        spawn: Promise.resolve(AsyncClass)
      }
    ]);
    
    // According to README: sync instantiations happen first, then async ones
    const result = await assignGingerly({}, {
      [syncSym]: 'sync-value',
      [asyncSym]: 'async-value'
    }, {
      registry
    });
    
    expect(result).toBeDefined();
  });

  test('Combining all features: nested paths + dependencies', async () => {
    const enhSym = Symbol.for('enhancement');
    
    class Enhancement {
      enabled = false;
      config = {} as any;
    }
    
    const registry = new BaseRegistry();
    registry.push({
      map: { [enhSym]: 'enabled' },
      spawn: Enhancement
    });
    
    const target = {};
    await assignGingerly(target, {
      [enhSym]: true,
      '?.app?.name': 'MyApp',
      '?.app?.version': '1.0.0',
      '?.settings?.debug': false,
      '?.database?.host': 'localhost',
      '?.database?.port': 5432
    }, {
      registry
    });
    
    expect(target).toBeDefined();
    expect(target.app?.name).toBe('MyApp');
    expect(target.app?.version).toBe('1.0.0');
    expect(target.settings?.debug).toBe(false);
    expect(target.database?.host).toBe('localhost');
    expect(target.database?.port).toBe(5432);
  });
});
