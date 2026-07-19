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
};

export default builtInEmoji;
