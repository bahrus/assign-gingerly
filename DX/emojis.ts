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
export const builtInEmoji: Record<string, string> = {
    '📦': 'builtIns.lazyLoad',
    '🎚️': 'builtIns.lazyLoadSwitch',
    '🔗': 'builtIns.join',
    '🏷️': 'builtIns.microDataJoin',
    '📋': 'builtIns.manageTemplateList',
    '📊': 'builtIns.rangeSelector',
};

export const akaMethods: Record<string, string> = {
    '🔍': 'querySelector',
    '🧺': 'querySelectorAll',
    '+': 'add',
    '🧬': 'cloneNode'
};

export const aka: Record<string, string> = {
    '©️': 'content?.cloneNode?.true',
    //'🔎': 'clone?.querySelector'
};


export const emojis = {
    builtInEmoji,
    akaMethods,
}

export default emojis;
