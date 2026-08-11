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
export const builtInEmoji= {
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
    '-': 'remove',
    '🧬': 'cloneNode',
    '🔄️': 'reset',
    '🎯': 'closest',
    '✅': 'matches',
    '☑️': 'checkValidity',
    '📤': 'submit',
    '🎚️': 'toggle',
    '📦': 'contains',
    '🏷️': 'setAttribute',
    '✂️': 'removeAttribute',
    '📝': 'log',
    '⚠️': 'warn',
    '🚨': 'error',
    '🤱': 'appendChild'
    //'🧩': 'includes'
};

export const aka = {
    '©️': 'content?.cloneNode?.true',
    //'🔎': 'clone?.querySelector'
    // textContent is a property, not a method — aliasing it via akaMethods
    // would add it to withMethods and turn `?.textContent` assignments into
    // silently-skipped method calls.
    '🔤': 'textContent',
};


export const emojis = {
    builtInEmoji,
    akaMethods,
    aka
}

export default emojis;
