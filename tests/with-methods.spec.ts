import { test, expect } from '@playwright/test';

test('WithMethods › should run all withMethods tests in browser', async ({ page }) => {
  // Start local server and navigate
  await page.goto('http://localhost:8000/tests/with-methods.html');
  
  // Wait for tests to complete
  await page.waitForFunction(() => window.testResults !== undefined, { timeout: 5000 });
  
  // Get test results
  const results = await page.evaluate(() => window.testResults);
  
  // Log results
  console.log(`WithMethods tests: ${results.passed}/${results.total} passed`);
  results.results.forEach((result: string) => console.log(result));
  
  // Assert all tests passed
  expect(results.passed).toBe(results.total);
});
