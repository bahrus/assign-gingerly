/**
 * paths.ts — Typed path proxy and template tag for assignFrom authoring.
 * 
 * Provides compile-time autocomplete and type safety for `?.`-prefixed path strings.
 * 
 * @example
 * import { paths, sp } from 'assign-gingerly/paths.js';
 * 
 * interface Person {
 *     firstName?: string;
 *     middleName?: string;
 *     lastName: string;
 *     address: { city: string; zip: string };
 * }
 * 
 * const $ = paths<Person>();
 * 
 * // Use sp (split into parts) to create arrays for builtIns.join:
 * const value = sp`${$.lastName}, ${$.firstName}`;
 * // ['?.lastName', ', ', '?.firstName']
 * 
 * // Use .path for raw string contexts (object keys, plain arrays):
 * const key = $.textContent.path;  // '?.textContent'
 */

/**
 * Symbol used internally to detect path proxy objects.
 * The sp tag function uses this to auto-extract path strings from proxies.
 */
const PATH_SYMBOL = Symbol('assign-gingerly-path');

/**
 * Type that maps an object type to a proxy where every property access
 * returns either a deeper proxy (for object properties) or a terminal
 * with a `.path` string accessor — while providing full autocomplete.
 * Enhanced: also callable (for method call syntax).
 */
export type PathProxy<T> = {
    [K in keyof T]-?: T[K] extends ((...args: any[]) => infer R)
        ? ((...args: any[]) => PathProxy<NonNullable<R>> & { readonly path: string }) & PathProxy<NonNullable<R>> & { readonly path: string }
        : T[K] extends (object | undefined | null)
            ? PathProxy<NonNullable<T[K]>> & { readonly path: string } & ((...args: any[]) => PathProxy<any> & { readonly path: string })
            : { readonly path: string } & ((...args: any[]) => PathProxy<any> & { readonly path: string });
} & { readonly path: string } & ((...args: any[]) => PathProxy<any> & { readonly path: string });

/**
 * Options for paths proxy creation.
 */
export interface PathsOptions {
    /** Alias map (alias → full name). Proxy reverses aliases: full name → alias in output. */
    aka?: Record<string, string>;
    /** Method names — used for disambiguation (future use). */
    withMethods?: string[] | Set<string>;
}

/**
 * Create a recursive proxy that records property access paths.
 * Supports both property access and method call syntax (via apply trap on function target).
 * 
 * When `aka` is provided, property names that match an alias *value* are output
 * using the alias *key* instead (reverse alias).
 */
function createPathProxy(prefix: string, options?: PathsOptions): any {
    const aliasMap = options?.aka;

    // Use a function as the target to enable the apply trap
    function handler() {}

    return new Proxy(handler, {
        get(_, prop: string | symbol) {
            if (prop === 'path' || prop === PATH_SYMBOL) {
                return prefix.length > 0 ? `?.${prefix}` : '?.';
            }
            // Ignore symbol access (Symbol.iterator, Symbol.toPrimitive, etc.)
            if (typeof prop === 'symbol') return undefined;

            // Apply reverse alias: if prop matches an alias value, use the alias key
            let segment = String(prop);
            if (aliasMap) {
                for (const [alias, target] of Object.entries(aliasMap)) {
                    if (target === segment) { segment = alias; break; }
                }
            }

            const newPath = prefix ? `${prefix}?.${segment}` : segment;
            return createPathProxy(newPath, options);
        },
        apply(_, __, args) {
            // Method call syntax: $.querySelector('.username') → extends path with the argument
            if (args.length > 0) {
                const arg = args[0];
                let argStr: string;
                if (arg === true) argStr = 'true';
                else if (arg === false) argStr = 'false';
                else if (arg && typeof arg === 'object' && PATH_SYMBOL in arg) {
                    // Proxy arg — extract path without '?.' prefix
                    const fullPath = arg[PATH_SYMBOL] as string;
                    argStr = fullPath.startsWith('?.') ? fullPath.substring(2) : fullPath;
                }
                else argStr = String(arg);

                const newPath = prefix ? `${prefix}?.${argStr}` : argStr;
                return createPathProxy(newPath, options);
            }
            // No args — method called with no arguments, return self
            return createPathProxy(prefix, options);
        }
    });
}

