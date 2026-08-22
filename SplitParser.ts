import { AttrParser, ParserContext } from './types/assign-gingerly/types';

/**
 * Options for SplitParser
 */
export interface SplitParserOptions {
  /**
   * Delimiter used to split the attribute value.
   * - String: treated as a literal separator (regex specials are escaped)
   * - Object: { pattern: string; flags?: string } builds a RegExp directly
   * - Default: /\s+/
   */
  delimiter?: string | { pattern: string; flags?: string };

  /**
   * Whether to trim each split part.
   * Default: true
   */
  trim?: boolean;

  /**
   * Whether to skip empty strings after splitting/trimming.
   * Default: true
   */
  skipEmpty?: boolean;

  /**
   * Whether to remove duplicate values.
   * Default: false
   */
  dedupe?: boolean;
}

/**
 * Escapes regex metacharacters so a string delimiter is treated literally.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Built-in class parser that splits an attribute value into an array.
 * Registered under the name 'splitter' in globalParserRegistry.
 */
export class SplitParser implements AttrParser {
  private delimiter: RegExp;
  private trim: boolean;
  private skipEmpty: boolean;
  private dedupe: boolean;

  constructor(options?: SplitParserOptions) {
    const opts = options ?? {};
    const rawDelimiter = opts.delimiter;

    if (rawDelimiter === undefined) {
      this.delimiter = /\s+/;
    } else if (typeof rawDelimiter === 'string') {
      this.delimiter = rawDelimiter === '' ? /(?:)/ : new RegExp(escapeRegex(rawDelimiter));
    } else {
      this.delimiter = new RegExp(rawDelimiter.pattern, rawDelimiter.flags ?? '');
    }

    this.trim = opts.trim ?? true;
    this.skipEmpty = opts.skipEmpty ?? true;
    this.dedupe = opts.dedupe ?? false;
  }

  parse(v: string | null, _context?: ParserContext): any {
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
