import { test, expect } from '@playwright/test';

/**
 * The modules a server-side renderer (e.g. a stringify package) builds on must run without a
 * DOM. This imports them straight into Node, where there's no window or document, and
 * exercises what they export for that purpose.
 */
test.describe('pure modules (no DOM)', () => {
  test('import and run in Node', async ({ browserName }) => {
    test.skip(browserName !== 'chromium', 'Node-side check; once is enough');
    expect(typeof (globalThis as any).document).toBe('undefined');
    const url = (path: string) => new URL(`../${path}`, import.meta.url).href;
    const treeSpec = await import(url('handlers/treeSpec.js'));
    const { compileTree, toHTML, classifyPatternKey, attributeText, isLiteral } = await import(url('handlers/compileTree.js'));
    const { getValue } = await import(url('resolve/getValues.js'));
    const { planMicroJoin } = await import(url('syncOps/microJoin.js'));
    const { tree, each, choose } = await import(url('DX/tree.js'));
    const resolve = (path: string, from: any) => getValue(path, from, { pipes: { upper: (s: string) => s.toUpperCase() } });

    // mapEntries: map order, then '*' keys; nullish skipped unless keepNullish
    const map = { title: ['h2', '?.'], gone: 'p', '*': 'span' };
    const entries = treeSpec.mapEntries(map, { extra: 1, title: 'T', gone: null });
    expect(entries.map((e: any) => `${e.key}:${e.templateKey}`)).toEqual(['title:title', 'extra:*']);
    expect(treeSpec.mapEntries(map, { title: 'T', gone: null }, true).map((e: any) => e.key)).toEqual(['title', 'gone']);

    // chooseCase: String() matching, default, nothing
    const sw = choose('?.phase', { hold: tree`<b>Hold</b>`, 2: tree`<i>Two</i>` }, tree`<p>Other</p>`);
    expect(treeSpec.chooseCase(sw, { phase: 'hold' }, resolve).caseKey).toBe('hold');
    expect(treeSpec.chooseCase(sw, { phase: 2 }, resolve).caseKey).toBe('2');
    expect(treeSpec.chooseCase(sw, { phase: 'x' }, resolve).caseKey).toBe(treeSpec.DEFAULT_CASE);
    expect(treeSpec.chooseCase({ switch: '?.k', cases: {} }, {}, resolve).spec).toBeUndefined();

    // repeatItems: of, keys, duplicates, empty
    const list = tree`<ul ${each('?.crew', { key: '?.id', empty: tree`<li>None</li>` })}><li>${'?.name'}</li></ul>`;
    const repeat = treeSpec.normalize(list)[5];
    const stamped = treeSpec.repeatItems(repeat, { crew: [{ id: 'a' }, { id: 'b' }, { id: 'a' }] }, resolve);
    expect(stamped.keys.slice(0, 2)).toEqual(['a', 'b']);
    expect(typeof stamped.keys[2]).toBe('symbol');
    expect(stamped.duplicate).toBe('a');
    expect(stamped.pushesHolder).toBe(true);
    expect(treeSpec.repeatItems(repeat, { crew: [] }, resolve).empty).toEqual(['li', { textContent: 'None' }]);

    // classifyPatternKey, isLiteral, attributeText
    const aka = { _: 'textContent' };
    expect(classifyPatternKey('_', '?.x', aka)).toEqual({ kind: 'text' });
    expect(classifyPatternKey('class :=', 'card', aka)).toEqual({ kind: 'attribute', name: 'class' });
    expect(classifyPatternKey('className', 'card', aka)).toEqual({ kind: 'property', name: 'className' });
    expect(classifyPatternKey('ish', {}, aka)).toEqual({ kind: 'ish' });
    expect(classifyPatternKey(' +=', { on: 'click', call: 'go' }, aka)).toEqual({ kind: 'event' });
    expect(classifyPatternKey('?. =&', { microJoin: [] }, aka)).toEqual({ kind: 'syncOp' });
    expect(classifyPatternKey('_ ?=', [], aka)).toEqual({ kind: 'other' });
    expect(isLiteral('card')).toBe(true);
    expect(isLiteral('?.x')).toBe(false);
    expect(attributeText(['a', null, 'b'])).toBe('a b');

    // compileTree + toHTML, getValue with pipes, planMicroJoin
    const { templates } = compileTree({ map: { card: tree`<article class="card"><h3>Title</h3></article>` } });
    expect(toHTML(templates.card.element)).toBe('<article class="card"><h3>Title</h3></article>');
    expect(resolve('?.name?.upper', { name: 'falcon' })).toBe('FALCON');
    const plan = planMicroJoin(['Launched ', 7], ['Launched ', '?.n']);
    expect(plan.complete).toBe(true);
  });
});
