/**
 * builtInEmoji.ts — Predefined emoji aliases for built-in handlers.
 *
 * Import and spread into the `handlers` option for concise handler configs:
 *
 * @example
 * import { builtInEmoji } from 'assign-gingerly/builtInEmoji.js';
 *
 * assignFrom(target, {
 *     '?.el =>': { do: '🏷️', get: { template: [...] } }
 * }, { from: vm, handlers: builtInEmoji });
 */
/**
 * Emoji → built-in handler name mapping.
 *
 * | Emoji | Handler |
 * |-------|---------|
 * | 📦 | builtIns.lazyLoad |
 * | 🎚️ | builtIns.lazyLoadSwitch |
 * | 🏷️ | builtIns.microDataJoin |
 * | 📋 | builtIns.manageTemplateList |
 *
 * `join` is no longer a `do:` handler — it moved to the synchronous ` =&` operator
 * (see syncOps/join.ts) and isn't looked up through options.handlers, so it has no
 * emoji alias here.
 */
export const builtInEmoji = {
    '📦': 'builtIns.lazyLoad',
    '🎚️': 'builtIns.lazyLoadSwitch',
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
    '🤱': 'appendChild',
    '😣': 'focus',
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
};
export default emojis;
