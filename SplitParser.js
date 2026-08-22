/**
 * Escapes regex metacharacters so a string delimiter is treated literally.
 */
function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
/**
 * Built-in class parser that splits an attribute value into an array.
 * Registered under the name 'splitter' in globalParserRegistry.
 */
export class SplitParser {
    delimiter;
    trim;
    skipEmpty;
    dedupe;
    constructor(options) {
        const opts = options ?? {};
        const rawDelimiter = opts.delimiter;
        if (rawDelimiter === undefined) {
            this.delimiter = /\s+/;
        }
        else if (typeof rawDelimiter === 'string') {
            this.delimiter = rawDelimiter === '' ? /(?:)/ : new RegExp(escapeRegex(rawDelimiter));
        }
        else {
            this.delimiter = new RegExp(rawDelimiter.pattern, rawDelimiter.flags ?? '');
        }
        this.trim = opts.trim ?? true;
        this.skipEmpty = opts.skipEmpty ?? true;
        this.dedupe = opts.dedupe ?? false;
    }
    parse(v, _context) {
        if (v === null || v === '') {
            return [];
        }
        let parts = v.split(this.delimiter);
        if (this.trim) {
            parts = parts.map((s) => s.trim());
        }
        if (this.skipEmpty) {
            parts = parts.filter((s) => s !== '');
        }
        if (this.dedupe) {
            parts = [...new Set(parts)];
        }
        return parts;
    }
}
