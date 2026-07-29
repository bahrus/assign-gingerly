/**
 * builtInEmoji.ts — Predefined emoji aliases for built-in handlers.
 *
 * Import and spread into the `handlers` option for concise handler configs:
 *
 * @example
 * import { builtInEmoji } from 'assign-gingerly/builtInEmoji.js';
 *
 * assignFrom(target, {
 *     '?.el =>': { do: '🔗', get: { value: ['?.first', ' ', '?.last'] } }
 * }, { from: vm, handlers: builtInEmoji });
 */
/**
 * Emoji → built-in handler name mapping.
 *
 * | Emoji | Handler |
 * |-------|---------|
 * | 📦 | builtIns.lazyLoad |
 * | 🎚️ | builtIns.lazyLoadSwitch |
 * | 🔗 | builtIns.join |
 * | 🏷️ | builtIns.microDataJoin |
 * | 📋 | builtIns.manageTemplateList |
 */
export const builtInEmoji = {
    '📦': 'builtIns.lazyLoad',
    '🎚️': 'builtIns.lazyLoadSwitch',
    '🔗': 'builtIns.join',
    '🏷️': 'builtIns.microDataJoin',
    '📋': 'builtIns.manageTemplateList',
    '📊': 'builtIns.rangeSelector',
};
export const akaMethods = {
    '🔍': 'querySelector',
    '🧺': 'querySelectorAll',
    '+': 'add',
    '🧬': 'cloneNode',
    '🔤': 'textContent',
};
export const aka = {
    '©️': 'content?.cloneNode?.true',
    //'🔎': 'clone?.querySelector'
};
export const emojis = {
    builtInEmoji,
    akaMethods,
};
export default emojis;
