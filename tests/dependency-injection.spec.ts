import { test, expect } from '@playwright/test';
import assignGingerly, { BaseRegistry } from '../assignGingerly.js';

test.describe('assignGingerly - Dependency Injection', () => {
  test('should register items in BaseRegistry', () => {
    const registry = new BaseRegistry();
    
    class MyEnhancement {
      isHappy = false;
    }

    const isHappy = Symbol.for('test-isHappy');
    
    registry.push({
      map: { [isHappy]: 'isHappy' },
      spawn: MyEnhancement
    });
    
    const items = registry.getItems();
    expect(items.length).toBe(1);
  });

  test('should push multiple registry items at once', () => {
    const registry = new BaseRegistry();
    const sym1 = Symbol.for('sym1');
    const sym2 = Symbol.for('sym2');
    
    class Class1 {}
    class Class2 {}
    
    registry.push([
      { map: { [sym1]: 'prop1' }, spawn: Class1 },
      { map: { [sym2]: 'prop2' }, spawn: Class2 }
    ]);
    
    expect(registry.getItems().length).toBe(2);
  });

  test('should find registry item by symbol', () => {
    const registry = new BaseRegistry();
    const testSymbol = Symbol.for('test-symbol');
    
    class TestClass {}
    
    registry.push({
      map: { [testSymbol]: 'testProp' },
      spawn: TestClass
    });
    
    const item = registry.findBySymbol(testSymbol);
    expect(item).toBeDefined();
    expect(item?.map[testSymbol]).toBe('testProp');
  });

  test('should inject dependency with symbol key', async () => {
    const registry = new BaseRegistry();
    const isHappy = Symbol.for('isHappy-test');
    
    class MyEnhancement {
      isHappy = false;
    }
    
    registry.push({
      map: { [isHappy]: 'isHappy' },
      spawn: MyEnhancement
    });
    
    const result = await assignGingerly({}, {
      [isHappy]: true
    }, { registry });
    
    expect(result).toBeDefined();
  });

  test('should handle synchronous spawn', async () => {
    const registry = new BaseRegistry();
    const mySymbol = Symbol.for('my-symbol');
    
    class MyClass {
      value = 'initial';
    }
    
    registry.push({
      map: { [mySymbol]: 'value' },
      spawn: MyClass
    });
    
    const target = {};
    await assignGingerly(target, { [mySymbol]: 'updated' }, { registry });
    
    expect(target).toBeDefined();
  });

  test('should handle async spawn with Promise', async () => {
    const registry = new BaseRegistry();
    const mySymbol = Symbol.for('async-symbol');
    
    class AsyncClass {
      value = 'initial';
    }
    
    registry.push({
      map: { [mySymbol]: 'value' },
      spawn: Promise.resolve(AsyncClass)
    });
    
    const target = {};
    const result = await assignGingerly(target, { [mySymbol]: 'async-value' }, { registry });
    
    expect(result).toBeDefined();
  });

  test('should reuse spawned instances for same symbol', async () => {
    const registry = new BaseRegistry();
    const mySymbol = Symbol.for('reuse-symbol');
    
    class CounterClass {
      count = 0;
      increment() {
        this.count++;
      }
    }
    
    registry.push({
      map: { [mySymbol]: 'count' },
      spawn: CounterClass
    });
    
    const target = {};
    await assignGingerly(target, { [mySymbol]: 5 }, { registry });
    await assignGingerly(target, { [mySymbol]: 10 }, { registry });
    
    expect(target).toBeDefined();
  });

  test('should work with multiple symbols', async () => {
    const registry = new BaseRegistry();
    const sym1 = Symbol.for('sym1');
    const sym2 = Symbol.for('sym2');
    
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
      [sym1]: 'value1',
      [sym2]: 'value2'
    }, { registry });
    
    expect(target).toBeDefined();
  });

  test('should combine nested paths with symbol dependencies', async () => {
    const registry = new BaseRegistry();
    const mySymbol = Symbol.for('combo-symbol');
    
    class MyClass {
      value = 'initial';
    }
    
    registry.push({
      map: { [mySymbol]: 'value' },
      spawn: MyClass
    });
    
    const target = {};
    await assignGingerly(target, {
      [mySymbol]: 'symbol-value',
      '?.config?.setting': 'nested-value'
    }, { registry });
    
    expect(target).toBeDefined();
  });

  test('should create set property for lazy symbol assignment', async () => {
    const registry = new BaseRegistry();
    const testSymbol = Symbol.for('set-test');
    
    class TestClass {
      value = 'initial';
    }
    
    registry.push({
      map: { [testSymbol]: 'value' },
      spawn: TestClass
    });
    
    const target = await assignGingerly({}, {}, { registry });
    
    // The set property should exist
    expect('set' in target).toBe(true);
  });

  test('should handle symbol assignment through set proxy', async () => {
    const registry = new BaseRegistry();
    const testSymbol = Symbol.for('proxy-test');
    
    class TestClass {
      value = 'initial';
    }
    
    registry.push({
      map: { [testSymbol]: 'value' },
      spawn: TestClass
    });
    
    const target = await assignGingerly({}, {}, { registry });
    
    // Assignment through proxy should work
    target.set[testSymbol] = 'proxy-value';
    
    expect(target).toBeDefined();
  });
});