/**
 * Create a typed path proxy for a given interface/type.
 * Property accesses on the returned proxy produce `?.`-prefixed path strings.
 * Method calls append their argument to the path.
 * 
 * @param options - Optional aka aliases and withMethods for path generation
 * 
 * @example
 * const $ = paths<Person>();
 * $.lastName.path          // '?.lastName'
 * $.address.city.path      // '?.address?.city'
 * 
 * // With aka (reverse alias applied):
 * const $ = paths<MyEl>({ aka: { q: 'querySelector' } });
 * $.querySelector('.user').textContent.path  // '?.q?..user?.textContent'
 * 
 * // Inside sp template literals, .path is not needed:
 * sp`${$.lastName}, ${$.firstName}`  // ['?.lastName', ', ', '?.firstName']
 */
export function paths<T>(options?: PathsOptions): PathProxy<T> {
    return createPathProxy('', options) as any;
}

/**
 * Create an assignment pair: { [lhs.path]: rhs.path }.
 * Used to express "set this target to this source value" in a spreadable form.
 * 
 * @example
 * set($.clone.querySelector('.username').textContent).to($.username)
 * // { '?.clone?.q?..username?.textContent': '?.username' }
 * 
 * // Spread into an assign object:
 * assign: {
 *     ...set($.textContent).to($.name),
 *     ...set($.className).to($.theme),
 *     count: 1
 * }
 */
export function set(lhs: any): { to: (rhs: any) => Record<string, any> } {
    const lhsStr = lhs && typeof lhs === 'object' && PATH_SYMBOL in lhs
        ? lhs[PATH_SYMBOL]
        : String(lhs);
    return {
        to(rhs: any): Record<string, any> {
            const rhsStr = rhs && typeof rhs === 'object' && PATH_SYMBOL in rhs
                ? rhs[PATH_SYMBOL]
                : rhs;
            return { [lhsStr]: rhsStr };
        }
    };
}

/**
 * Recursively walk a value and convert any path proxy objects to their
 * `?.`-prefixed string representation.
 * 
 * Use this to wrap entire config objects or arrays that contain proxy values,
 * extracting all path strings in one pass.
 * 
 * @example
 * const $ = paths<MyVM>({ aka: { q: 'querySelector' } });
 * 
 * const config = smoothOver({
 *     assign: {
 *         incrementButton: $.clone.querySelector('.increment'),
 *         decrementButton: $.clone.querySelector('.decrement'),
 *     }
 * });
 * // { assign: { incrementButton: '?.clone?.q?..increment', ... } }
 */
export function smoothOver(value: any): any {
    if (value && typeof value === 'object' && PATH_SYMBOL in value) {
        return value[PATH_SYMBOL];
    }
    if (Array.isArray(value)) {
        return value.map(smoothOver);
    }
    if (value && typeof value === 'object') {
        const proto = Object.getPrototypeOf(value);
        if (proto === Object.prototype || proto === null) {
            const result: Record<string, any> = {};
            for (const [k, v] of Object.entries(value)) {
                result[k] = smoothOver(v);
            }
            return result;
        }
    }
    return value;
}

/**
 * Tagged template literal that splits a template into an array of parts.
 * Interleaves static string segments with interpolated values.
 * 
 * Path proxy objects are auto-detected and converted to their `?.`-prefixed
 * string representation — no `.path` call needed inside sp template literals.
 * 
 * Arrays passed as interpolations are preserved as nested arrays (for
 * all-or-nothing optional segments in builtIns.join).
 * 
 * @example
 * const $ = paths<Person>();
 * 
 * // Basic usage:
 * sp`${$.lastName}, ${$.firstName}`
 * // ['?.lastName', ', ', '?.firstName']
 * 
 * // With optional segment (nested array, all-or-nothing in join):
 * sp`${$.lastName}${[', ', $.middleName]}, ${$.firstName}`
 * // ['?.lastName', [', ', '?.middleName'], ', ', '?.firstName']
 */
