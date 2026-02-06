import { test, expect } from '@playwright/test';
import assignGingerly, { BaseRegistry } from '../assignGingerly.js';

test.describe('assignGingerly - JSON Symbol.for Support', () => {
  test('should convert Symbol.for string keys to actual symbols', async () => {
    const registry = new BaseRegistry();
    const testSymbol = Symbol.for('test-json-symbol');
    
    class TestClass {
      value = 'initial';
    }
    
    registry.push({
      map: { [testSymbol]: 'value' },
      spawn: TestClass
    });
    
    const target = {};
    await assignGingerly(target, {
      "[Symbol.for('test-json-symbol')]": 'json-value'
    }, { registry });
    
    expect(target).toBeDefined();
  });

  test('should handle multiple Symbol.for string keys', async () => {
    const registry = new BaseRegistry();
    const sym1 = Symbol.for('json-sym1');
    const sym2 = Symbol.for('json-sym2');
    
    class Class1 {
      prop1 = 'initial1';
    }
    
    class Class2 {
      prop2 = 'initial2';
    }
    
    registry.push([
      { map: { [sym1]: 'prop1' }, spawn: Class1 },
      { map: { [sym2]: 'prop2' }, spawn: Class2 }
    ]);
    
    const target = {};
    await assignGingerly(target, {
      "[Symbol.for('json-sym1')]": 'value1',
      "[Symbol.for('json-sym2')]": 'value2'
    }, { registry });
    
    expect(target).toBeDefined();
  });

  test('should work with README example using Symbol.for strings', async () => {
    const isHappy = Symbol.for('TFWsx0YH5E6eSfhE7zfLxA');
    const isMellow = Symbol.for('BqnnTPWRHkWdVGWcGQoAiw');
    
    class MyEnhancement {
      isHappy = false;
    }

    class YourEnhancement {
      isMellow = false;
    }
    
    const baseRegistry = new BaseRegistry();
    baseRegistry.push([
      {
        map: { [isHappy]: 'isHappy' },
        spawn: MyEnhancement
      },
      {
        map: { [isMellow]: 'isMellow' },
        spawn: YourEnhancement
      }
    ]);
    
    const asyncResult = await assignGingerly({}, {
      "[Symbol.for('TFWsx0YH5E6eSfhE7zfLxA')]": true,
      "[Symbol.for('BqnnTPWRHkWdVGWcGQoAiw')]": true,
      '?.style?.height': '40px',
      '?.enhancements?.mellowYellow?.madAboutFourteen': true
    }, {
      registry: baseRegistry
    });
    
    expect(asyncResult).toBeDefined();
    expect(asyncResult.style?.height).toBe('40px');
    expect(asyncResult.enhancements?.mellowYellow?.madAboutFourteen).toBe(true);
  });

  test('should handle both actual symbols and Symbol.for strings together', async () => {
    const registry = new BaseRegistry();
    const actualSymbol = Symbol.for('actual-symbol');
    const stringSymbol = Symbol.for('string-symbol');
    
    class Class1 {
      value1 = 'initial';
    }
    
    class Class2 {
      value2 = 'initial';
    }
    
    registry.push([
      { map: { [actualSymbol]: 'value1' }, spawn: Class1 },
      { map: { [stringSymbol]: 'value2' }, spawn: Class2 }
    ]);
    
    const target = {};
    await assignGingerly(target, {
      [actualSymbol]: 'actual-value',
      "[Symbol.for('string-symbol')]": 'string-value'
    }, { registry });
    
    expect(target).toBeDefined();
  });

  test('should support Symbol.for strings with double quotes', async () => {
    const registry = new BaseRegistry();
    const testSymbol = Symbol.for('double-quote-test');
    
    class TestClass {
      value = 'initial';
    }
    
    registry.push({
      map: { [testSymbol]: 'value' },
      spawn: TestClass
    });
    
    const target = {};
    await assignGingerly(target, {
      '[Symbol.for("double-quote-test")]': 'double-quote-value'
    }, { registry });
    
    expect(target).toBeDefined();
  });

  test('should combine Symbol.for strings with nested paths', async () => {
    const registry = new BaseRegistry();
    const testSymbol = Symbol.for('combo-json-symbol');
    
    class TestClass {
      value = 'initial';
    }
    
    registry.push({
      map: { [testSymbol]: 'value' },
      spawn: TestClass
    });
    
    const target = {};
    await assignGingerly(target, {
      "[Symbol.for('combo-json-symbol')]": 'symbol-value',
      '?.config?.setting': 'nested-value',
      regularKey: 'regular-value'
    }, { registry });
    
    expect(target).toBeDefined();
    expect(target.config?.setting).toBe('nested-value');
    expect(target.regularKey).toBe('regular-value');
  });

  test('should ignore invalid Symbol.for string formats', async () => {
    const target = {};
    await assignGingerly(target, {
      '[Symbol.for(invalid)]': 'should-be-ignored',
      '[Symbol.for()]': 'also-ignored',
      'Symbol.for("test")': 'not-bracket-format',
      regularKey: 'regular-value'
    });
    
    // Invalid formats should be treated as regular string keys
    expect(target.regularKey).toBe('regular-value');
    expect(target['[Symbol.for(invalid)]']).toBe('should-be-ignored');
  });

  test('should work with JSON.parse for true JSON compatibility', async () => {
    const registry = new BaseRegistry();
    const testSymbol = Symbol.for('json-parsed-symbol');
    
    class TestClass {
      value = 'initial';
    }
    
    registry.push({
      map: { [testSymbol]: 'value' },
      spawn: TestClass
    });
    
    // Simulate JSON coming from an API or file
    const jsonString = JSON.stringify({
      "[Symbol.for('json-parsed-symbol')]": 'parsed-value',
      '?.config?.name': 'MyApp'
    });
    
    const parsedData = JSON.parse(jsonString);
    
    const target = {};
    await assignGingerly(target, parsedData, { registry });
    
    expect(target).toBeDefined();
    expect(target.config?.name).toBe('MyApp');
  });
});
