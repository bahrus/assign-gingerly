import { test, expect } from '@playwright/test';
import assignGingerly, { EnhancementRegistry } from '../assignGingerly.js';

test.describe('assignGingerly - README Examples', () => {
  test('Example 1: Basic assignment (superset of Object.assign)', () => {
    const sourceObj = { hello: 'world' };
    assignGingerly(sourceObj, { hello: 'Venus', foo: 'bar' });
    
    expect(sourceObj).toEqual({ hello: 'Venus', foo: 'bar' });
  });

  test('Example 2: Merging into existing sub object', () => {
    // Simulate DOM element with style property
    const oInput = {
      style: {
        height: undefined as any
      }
    };
    
    assignGingerly(oInput, { '?.style?.height': '15px' });
    
    expect(oInput.style.height).toBe('15px');
  });

  test('Example 3: Deeply nested object creation', () => {
    const obj = {};
    assignGingerly(obj, {
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

  test('Example 4: Dependency injection with symbols', () => {
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
    const baseRegistry = new EnhancementRegistry();
    baseRegistry.push([
      {
        symlinks: {
          [isHappy]: 'isHappy'
        },
        spawn: MyEnhancement
      },
      {
        symlinks: {
          [isMellow]: 'isMellow',
          madAboutFourteen: 'madAboutFourteen'
        },
        spawn: YourEnhancement
      }
    ]);
    
    // Use assignGingerly with dependency injection
    const result = assignGingerly({}, {
      [isHappy]: true,
      [isMellow]: true,
      '?.style?.height': '40px',
      '?.enhancements?.mellowYellow?.madAboutFourteen': true
    }, {
      registry: baseRegistry
    });
    
    // Verify the result structure
    expect(result).toBeDefined();
    expect(result.style?.height).toBe('40px');
    expect(result.enhancements?.mellowYellow?.madAboutFourteen).toBe(true);
    
    // Verify set property exists for lazy assignment
    expect('set' in result).toBe(true);
  });

  test('Example 4 extended: Using set property for lazy assignment', () => {
    const isMellow = Symbol.for('BqnnTPWRHkWdVGWcGQoAiw');
    
    class YourEnhancement {
      isMellow = false;
    }
    
    const baseRegistry = new EnhancementRegistry();
    baseRegistry.push({
      symlinks: { [isMellow]: 'isMellow' },
      spawn: YourEnhancement
    });
    
    const result = assignGingerly({}, {}, { registry: baseRegistry });
    
    // Use the set proxy to assign symbol values
    result.set[isMellow] = false;
    
    expect(result).toBeDefined();
  });

  test('Combining all features: nested paths + dependencies', () => {
    const enhSym = Symbol.for('enhancement');
    
    class Enhancement {
      enabled = false;
      config = {} as any;
    }
    
    const registry = new EnhancementRegistry();
    registry.push({
      symlinks: { [enhSym]: 'enabled' },
      spawn: Enhancement
    });
    
    const target = {};
    assignGingerly(target, {
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

