import { test, expect } from '@playwright/test';

test('Substitutions › should run all substitution tests in browser', async ({ page }) => {
  await page.goto('http://localhost:8000/tests/substitutions.html');
  await page.waitForFunction(() => window.testResults !== undefined, { timeout: 5000 });
  const results = await page.evaluate(() => window.testResults);
  console.log(`Substitution tests: ${results.passed}/${results.total} passed`);
  results.results.forEach((result: string) => console.log(result));
  expect(results.passed).toBe(results.total);
});
