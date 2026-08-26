/**
 * paths.ts — Typed path proxy and template tag for assignFrom authoring.
 *
 * Provides compile-time autocomplete and type safety for `?.`-prefixed path strings.
 *
 * @example
 * import { paths, sp } from 'assign-gingerly/DX/paths.js';
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
 * // Use sp (split into parts) to create arrays for the ' =&' join op:
 * const value = sp`${$.lastName}, ${$.firstName}`;
 * // ['?.lastName', ', ', '?.firstName']
 *
 * // Use .Path for raw string contexts (object keys, plain arrays):
 * const key = $.textContent.Path;  // '?.textContent'
 */
/**
 * Symbol used internally to detect path proxy objects.
 * The sp tag function uses this to auto-extract path strings from proxies.
 */
const PATH_SYMBOL = Symbol('assign-gingerly-path');
function isPathProxy(value) {
    return !!value && (typeof value === 'object' || typeof value === 'function') && PATH_SYMBOL in value;
}
const COMMAND_TOKEN_SUFFIXES = {
    Each: '?.@each',
    EqNot: ' =!',
    PlusEq: ' +=',
    QMEq: ' ?=',
    YEq: ' Y=',
    MinusEq: ' -=',
    Arrow: ' =>',
    EqAmp: ' =&',
};
function serializePath(prefix) {
    return prefix.length > 0 ? `?.${prefix}` : '?.';
}
function appendPathSegment(prefix, segment) {
    return prefix ? `${prefix}?.${segment}` : segment;
}
function appendCommandSuffix(prefix, token) {
    return `${prefix}${COMMAND_TOKEN_SUFFIXES[token]}`;
}
function getReservedToken(prop) {
    if (prop === 'Path')
        return prop;
    if (prop in COMMAND_TOKEN_SUFFIXES)
        return prop;
    return undefined;
}
/**
 * Create a proxy for id-ref paths (#[varName]).
 * After the initial #[varName], further property access chains with ?. from the resolved element.
 * .Path returns the #[varName] prefix (optionally with further ?. path).
 */
function createIdRefProxy(idRef, options) {
    function handler() { }
    Object.defineProperty(handler, PATH_SYMBOL, { value: idRef });
    return new Proxy(handler, {
        get(_, prop) {
            if (prop === 'Path' || prop === PATH_SYMBOL) {
                return idRef;
            }
            if (typeof prop === 'symbol')
                return undefined;
            const reservedToken = getReservedToken(prop);
            if (reservedToken === 'Each') {
                return createIdRefProxy(appendPathSegment(idRef, '@each'), options);
            }
            if (reservedToken && reservedToken !== 'Path') {
                return createIdRefProxy(appendCommandSuffix(idRef, reservedToken), options);
            }
            // Chain further path segments after the id ref
            const chained = appendPathSegment(idRef, String(prop));
            return createIdRefProxy(chained, options);
        },
        apply(_, __, args) {
            if (args.length > 0) {
                const arg = args[0];
                let argStr;
                if (arg === true)
                    argStr = 'true';
                else if (arg === false)
                    argStr = 'false';
                else if (isPathProxy(arg)) {
                    const fullPath = arg[PATH_SYMBOL];
                    argStr = fullPath.startsWith('?.') ? fullPath.substring(2) : fullPath;
                }
                else
                    argStr = String(arg);
                const chained = `${idRef}?.${argStr}`;
                return createIdRefProxy(chained, options);
            }
            return createIdRefProxy(idRef, options);
        }
    });
}
/**
 * Create a recursive proxy that records property access paths.
 * Supports both property access and method call syntax (via apply trap on function target).
 *
 * When `aka` is provided, property names that match an alias *value* are output
 * using the alias *key* instead (reverse alias).
 */
