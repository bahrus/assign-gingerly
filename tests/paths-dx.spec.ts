import { test, expect } from '@playwright/test';
import { md, paths, set, smoothOver, sp } from '../DX/paths.js';

type VM = {
  clone: {
    querySelector(selector: string): { hidden: boolean; disabled: boolean };
  };
  expanded: boolean;
  ariaExpanded: string;
};

test.describe('assign-gingerly DX paths helpers', () => {
  test('smoothOver keeps callable path proxies in JSON output', () => {
    const $ = paths<VM>({ aka: { q: 'querySelector' } });

    const config = smoothOver({
      assign: {
        expandButton: $.clone.querySelector('[name=expand]'),
        collapseButton: $.clone.querySelector('[name=collapse]'),
        [$.ariaExpanded.Path]: $.expanded,
      },
    });

    expect(config).toEqual({
      assign: {
        expandButton: '?.clone?.q?.[name=expand]',
        collapseButton: '?.clone?.q?.[name=collapse]',
        '?.ariaExpanded': '?.expanded',
      },
    });
  });

  test('set, sp, and md accept callable path proxies directly', () => {
    const $ = paths<VM>({ aka: { q: 'querySelector' } });

    expect(set($.clone.querySelector('[name=expand]')).to($.expanded)).toEqual({
      '?.clone?.q?.[name=expand]': '?.expanded',
    });

    expect(sp`${$.expanded} ${$.clone.querySelector('[name=collapse]')}`).toEqual([
      '?.expanded',
      ' ',
      '?.clone?.q?.[name=collapse]',
    ]);

    expect(md`${$.expanded} ${$.clone.querySelector('[name=expand]')}`).toEqual([
      { prop: 'expanded', val: '?.expanded' },
      ' ',
      { prop: '[name=expand]', val: '?.clone?.q?.[name=expand]' },
    ]);
  });
});

test.describe('assign-gingerly DX reserved tokens', () => {
  test('normalize reserved terminal tokens into command strings', () => {
    const $ = paths<any>({ aka: { q: 'querySelector' } });

    expect($.foo.Path).toBe('?.foo');
    expect($.ariaControlsElements.Each.hidden.EqNot.Path).toBe('?.ariaControlsElements?.@each?.hidden =!');
    expect($.count.PlusEq.Path).toBe('?.count +=');
    expect($.text.QMEq.Path).toBe('?.text ?=');
    expect($.style.YEq.Path).toBe('?.style Y=');
    expect($.data.MinusEq.Path).toBe('?.data -=');
    expect($.handler.Arrow.Path).toBe('?.handler =>');

    expect(set($.count.PlusEq).to(1)).toEqual({ '?.count +=': 1 });
    expect(smoothOver({ assign: { value: $.ariaControlsElements.Each.hidden.EqNot } })).toEqual({
      assign: { value: '?.ariaControlsElements?.@each?.hidden =!' },
    });
  });

  test('sp and md continue to accept Path and reserved tokens', () => {
    const $ = paths<any>({ aka: { q: 'querySelector' } });

    expect(sp`${$.foo.Path} ${$.bar}`).toEqual(['?.foo', ' ', '?.bar']);
    expect(md`${$.foo} ${$.bar}`).toEqual([
      { prop: 'foo', val: '?.foo' },
      ' ',
      { prop: 'bar', val: '?.bar' },
    ]);
  });

  test('path segments named after Object.prototype members are treated as plain segments', () => {
    // Regression: getReservedToken used `prop in COMMAND_TOKEN_SUFFIXES`, which
    // is true for inherited members like `toLocaleString`/`toString`/`valueOf`,
    // so `$.count.toLocaleString` produced a garbled path containing the native
    // function source.
    const $ = paths<any>();

    expect($.count.toLocaleString.Path).toBe('?.count?.toLocaleString');
    expect($.count.toLocaleString().Path).toBe('?.count?.toLocaleString');
    expect($.foo.toString.Path).toBe('?.foo?.toString');
    expect($.foo.valueOf.Path).toBe('?.foo?.valueOf');
    expect($.foo.constructor.Path).toBe('?.foo?.constructor');
    expect($.foo.hasOwnProperty.Path).toBe('?.foo?.hasOwnProperty');

    // With reverse aliasing, the trailing method name maps to its emoji alias.
    const $a = paths<any>({ aka: { '🌐': 'toLocaleString' } });
    expect(set($a.countData.textContent).to($a.count.toLocaleString())).toEqual({
      '?.countData?.textContent': '?.count?.🌐',
    });
  });
});
