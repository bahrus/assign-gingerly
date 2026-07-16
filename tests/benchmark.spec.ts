import { test, expect } from '@playwright/test';

/**
 * JS Framework Benchmark — local approximation.
 * Measures manageTemplateList, vanilla JS (createElement), and vanilla JS (template clone).
 * Reports timing comparison in test output (informational).
 */

interface BenchResult { name: string; elapsed: number; rows: number }

async function runBenchmarkPage(page: any, url: string, label: string): Promise<BenchResult[]> {
    await page.goto(url);
    await page.waitForSelector('#btn-create');

    const results: BenchResult[] = [];

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

    return results;
}

test.describe('manageTemplateList Benchmark', () => {
    test('should benchmark manageTemplateList vs vanilla vs vanilla-template', async ({ page }) => {
        const mtlResults = await runBenchmarkPage(
            page,
            'http://localhost:8000/demos/js-framework-benchmark.html',
            'manageTemplateList'
        );

        const vanillaResults = await runBenchmarkPage(
            page,
            'http://localhost:8000/demos/js-framework-benchmark-vanilla.html',
            'Vanilla (createElement)'
        );

        const vanillaTplResults = await runBenchmarkPage(
            page,
            'http://localhost:8000/demos/js-framework-benchmark-vanilla-template.html',
            'Vanilla (template clone)'
        );

        // Print full comparison table
        const ops = ['Create 1,000', 'Update every 10th', 'Swap rows 1↔998', 'Append 1,000', 'Clear', 'Create 10,000'];

        console.log('\n' + '═'.repeat(75));
        console.log('  manageTemplateList BENCHMARK — COMPARISON');
        console.log('═'.repeat(75));
        console.log(`${'Operation'.padEnd(22)} ${'MTL'.padStart(8)} ${'Van-CE'.padStart(8)} ${'Van-Tpl'.padStart(8)} ${'MTL/CE'.padStart(8)} ${'MTL/Tpl'.padStart(8)}`);
        console.log('─'.repeat(75));

        for (let i = 0; i < Math.min(ops.length, mtlResults.length, vanillaResults.length, vanillaTplResults.length); i++) {
            const mtl = mtlResults[i];
            const van = vanillaResults[i];
            const tpl = vanillaTplResults[i];
            const ratioCE = (mtl.elapsed / van.elapsed).toFixed(2);
            const ratioTpl = (mtl.elapsed / tpl.elapsed).toFixed(2);
            console.log(
                `${mtl.name.padEnd(22)} ` +
                `${(mtl.elapsed.toFixed(1) + 'ms').padStart(8)} ` +
                `${(van.elapsed.toFixed(1) + 'ms').padStart(8)} ` +
                `${(tpl.elapsed.toFixed(1) + 'ms').padStart(8)} ` +
                `${(ratioCE + 'x').padStart(8)} ` +
                `${(ratioTpl + 'x').padStart(8)}`
            );
        }
        console.log('═'.repeat(75));
        console.log('  MTL = manageTemplateList | Van-CE = Vanilla createElement | Van-Tpl = Vanilla template clone');
        console.log('  Ratio < 1.0 means MTL is faster\n');

        expect(mtlResults.length).toBeGreaterThanOrEqual(5);
        expect(vanillaResults.length).toBeGreaterThanOrEqual(5);
        expect(vanillaTplResults.length).toBeGreaterThanOrEqual(5);
    });
});
