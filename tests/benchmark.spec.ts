import { test, expect } from '@playwright/test';

/**
 * JS Framework Benchmark — local approximation.
 * Measures manageTemplateList, builtIns.tree (with and without compile), vanilla JS (createElement),
 * and vanilla JS (template clone).
 * Reports timing comparison in test output (informational).
 */

interface BenchResult { name: string; elapsed: number; rows: number }

async function runBenchmarkPage(page: any, url: string, label: string): Promise<BenchResult[]> {
    await page.goto(url);
    await page.waitForSelector('#btn-create');

    // Wait for warmup to complete (if applicable)
    await page.waitForFunction(() => {
        const el = document.getElementById('results');
        return el && (el.textContent!.includes('Warmup complete') || el.textContent!.includes('Click a button'));
    }, { timeout: 30000 });

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
    test('should benchmark manageTemplateList vs tree vs vanilla vs vanilla-template', async ({ page }) => {
        // Five pages, each including Create 10,000: more than the default 30 s
        test.setTimeout(180_000);
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

        const treeResults = await runBenchmarkPage(
            page,
            'http://localhost:8000/demos/js-framework-benchmark-tree.html',
            'builtIns.tree'
        );

        const treeCompileResults = await runBenchmarkPage(
            page,
            'http://localhost:8000/demos/js-framework-benchmark-tree.html?compile',
            'builtIns.tree (compile)'
        );

        // Print full comparison table
        const ops = ['Create 1,000', 'Update every 10th', 'Swap rows 1↔998', 'Append 1,000', 'Clear', 'Create 10,000'];
        const columns: [string, BenchResult[]][] = [
            ['MTL', mtlResults], ['Tree', treeResults], ['Tree-C', treeCompileResults], ['Van-CE', vanillaResults], ['Van-Tpl', vanillaTplResults],
        ];

        console.log('\n' + '═'.repeat(75));
        console.log('  manageTemplateList / builtIns.tree BENCHMARK — COMPARISON');
        console.log('═'.repeat(75));
        console.log(`${'Operation'.padEnd(22)} ${columns.map(([label]) => label.padStart(9)).join(' ')}`);
        console.log('─'.repeat(75));

        const rowCount = Math.min(ops.length, ...columns.map(([, results]) => results.length));
        for (let i = 0; i < rowCount; i++) {
            console.log(`${mtlResults[i].name.padEnd(22)} ${columns.map(([, results]) => (results[i].elapsed.toFixed(1) + 'ms').padStart(9)).join(' ')}`);
        }
        console.log('═'.repeat(75));
        console.log('  MTL = manageTemplateList | Tree / Tree-C = builtIns.tree without / with compile');
        console.log('  Van-CE = Vanilla createElement | Van-Tpl = Vanilla template clone\n');

        expect(mtlResults.length).toBeGreaterThanOrEqual(5);
        expect(vanillaResults.length).toBeGreaterThanOrEqual(5);
        expect(vanillaTplResults.length).toBeGreaterThanOrEqual(5);
        expect(treeResults.length).toBeGreaterThanOrEqual(5);
        expect(treeCompileResults.length).toBeGreaterThanOrEqual(5);
    });
});
