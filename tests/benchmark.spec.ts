import { test, expect } from '@playwright/test';

/**
 * JS Framework Benchmark — local approximation.
 * Measures manageTemplateList performance and vanilla JS baseline.
 * Reports timing in test output (informational).
 */

async function runBenchmarkPage(page: any, url: string, label: string) {
    const consoleMessages: string[] = [];
    page.on('console', (msg: any) => {
        if (msg.text().includes('[manageTemplateList perf]') || msg.text().includes('mtl:')) {
            consoleMessages.push(msg.text());
        }
    });

    await page.goto(url);
    await page.waitForSelector('#btn-create');

    const results: { name: string; elapsed: number; rows: number }[] = [];

    async function runOp(buttonId: string, expectedName: string) {
        await page.click(`#${buttonId}`);
        await page.waitForFunction(
            (name: string) => {
                const el = document.getElementById('results');
                return el && el.textContent!.includes(name);
            },
            expectedName,
            { timeout: 60000 }
        );

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

    await runOp('btn-create', 'Create 1,000');
    await runOp('btn-update', 'Update every 10th');
    await runOp('btn-swap', 'Swap rows 1↔998');
    await runOp('btn-append', 'Append 1,000');
    await runOp('btn-clear', 'Clear');
    await runOp('btn-create10k', 'Create 10,000');
    await runOp('btn-clear', 'Clear');

    console.log(`\n=== ${label} ===`);
    console.log('─'.repeat(50));
    for (const r of results) {
        console.log(`${r.name.padEnd(25)} ${r.elapsed.toFixed(1).padStart(8)}ms  (${r.rows} rows)`);
    }
    console.log('─'.repeat(50));

    if (consoleMessages.length > 0) {
        console.log(`\n--- Profiling (${label}) ---`);
        for (const msg of consoleMessages) {
            console.log(msg);
        }
    }

    return results;
}

test.describe('manageTemplateList Benchmark', () => {
    test('should benchmark manageTemplateList vs vanilla', async ({ page }) => {
        // Run manageTemplateList benchmark
        const mtlResults = await runBenchmarkPage(
            page,
            'http://localhost:8000/demos/js-framework-benchmark.html',
            'manageTemplateList'
        );

        // Run vanilla baseline
        const vanillaResults = await runBenchmarkPage(
            page,
            'http://localhost:8000/demos/js-framework-benchmark-vanilla.html',
            'Vanilla JS (baseline)'
        );

        // Comparison
        console.log('\n=== Comparison (manageTemplateList vs Vanilla) ===');
        console.log('─'.repeat(60));
        console.log(`${'Operation'.padEnd(25)} ${'MTL'.padStart(8)} ${'Vanilla'.padStart(8)} ${'Ratio'.padStart(8)}`);
        console.log('─'.repeat(60));
        for (let i = 0; i < Math.min(mtlResults.length, vanillaResults.length); i++) {
            const mtl = mtlResults[i];
            const van = vanillaResults[i];
            const ratio = (mtl.elapsed / van.elapsed).toFixed(2);
            console.log(`${mtl.name.padEnd(25)} ${(mtl.elapsed.toFixed(1) + 'ms').padStart(8)} ${(van.elapsed.toFixed(1) + 'ms').padStart(8)} ${(ratio + 'x').padStart(8)}`);
        }
        console.log('─'.repeat(60));

        // Sanity check
        expect(mtlResults.length).toBeGreaterThanOrEqual(5);
        expect(vanillaResults.length).toBeGreaterThanOrEqual(5);
    });
});
