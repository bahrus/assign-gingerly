# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: benchmark.spec.ts >> manageTemplateList Benchmark >> should benchmark manageTemplateList vs vanilla vs vanilla-template
- Location: tests\benchmark.spec.ts:59:5

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.waitForSelector: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('#btn-create') to be visible

```

# Page snapshot

```yaml
- list [ref=e2]:
  - listitem [ref=e3]:
    - group [ref=e4]:
      - generic "demo" [ref=e5] [cursor=pointer]
  - listitem [ref=e6]:
    - link "imports.html" [ref=e7] [cursor=pointer]:
      - /url: imports.html
  - listitem [ref=e8]:
    - group [ref=e9]:
      - generic "legacy" [ref=e10] [cursor=pointer]
  - listitem [ref=e11]:
    - link "up-down-counter" [ref=e12] [cursor=pointer]:
      - /url: root.html
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | /**
  4   |  * JS Framework Benchmark — local approximation.
  5   |  * Measures manageTemplateList, vanilla JS (createElement), and vanilla JS (template clone).
  6   |  * Reports timing comparison in test output (informational).
  7   |  */
  8   | 
  9   | interface BenchResult { name: string; elapsed: number; rows: number }
  10  | 
  11  | async function runBenchmarkPage(page: any, url: string, label: string): Promise<BenchResult[]> {
  12  |     await page.goto(url);
> 13  |     await page.waitForSelector('#btn-create');
      |                ^ Error: page.waitForSelector: Test timeout of 30000ms exceeded.
  14  | 
  15  |     // Wait for warmup to complete (if applicable)
  16  |     await page.waitForFunction(() => {
  17  |         const el = document.getElementById('results');
  18  |         return el && (el.textContent!.includes('Warmup complete') || el.textContent!.includes('Click a button'));
  19  |     }, { timeout: 30000 });
  20  | 
  21  |     const results: BenchResult[] = [];
  22  | 
  23  |     async function runOp(buttonId: string, expectedName: string) {
  24  |         await page.click(`#${buttonId}`);
  25  |         await page.waitForFunction(
  26  |             (name: string) => {
  27  |                 const el = document.getElementById('results');
  28  |                 return el && el.textContent!.includes(name);
  29  |             },
  30  |             expectedName,
  31  |             { timeout: 60000 }
  32  |         );
  33  | 
  34  |         const text = await page.textContent('#results');
  35  |         const lines = text!.trim().split('\n');
  36  |         const lastLine = lines[lines.length - 1];
  37  |         const match = lastLine.match(/(\S+.*?)\s+([\d.]+)ms\s+\((\d+) rows\)/);
  38  |         if (match) {
  39  |             results.push({
  40  |                 name: match[1].trim(),
  41  |                 elapsed: parseFloat(match[2]),
  42  |                 rows: parseInt(match[3])
  43  |             });
  44  |         }
  45  |     }
  46  | 
  47  |     await runOp('btn-create', 'Create 1,000');
  48  |     await runOp('btn-update', 'Update every 10th');
  49  |     await runOp('btn-swap', 'Swap rows 1↔998');
  50  |     await runOp('btn-append', 'Append 1,000');
  51  |     await runOp('btn-clear', 'Clear');
  52  |     await runOp('btn-create10k', 'Create 10,000');
  53  |     await runOp('btn-clear', 'Clear');
  54  | 
  55  |     return results;
  56  | }
  57  | 
  58  | test.describe('manageTemplateList Benchmark', () => {
  59  |     test('should benchmark manageTemplateList vs vanilla vs vanilla-template', async ({ page }) => {
  60  |         const mtlResults = await runBenchmarkPage(
  61  |             page,
  62  |             'http://localhost:8000/demos/js-framework-benchmark.html',
  63  |             'manageTemplateList'
  64  |         );
  65  | 
  66  |         const vanillaResults = await runBenchmarkPage(
  67  |             page,
  68  |             'http://localhost:8000/demos/js-framework-benchmark-vanilla.html',
  69  |             'Vanilla (createElement)'
  70  |         );
  71  | 
  72  |         const vanillaTplResults = await runBenchmarkPage(
  73  |             page,
  74  |             'http://localhost:8000/demos/js-framework-benchmark-vanilla-template.html',
  75  |             'Vanilla (template clone)'
  76  |         );
  77  | 
  78  |         // Print full comparison table
  79  |         const ops = ['Create 1,000', 'Update every 10th', 'Swap rows 1↔998', 'Append 1,000', 'Clear', 'Create 10,000'];
  80  | 
  81  |         console.log('\n' + '═'.repeat(75));
  82  |         console.log('  manageTemplateList BENCHMARK — COMPARISON');
  83  |         console.log('═'.repeat(75));
  84  |         console.log(`${'Operation'.padEnd(22)} ${'MTL'.padStart(8)} ${'Van-CE'.padStart(8)} ${'Van-Tpl'.padStart(8)} ${'MTL/CE'.padStart(8)} ${'MTL/Tpl'.padStart(8)}`);
  85  |         console.log('─'.repeat(75));
  86  | 
  87  |         for (let i = 0; i < Math.min(ops.length, mtlResults.length, vanillaResults.length, vanillaTplResults.length); i++) {
  88  |             const mtl = mtlResults[i];
  89  |             const van = vanillaResults[i];
  90  |             const tpl = vanillaTplResults[i];
  91  |             const ratioCE = (mtl.elapsed / van.elapsed).toFixed(2);
  92  |             const ratioTpl = (mtl.elapsed / tpl.elapsed).toFixed(2);
  93  |             console.log(
  94  |                 `${mtl.name.padEnd(22)} ` +
  95  |                 `${(mtl.elapsed.toFixed(1) + 'ms').padStart(8)} ` +
  96  |                 `${(van.elapsed.toFixed(1) + 'ms').padStart(8)} ` +
  97  |                 `${(tpl.elapsed.toFixed(1) + 'ms').padStart(8)} ` +
  98  |                 `${(ratioCE + 'x').padStart(8)} ` +
  99  |                 `${(ratioTpl + 'x').padStart(8)}`
  100 |             );
  101 |         }
  102 |         console.log('═'.repeat(75));
  103 |         console.log('  MTL = manageTemplateList | Van-CE = Vanilla createElement | Van-Tpl = Vanilla template clone');
  104 |         console.log('  Ratio < 1.0 means MTL is faster\n');
  105 | 
  106 |         expect(mtlResults.length).toBeGreaterThanOrEqual(5);
  107 |         expect(vanillaResults.length).toBeGreaterThanOrEqual(5);
  108 |         expect(vanillaTplResults.length).toBeGreaterThanOrEqual(5);
  109 |     });
  110 | });
  111 | 
```