import { test, expect } from '@playwright/test';

/**
 * JS Framework Benchmark — local approximation.
 * Measures manageTemplateList performance for standard list operations.
 * Reports timing in test output (not a pass/fail test — informational).
 */
test.describe('manageTemplateList Benchmark', () => {
    test('should benchmark standard list operations', async ({ page }) => {
        await page.goto('http://localhost:8000/demos/js-framework-benchmark.html');

        // Wait for page to be ready
        await page.waitForSelector('#btn-create');

        const results: { name: string; elapsed: number; rows: number }[] = [];

        async function runOp(buttonId: string, expectedName: string) {
            await page.click(`#${buttonId}`);
            // Wait for the results to update with the new entry
            await page.waitForFunction(
                (name) => {
                    const el = document.getElementById('results');
                    return el && el.textContent!.includes(name);
                },
                expectedName,
                { timeout: 60000 }
            );

            // Extract the latest timing
            const text = await page.textContent('#results');
            const lines = text!.trim().split('\n');
            const lastLine = lines[lines.length - 1];
            const match = lastLine.match(/(\S+.*?)\s+([\d.]+)ms\s+\((\d+) rows\)/);
            if (match) {
                results.push({
                    name: match[1].trim(),
                    elapsed: parseFloat(match[2]),
                    rows: parseInt(match[3])
                });
            }
        }

        // Run benchmark operations in sequence
        await runOp('btn-create', 'Create 1,000');
        await runOp('btn-update', 'Update every 10th');
        await runOp('btn-swap', 'Swap rows 1↔998');
        await runOp('btn-append', 'Append 1,000');
        await runOp('btn-clear', 'Clear');
        await runOp('btn-create10k', 'Create 10,000');
        await runOp('btn-clear', 'Clear');

        // Report results
        console.log('\n=== manageTemplateList Benchmark Results ===');
        console.log('─'.repeat(50));
        for (const r of results) {
            console.log(`${r.name.padEnd(25)} ${r.elapsed.toFixed(1).padStart(8)}ms  (${r.rows} rows)`);
        }
        console.log('─'.repeat(50));

        // Sanity check — operations completed
        expect(results.length).toBeGreaterThanOrEqual(5);
    });
});
