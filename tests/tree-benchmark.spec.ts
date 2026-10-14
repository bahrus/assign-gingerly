import { test, expect } from '@playwright/test';

/**
 * builtIns.tree baseline benchmark (Compile roadmap, Step 1).
 * Informational only: Chromium, no thresholds. Prints the results tables.
 */

interface Row { group: string; shape: string; op: string; approach: string; ms: number }

test.describe('builtIns.tree benchmark', () => {
    test('baseline: Tree vs vanilla, nested vs flat templates', async ({ page, browserName }) => {
        test.skip(browserName !== 'chromium', 'Benchmarks run in Chromium only');
        test.setTimeout(300_000);
        page.on('pageerror', err => console.error('Browser error:', err));

        await page.goto('http://localhost:8000/demos/tree-benchmark.html');
        await page.waitForSelector('#done[data-status]:not([data-status=""])', { timeout: 290_000, state: 'attached' });
        expect(await page.getAttribute('#done', 'data-status')).toBe('success');

        const rows: Row[] = await page.evaluate(() => (window as any).__treeBenchmark);
        for (const [group, baseline] of [['B1', 'template clone'], ['B2', 'flat']]) {
            const groupRows = rows.filter(r => r.group === group);
            console.log(`\n${group === 'B1' ? 'B1 — Tree vs. vanilla' : 'B2 — nested vs. flat templates'} (× ${baseline})`);
            for (const r of groupRows) {
                const base = groupRows.find(b => b.shape === r.shape && b.op === r.op && b.approach === baseline)?.ms;
                const ratio = base ? (r.ms / base).toFixed(2) : '';
                console.log(`${r.shape.padEnd(22)} ${r.op.padEnd(14)} ${r.approach.padEnd(19)} ${r.ms.toFixed(1).padStart(8)} ms  ${ratio.padStart(6)}`);
            }
        }
    });
});