function createPathProxy(prefix, options) {
    const aliasMap = options?.aka;
    // Use a function as the target to enable the apply trap
    function handler() { }
    Object.defineProperty(handler, PATH_SYMBOL, { value: prefix.length > 0 ? `?.${prefix}` : '?.' });
    return new Proxy(handler, {
        get(_, prop) {
            if (prop === 'Path' || prop === PATH_SYMBOL) {
                return serializePath(prefix);
            }
            // Ignore symbol access (Symbol.iterator, Symbol.toPrimitive, etc.)
            if (typeof prop === 'symbol')
                return undefined;
            const reservedToken = getReservedToken(String(prop));
            if (reservedToken === 'Path') {
                return serializePath(prefix);
            }
            if (reservedToken === 'Each') {
                return createPathProxy(appendPathSegment(prefix, '@each'), options);
            }
            if (reservedToken) {
                return createPathProxy(appendCommandSuffix(prefix, reservedToken), options);
            }
            let segment = String(prop);
            // #-prefix: $['#firstName'] → '#[firstName]' (cached element ref)
            if (segment.startsWith('#')) {
                const varName = segment.substring(1);
                const idRef = `#[${varName}]`;
                // Return a proxy that starts from this id ref (can chain further with ?.)
                return createIdRefProxy(idRef, options);
            }
            // Apply reverse alias: if prop matches an alias value, use the alias key
            if (aliasMap) {
                for (const [alias, target] of Object.entries(aliasMap)) {
                    if (target === segment) {
                        segment = alias;
                        break;
                    }
                }
            }
            const newPath = appendPathSegment(prefix, segment);
            return createPathProxy(newPath, options);
        },
        apply(_, __, args) {
            // Method call syntax: $.querySelector('.username') → extends path with the argument
            if (args.length > 0) {
                const arg = args[0];
                let argStr;
                if (arg === true)
                    argStr = 'true';
                else if (arg === false)
                    argStr = 'false';
                else if (isPathProxy(arg)) {
                    // Proxy arg — extract path without '?.' prefix
                    const fullPath = arg[PATH_SYMBOL];
                    argStr = fullPath.startsWith('?.') ? fullPath.substring(2) : fullPath;
                }
                else
                    argStr = String(arg);
                const newPath = appendPathSegment(prefix, argStr);
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
 * $.lastName.Path          // '?.lastName'
 * $.address.city.Path      // '?.address?.city'
 *
 * // With aka (reverse alias applied):
 * const $ = paths<MyEl>({ aka: { q: 'querySelector' } });
 * $.querySelector('.user').textContent.Path  // '?.q?..user?.textContent'
 *
 * // Inside sp template literals, .Path is not needed:
 * sp`${$.lastName}, ${$.firstName}`  // ['?.lastName', ', ', '?.firstName']
 */
export function paths(options) {
    return createPathProxy('', options);
}
/**
 * Create an assignment pair: { [lhs.Path]: rhs.Path }.
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
export function set(lhs) {
    const lhsStr = isPathProxy(lhs)
        ? lhs[PATH_SYMBOL]
        : String(lhs);
    return {
        to(rhs) {
            const rhsStr = isPathProxy(rhs)
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
export function smoothOver(value) {
    if (isPathProxy(value)) {
        return value[PATH_SYMBOL];
    }
    if (Array.isArray(value)) {
        return value.map(smoothOver);
    }
    if (value && typeof value === 'object') {
        const proto = Object.getPrototypeOf(value);
        if (proto === Object.prototype || proto === null) {
            const result = {};
            for (const [k, v] of Object.entries(value)) {
                result[k] = smoothOver(v);
            }
            return result;
        }
    }
    return value;
}
/**
 * Merge multiple set(...).to(...) pairs (and/or plain objects) into an `{ assign: {...} }` object.
 * Spread the result into a merge config to avoid repeated `...` per entry.
 *
 * @example
 * {
 *     ifKeyIn: ['statusClassName', 'statusMessageText'],
 *     ifAllOf: ['clone'],
 *     ...doAssign(
 *         set($.clone.querySelector('.status').className).to($.statusClassName),
 *         set($.clone.querySelector('.status-text').textContent).to($.statusMessageText),
 *     )
 * }
 * // Equivalent to: { ifKeyIn: [...], ifAllOf: [...], assign: { '?.clone?.q?..status?.className': '?.statusClassName', ... } }
 *
 * // Mix with literal values:
 * ...doAssign(
 *     set($.clone.querySelector('.count-value').textContent).to($.count),
 *     { renderCount: 1 },
 * )
 */
export function doAssign(...pairs) {
    return { assign: Object.assign({}, ...pairs) };
}
export function assign(...pairs) {
    return Object.assign({}, ...pairs);
}
/**
 * Compile-time loop expansion: generates one entry per key from a factory function.
 * Creates a typed proxy internally — the factory receives both the key and the proxy.
 *
 * @param keys - Array of property names to iterate (type-checked against T)
 * @param factory - Function that produces a config entry for each key
 * @param options - Optional PathsOptions (aka, withMethods) for the internal proxy
 * @returns Array of factory results (one per key) — spread into merges array
 *
 * @example
 * import { forEachKeyIn, set, doAssign } from 'assign-gingerly/paths.js';
 *
 * interface Person extends HTMLElement { firstName: string; lastName: string; }
 *
 * const merges = [
 *     ...forEachKeyIn<Person>(['firstName', 'lastName'], (key, $) => ({
 *         ifKeyIn: [key],
 *         assignOptions: { pin: { [key]: { qry: `[name="${key}"]` } } },
 *         ...doAssign(set($['#' + key]).to($[key]))
 *     })),
 * ];
 */
export function forEachKeyIn(keys, factory, options) {
    const $ = paths(options);
    return keys.map(key => factory(key, $));
}
/**
 * Tagged template literal that splits a template into an array of parts.
 * Interleaves static string segments with interpolated values.
 *
 * Path proxy objects are auto-detected and converted to their `?.`-prefixed
 * string representation — no `.Path` call needed inside sp template literals.
 *
 * Arrays passed as interpolations are preserved as nested arrays (for
 * all-or-nothing optional segments in the ' =&' join op).
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
export function sp(strings, ...values) {
    const result = [];
    for (let i = 0; i < strings.length; i++) {
        if (strings[i])
            result.push(strings[i]);
        if (i < values.length) {
            const v = values[i];
            if (isPathProxy(v)) {
                // Auto-extract path from proxy object
                result.push(v[PATH_SYMBOL]);
            }
            else if (Array.isArray(v)) {
                // Nested array — recursively extract paths from proxy elements
                result.push(v.map(el => isPathProxy(el) ? el[PATH_SYMBOL] : el));
            }
            else {
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
function extractPropName(pathStr) {
    const withoutCommand = pathStr.replace(/(?: \+=| =!| \?=| Y=| -=| =>)$/, '');
    const parts = withoutCommand.split('?.');
    const last = parts[parts.length - 1];
    return last === '@each' ? 'Each' : last;
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
export function md(strings, ...values) {
    const result = [];
    for (let i = 0; i < strings.length; i++) {
        if (strings[i])
            result.push(strings[i]);
        if (i < values.length) {
            const v = values[i];
            if (isPathProxy(v)) {
                // Proxy object → {prop, val}
                const pathStr = v[PATH_SYMBOL];
                result.push({ prop: extractPropName(pathStr), val: pathStr });
            }
            else if (Array.isArray(v)) {
                // Nested array — recursively convert proxy elements to {prop, val}
                result.push(v.map(el => {
                    if (isPathProxy(el)) {
                        const pathStr = el[PATH_SYMBOL];
                        return { prop: extractPropName(pathStr), val: pathStr };
                    }
                    return el;
                }));
            }
            else if (v && typeof v === 'object' && 'prop' in v) {
                // Developer override object — extract val from proxy if present
                const processed = { ...v };
                if (isPathProxy(processed.val)) {
                    processed.val = processed.val[PATH_SYMBOL];
                }
                result.push(processed);
            }
            else {
                result.push(v);
            }
        }
    }
    return result;
}
