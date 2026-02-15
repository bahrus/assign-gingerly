import { test, expect } from '@playwright/test';
import assignGingerly, { BaseRegistry } from '../assignGingerly.js';

test.describe('assignGingerly - canSpawn Support', () => {
  test('should respect canSpawn returning false for dependency injection', () => {
    const registry = new BaseRegistry();
    const testSymbol = Symbol.for('canSpawn-test');
    
    let spawnAttempts = 0;
    
    class TestClass {
      value = 'initial';
      
      constructor() {
        spawnAttempts++;
      }
      
      static canSpawn(obj: any, ctx: any) {
        // Only spawn for objects with allowSpawn property
        return obj.allowSpawn === true;
      }
    }
    
    registry.push({
      symlinks: { [testSymbol]: 'value' },
      spawn: TestClass
    });
    
    // Object without allowSpawn - should not spawn
    const target1 = {};
    assignGingerly(target1, { [testSymbol]: 'test-value' }, { registry });
    
    // Should not have spawned
    expect(spawnAttempts).toBe(0);
    
    // Object with allowSpawn - should spawn
    const target2 = { allowSpawn: true };
    assignGingerly(target2, { [testSymbol]: 'test-value' }, { registry });
    
    // Should have spawned once
    expect(spawnAttempts).toBe(1);
  });

  test('should respect canSpawn returning true', () => {
    const registry = new BaseRegistry();
    const testSymbol = Symbol.for('canSpawn-true-test');
    
    class TestClass {
      value = 'initial';
      
      static canSpawn(obj: any, ctx: any) {
        return true; // Always allow spawning
      }
    }
    
    registry.push({
      symlinks: { [testSymbol]: 'value' },
      spawn: TestClass
    });
    
    const target = {};
    assignGingerly(target, { [testSymbol]: 'test-value' }, { registry });
    
    expect('set' in target).toBe(true);
  });

  test('should work without canSpawn method (default behavior)', () => {
    const registry = new BaseRegistry();
    const testSymbol = Symbol.for('no-canSpawn-test');
    
    class TestClass {
      value = 'initial';
      // No canSpawn method
    }
    
    registry.push({
      symlinks: { [testSymbol]: 'value' },
      spawn: TestClass
    });
    
    const target = {};
    assignGingerly(target, { [testSymbol]: 'test-value' }, { registry });
    
    // Should spawn normally
    expect('set' in target).toBe(true);
  });

  test('should pass correct context to canSpawn', () => {
    const registry = new BaseRegistry();
    const testSymbol = Symbol.for('canSpawn-ctx-test');
    
    let receivedObj: any = null;
    let receivedCtx: any = null;
    
    class TestClass {
      value = 'initial';
      
      static canSpawn(obj: any, ctx: any) {
        receivedObj = obj;
        receivedCtx = ctx;
        return true;
      }
    }
    
    const registryItem = {
      symlinks: { [testSymbol]: 'value' },
      spawn: TestClass
    };
    
    registry.push(registryItem);
    
    const target = { testProp: 'test' };
    assignGingerly(target, { [testSymbol]: 'test-value' }, { registry });
    
    expect(receivedObj).toBe(target);
    expect(receivedCtx).toBeDefined();
    expect(receivedCtx.config).toBe(registryItem);
  });

  test('should respect canSpawn for set proxy', () => {
    const registry = new BaseRegistry();
    const testSymbol = Symbol.for('canSpawn-set-proxy-test');
    
    let spawnAttempts = 0;
    
    class TestClass {
      value = 'initial';
      
      constructor() {
        spawnAttempts++;
      }
      
      static canSpawn(obj: any, ctx: any) {
        return obj.allowSpawn === true;
      }
    }
    
    registry.push({
      symlinks: { [testSymbol]: 'value' },
      spawn: TestClass
    });
    
    // Object without allowSpawn
    const target1 = {};
    assignGingerly(target1, {}, { registry });
    
    // Try to set via proxy - should not spawn
    target1.set[testSymbol] = 'proxy-value';
    
    // Should not have spawned
    expect(spawnAttempts).toBe(0);
    
    // Object with allowSpawn
    const target2 = { allowSpawn: true };
    assignGingerly(target2, {}, { registry });
    
    // Try to set via proxy - should spawn
    target2.set[testSymbol] = 'proxy-value';
    
    // Should have spawned once
    expect(spawnAttempts).toBe(1);
  });

  test('should work with element type checking', () => {
    const registry = new BaseRegistry();
    const testSymbol = Symbol.for('canSpawn-element-test');
    
    let plainObjSpawnAttempts = 0;
    let elementSpawnAttempts = 0;
    
    class ElementOnlyClass {
      value = 'initial';
      
      constructor() {
        if (typeof Element !== 'undefined' && this instanceof ElementOnlyClass) {
          elementSpawnAttempts++;
        } else {
          plainObjSpawnAttempts++;
        }
      }
      
      static canSpawn(obj: any, ctx: any) {
        // Only spawn for Element instances
        return typeof Element !== 'undefined' && obj instanceof Element;
      }
    }
    
    registry.push({
      symlinks: { [testSymbol]: 'value' },
      spawn: ElementOnlyClass
    });
    
    // Plain object - should not spawn
    const plainObj = {};
    assignGingerly(plainObj, { [testSymbol]: 'test-value' }, { registry });
    expect(plainObjSpawnAttempts).toBe(0);
    
    // Element - should spawn (if Element is available)
    if (typeof Element !== 'undefined') {
      const element = document.createElement('div');
      assignGingerly(element, { [testSymbol]: 'test-value' }, { registry });
      expect(elementSpawnAttempts).toBe(1);
    }
  });

  test('should work with custom object type checking', () => {
    const registry = new BaseRegistry();
    const testSymbol = Symbol.for('canSpawn-custom-type-test');
    
    let plainObjSpawnAttempts = 0;
    let customObjSpawnAttempts = 0;
    
    class CustomType {
      customProp = true;
    }
    
    class CustomTypeOnlyClass {
      value = 'initial';
      
      constructor() {
        customObjSpawnAttempts++;
      }
      
      static canSpawn(obj: any, ctx: any) {
        const result = obj instanceof CustomType;
        if (!result) plainObjSpawnAttempts++;
        return result;
      }
    }
    
    registry.push({
      symlinks: { [testSymbol]: 'value' },
      spawn: CustomTypeOnlyClass
    });
    
    // Plain object - should not spawn
    const plainObj = {};
    assignGingerly(plainObj, { [testSymbol]: 'test-value' }, { registry });
    expect(plainObjSpawnAttempts).toBe(1); // canSpawn was called but returned false
    expect(customObjSpawnAttempts).toBe(0); // constructor not called
    
    // CustomType instance - should spawn
    const customObj = new CustomType();
    assignGingerly(customObj, { [testSymbol]: 'test-value' }, { registry });
    expect(customObjSpawnAttempts).toBe(1); // constructor was called
  });

  test('should not spawn multiple times if canSpawn blocks it', () => {
    const registry = new BaseRegistry();
    const testSymbol = Symbol.for('canSpawn-multiple-test');
    
    let spawnCount = 0;
    
    class TestClass {
      value = 'initial';
      
      constructor() {
        spawnCount++;
      }
      
      static canSpawn(obj: any, ctx: any) {
        return false; // Never allow spawning
      }
    }
    
    registry.push({
      symlinks: { [testSymbol]: 'value' },
      spawn: TestClass
    });
    
    const target = {};
    
    // Try multiple times
    assignGingerly(target, { [testSymbol]: 'value1' }, { registry });
    assignGingerly(target, { [testSymbol]: 'value2' }, { registry });
    assignGingerly(target, { [testSymbol]: 'value3' }, { registry });
    
    // Should never have spawned
    expect(spawnCount).toBe(0);
  });

  test('should allow conditional spawning based on object properties', () => {
    const registry = new BaseRegistry();
    const testSymbol = Symbol.for('canSpawn-conditional-test');
    
    let spawnCount = 0;
    
    class ConditionalClass {
      value = 'initial';
      
      constructor() {
        spawnCount++;
      }
      
      static canSpawn(obj: any, ctx: any) {
        // Only spawn if object has specific version
        return obj.version && obj.version >= 2;
      }
    }
    
    registry.push({
      symlinks: { [testSymbol]: 'value' },
      spawn: ConditionalClass
    });
    
    // Version 1 - should not spawn
    const obj1 = { version: 1 };
    assignGingerly(obj1, { [testSymbol]: 'test' }, { registry });
    expect(spawnCount).toBe(0);
    
    // Version 2 - should spawn
    const obj2 = { version: 2 };
    assignGingerly(obj2, { [testSymbol]: 'test' }, { registry });
    expect(spawnCount).toBe(1);
    
    // Version 3 - should spawn
    const obj3 = { version: 3 };
    assignGingerly(obj3, { [testSymbol]: 'test' }, { registry });
    expect(spawnCount).toBe(2);
  });
});
