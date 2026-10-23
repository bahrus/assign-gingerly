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
  test('snippetParts: holes found without a DOM', async ({ browserName }) => {
    test.skip(browserName !== 'chromium', 'Node-side check; once is enough');
    const url = (path: string) => new URL(`../${path}`, import.meta.url).href;
    const { snippetParts } = await import(url('handlers/treeSpec.js'));
    const html = '<header class="head"><svg viewBox="0 0 2 2"><path d="M0 0"/></svg>'
      + '<h3 class="t" data-hole="title" title="a &amp; b">Fallback <em>text</em></h3></header>'
      + '<!-- <b data-hole="not-a-hole"> --><style>p > b { color: red }</style>'
      + '<ul data-hole=specs><li>One</li><li><ul><li>Nested</li></ul></li></ul><img data-hole="pic" alt=x>';
    const parts = snippetParts(html);
    expect(parts.length).toBe(5);
    expect(parts[0]).toBe('<header class="head"><svg viewBox="0 0 2 2"><path d="M0 0"/></svg>');
    expect(parts[1]).toEqual({
      hole: 'title', tag: 'h3', attrs: [['class', 't'], ['title', 'a & b']],
      open: '<h3 class="t" title="a &amp; b">', fallback: 'Fallback <em>text</em>', close: '</h3>',
    });
    expect(parts[2]).toBe('</header><!-- <b data-hole="not-a-hole"> --><style>p > b { color: red }</style>');
    expect(parts[3]).toMatchObject({ hole: 'specs', tag: 'ul', open: '<ul>', fallback: '<li>One</li><li><ul><li>Nested</li></ul></li>', close: '</ul>' });
    expect(parts[4]).toMatchObject({ hole: 'pic', tag: 'img', attrs: [['alt', 'x']], open: '<img alt=x>', fallback: '', close: '' });
    // Written back unfilled, the holes are what builtIns.tree's clone has: the same markup without data-hole
    const unfilled = parts.map((p: any) => typeof p === 'string' ? p : p.open + p.fallback + p.close).join('');
    expect(unfilled).toBe(html.replace(/ data-hole=("[^"]*"|\w+)/g, '').replace('<!-- <b> -->', '<!-- <b data-hole="not-a-hole"> -->'));
    expect(snippetParts('<p>No holes</p>')).toEqual(['<p>No holes</p>']);
    // Refused, as builtIns.tree refuses them
    expect(() => snippetParts('<b data-hole="a"></b><i data-hole="a"></i>')).toThrow(/two holes named "a"/);
    expect(() => snippetParts('<div data-hole="a"><b data-hole="b"></b></div>')).toThrow(/inside the hole "a"/);
    expect(() => snippetParts('<template><b data-hole="a"></b></template>')).toThrow(/inside a <template>/);
    expect(() => snippetParts('<div data-hole="a"><p>unclosed</div>')).toThrow(/well-formed/);
    expect(() => snippetParts('<div data-hole="a">never closed')).toThrow(/no end tag/);
  });
  test('map keys with a trailing comment name the VM key before it', async ({ browserName }) => {
    test.skip(browserName !== 'chromium', 'Node-side check; once is enough');
    const url = (path: string) => new URL(`../${path}`, import.meta.url).href;
    const { mapKeyName, mapEntries } = await import(url('handlers/treeSpec.js'));
    expect(mapKeyName('rocket')).toBe('rocket');
    expect(mapKeyName('rocket/*2*/')).toBe('rocket');
    expect(mapKeyName('  rocket   /* summary */  ')).toBe('rocket');
    expect(mapKeyName(' spaced ')).toBe(' spaced ');   // no comment: the key as is
    for (const bad of ['rocket /* a */ b', '/* only */', 'a */', 'a /* b /* c */', 'a /* b */ /* c */']) {
      expect(() => mapKeyName(bad)).toThrow(/builtIns\.tree: map key/);
    }
    // Two entries for one VM key, each with its own identity, in map order; '*' counts the commented key as named
    const map = { rocket: 'h3', success: 'span', 'rocket /* summary */': 'div', '*': 'i' };
    const entries = mapEntries(map, { rocket: { n: 1 }, success: true, extra: 'x' });
    expect(entries.map((e: any) => `${e.key}|${e.name}|${e.templateKey}`)).toEqual([
      'rocket|rocket|rocket', 'success|success|success', 'rocket /* summary */|rocket|rocket /* summary */', 'extra|extra|*',
    ]);
    expect(entries[2].value).toBe(entries[0].value);
    const onlyCommented = mapEntries({ 'rocket /* summary */': 'div', '*': 'i' }, { rocket: 1 });
    expect(onlyCommented.map((e: any) => e.key)).toEqual(['rocket /* summary */']);
    // Nullish: skipped by the VM key's value, unless keepNullish
    expect(mapEntries({ 'gone /* x */': 'p' }, { gone: null })).toEqual([]);
    expect(mapEntries({ 'gone /* x */': 'p' }, { gone: null }, true).length).toBe(1);
  });
});