export function sp(strings: TemplateStringsArray, ...values: any[]): any[] {
    const result: any[] = [];
    for (let i = 0; i < strings.length; i++) {
        if (strings[i]) result.push(strings[i]);
        if (i < values.length) {
            const v = values[i];
            if (v && typeof v === 'object' && PATH_SYMBOL in v) {
                // Auto-extract path from proxy object
                result.push(v[PATH_SYMBOL]);
            } else if (Array.isArray(v)) {
                // Nested array — recursively extract paths from proxy elements
                result.push(v.map(el =>
                    el && typeof el === 'object' && PATH_SYMBOL in el ? el[PATH_SYMBOL] : el
                ));
            } else {
                result.push(v);
            }
        }
    }
    return result;
}

/**
 * Extract the last segment from a `?.`-prefixed path string.
 * e.g., '?.address?.city' → 'city', '?.firstName' → 'firstName'
 */
function extractPropName(pathStr: string): string {
    const parts = pathStr.split('?.');
    return parts[parts.length - 1];
}

/**
 * Tagged template literal that produces an array of {prop, val} objects + literal strings.
 * Designed for `builtIns.microDataJoin` — provides both the property name (for itemprop)
 * and the path string (for resolution).
 * 
 * Path proxy objects are auto-detected and converted to `{prop, val}` objects.
 * Plain objects passed as interpolations are preserved as-is (allows developer overrides
 * with custom prop, val, format, etc.).
 * Arrays are preserved as nested arrays (for optional segments).
 * 
 * @example
 * const $ = paths<Person>();
 * 
 * // Basic usage:
 * md`${$.firstName} ${$.lastName}`
 * // [{ prop: 'firstName', val: '?.firstName' }, ' ', { prop: 'lastName', val: '?.lastName' }]
 * 
 * // With developer override (custom prop name, format):
 * md`${$.firstName} ${{ prop: 'birthDate', val: $.birthDT, format: 'long' }}`
 * // [{ prop: 'firstName', val: '?.firstName' }, ' ', { prop: 'birthDate', val: '?.birthDT', format: 'long' }]
 * 
 * // With optional segment:
 * md`${$.firstName}${[' ', $.middleName]} ${$.lastName}`
 * // [{ prop: 'firstName', val: '?.firstName' }, [' ', { prop: 'middleName', val: '?.middleName' }], ' ', { prop: 'lastName', val: '?.lastName' }]
 */
export function md(strings: TemplateStringsArray, ...values: any[]): any[] {
    const result: any[] = [];
    for (let i = 0; i < strings.length; i++) {
        if (strings[i]) result.push(strings[i]);
        if (i < values.length) {
            const v = values[i];
            if (v && typeof v === 'object' && PATH_SYMBOL in v) {
                // Proxy object → {prop, val}
                const pathStr = v[PATH_SYMBOL] as string;
                result.push({ prop: extractPropName(pathStr), val: pathStr });
            } else if (Array.isArray(v)) {
                // Nested array — recursively convert proxy elements to {prop, val}
                result.push(v.map(el => {
                    if (el && typeof el === 'object' && PATH_SYMBOL in el) {
                        const pathStr = el[PATH_SYMBOL] as string;
                        return { prop: extractPropName(pathStr), val: pathStr };
                    }
                    return el;
                }));
            } else if (v && typeof v === 'object' && 'prop' in v) {
                // Developer override object — extract val from proxy if present
                const processed = { ...v };
                if (processed.val && typeof processed.val === 'object' && PATH_SYMBOL in processed.val) {
                    processed.val = processed.val[PATH_SYMBOL];
                }
                result.push(processed);
            } else {
                result.push(v);
            }
        }
    }
    return result;
}
