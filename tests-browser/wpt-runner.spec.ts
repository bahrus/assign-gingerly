import { test, expect } from '@playwright/test';

/**
 * This test file runs WPT (Web Platform Tests) in actual browser JavaScript engines.
 * Instead of running tests in Node.js, Playwright opens HTML pages in real browsers.
 * 
 * This means:
 * - Tests run with the browser's native JavaScript engine (V8, SpiderMonkey, JavaScriptCore)
 * - No polyfill needed for getOrInsertComputed in modern browsers
 * - Tests can be debugged by opening the HTML files directly
 */

const testPages = [
  { name: 'All Tests (Comprehensive)', path: '/wpt/assignGingerly-all-tests.html' },
  { name: 'Basic Functionality', path: '/wpt/assignGingerly-basic.html' },
  { name: 'Object Extension - Basic', path: '/wpt/object-extension-basic.html' },
  { name: 'Object Extension - Nested Paths', path: '/wpt/object-extension-nested.html' },
  { name: 'Object Extension - DI', path: '/wpt/object-extension-di.html' },
  { name: 'Object Extension - Edge Cases', path: '/wpt/object-extension-edge-cases.html' },
  { name: 'Object Extension - Can Spawn', path: '/wpt/object-extension-can-spawn.html' },
  { name: 'Object Extension - Custom Registry', path: '/wpt/object-extension-custom-registry.html' },
  { name: 'Object Extension - Tentatively', path: '/wpt/object-extension-tentatively.html' },
  { name: 'Object Extension - Enh Dispose', path: '/wpt/object-extension-enh-dispose.html' },
  { name: 'Object Extension - Enh Get', path: '/wpt/object-extension-enh-get.html' },
  { name: 'Object Extension - Enh Set Proxy', path: '/wpt/object-extension-enh-set-proxy.html' },
  { name: 'Object Extension - Enh When Resolved', path: '/wpt/object-extension-enh-when-resolved.html' },
  { name: 'Object Extension - Get Method', path: '/wpt/object-extension-get-method.html' },
  { name: 'Object Extension - Global Instance Map', path: '/wpt/object-extension-global-instance-map.html' },
  { name: 'Object Extension - Registry Item Key', path: '/wpt/object-extension-registry-item-key.html' },
  { name: 'Object Extension - Set Proxy', path: '/wpt/object-extension-set-proxy.html' },
  { name: 'Object Extension - Shared Instances', path: '/wpt/object-extension-shared-instances.html' },
  { name: 'Object Extension - WithAttrs No EnhKey', path: '/wpt/object-extension-withattrs-no-enhkey.html' },
  { name: 'ParseWithAttrs - Caching', path: '/wpt/parseWithAttrs-caching.html' },
  { name: 'ParseWithAttrs - Enh Prefix', path: '/wpt/parseWithAttrs-enh-prefix.html' },
  { name: 'ParseWithAttrs - Named Parsers', path: '/wpt/parseWithAttrs-named-parsers.html' },
  { name: 'ParseWithAttrs - ValIfNull', path: '/wpt/parseWithAttrs-valIfNull.html' },
  { name: 'BuildCSSQuery', path: '/wpt/buildCSSQuery.html' },
  { name: 'ResolveTemplate', path: '/wpt/resolveTemplate.html' },
];

for (const testPage of testPages) {
  test(testPage.name, async ({ page }) => {
    // Navigate to the test page
    await page.goto(testPage.path);
    
    // Wait for tests to complete
    // The testharness.js framework adds a 'completion' class when done
    await page.waitForSelector('#log', { timeout: 30000 });
    
    // Give tests time to run
    await page.waitForTimeout(2000);
    
    // Check for test results
    const results = await page.evaluate(() => {
      // Access the test harness results
      const logElement = document.getElementById('log');
      if (!logElement) {
        return { error: 'Test log element not found' };
      }
      
      // Count pass/fail from the test harness
      const passElements = document.querySelectorAll('.pass');
      const failElements = document.querySelectorAll('.fail');
      const timeoutElements = document.querySelectorAll('.timeout');
      
      const passed = passElements.length;
      const failed = failElements.length;
      const timedOut = timeoutElements.length;
      const total = passed + failed + timedOut;
      
      // Get failure details
      const failures: string[] = [];
      failElements.forEach((el) => {
        const testName = el.querySelector('h3')?.textContent || 'Unknown test';
        const errorMsg = el.querySelector('pre')?.textContent || 'No error message';
        failures.push(`${testName}: ${errorMsg}`);
      });
      
      return {
        passed,
        failed,
        timedOut,
        total,
        failures,
        success: failed === 0 && timedOut === 0 && total > 0
      };
    });
    
    // Log results
    console.log(`${testPage.name}: ${results.passed}/${results.total} tests passed`);
    
    if (results.failures && results.failures.length > 0) {
      console.error('Failures:', results.failures);
    }
    
    // Assert all tests passed
    expect(results.success, 
      `${results.failed} test(s) failed, ${results.timedOut} timed out. Failures: ${results.failures?.join(', ')}`
    ).toBe(true);
    
    // Ensure at least some tests ran
    expect(results.total).toBeGreaterThan(0);
  });
}

// Special test to verify getOrInsertComputed support
test('Browser has native getOrInsertComputed support', async ({ page, browserName }) => {
  await page.goto('/wpt/index.html');
  
  const hasNativeSupport = await page.evaluate(() => {
    return typeof WeakMap.prototype.getOrInsertComputed === 'function';
  });
  
  console.log(`${browserName}: getOrInsertComputed support = ${hasNativeSupport ? 'Native' : 'Polyfill'}`);
  
  // This is informational - we don't fail if polyfill is needed
  // But we log it so you can see which browsers have native support
  if (hasNativeSupport) {
    console.log(`✓ ${browserName} has native getOrInsertComputed support!`);
  } else {
    console.log(`⚠ ${browserName} using polyfill for getOrInsertComputed`);
  }
});
