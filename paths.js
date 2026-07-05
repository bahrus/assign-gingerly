/**
 * paths.js — Typed path proxy and template tags for assignFrom authoring.
 *
 * Provides compile-time autocomplete and type safety for `?.`-prefixed path strings.
 * Supports method call syntax, alias reversal, and batch proxy extraction.
 */

/**
 * Symbol used internally to detect path proxy objects.
 */
const PATH_SYMBOL = Symbol('assign-gingerly-path');

/**
 * Create a recursive proxy that records property access paths.
 * Supports both property access and method call syntax (via apply trap on function target).
 */
function createPathProxy(prefix, options) {
    const aliasMap = options?.aka;

    function handler() {}

    return new Proxy(handler, {
        get(_, prop) {
            if (prop === 'path' || prop === PATH_SYMBOL) {
                return prefix.length > 0 ? `?.${prefix}` : '?.';
            }
            if (typeof prop === 'symbol') return undefined;

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
            if (args.length > 0) {
                const arg = args[0];
                let argStr;
                if (arg === true) argStr = 'true';
                else if (arg === false) argStr = 'false';
                else if (arg && typeof arg === 'object' && PATH_SYMBOL in arg) {
                    const fullPath = arg[PATH_SYMBOL];
                    argStr = fullPath.startsWith('?.') ? fullPath.substring(2) : fullPath;
                }
                else argStr = String(arg);

                const newPath = prefix ? `${prefix}?.${argStr}` : argStr;
                return createPathProxy(newPath, options);
            }
            return createPathProxy(prefix, options);
        }
    });
}

/**
 * Create a typed path proxy.
 */
export function paths(options) {
    return createPathProxy('', options);
}

/**
 * Create an assignment pair: { [lhs.path]: rhs.path }.
 */
export function set(lhs) {
    const lhsStr = lhs && typeof lhs === 'object' && PATH_SYMBOL in lhs
        ? lhs[PATH_SYMBOL]
        : String(lhs);
    return {
        to(rhs) {
            const rhsStr = rhs && typeof rhs === 'object' && PATH_SYMBOL in rhs
                ? rhs[PATH_SYMBOL]
                : rhs;
            return { [lhsStr]: rhsStr };
        }
    };
}

/**
 * Recursively walk a value and convert any path proxy objects to path strings.
 */
export function smoothOver(value) {
    if (value && typeof value === 'object' && PATH_SYMBOL in value) {
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
 * Tagged template literal that splits a template into an array of parts.
 * Path proxy objects are auto-detected and converted to path strings.
 */
export function sp(strings, ...values) {
    const result = [];
    for (let i = 0; i < strings.length; i++) {
        if (strings[i]) result.push(strings[i]);
        if (i < values.length) {
            const v = values[i];
            if (v && typeof v === 'object' && PATH_SYMBOL in v) {
                result.push(v[PATH_SYMBOL]);
            }
            else if (Array.isArray(v)) {
                result.push(v.map(el =>
                    el && typeof el === 'object' && PATH_SYMBOL in el ? el[PATH_SYMBOL] : el
                ));
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
 */
function extractPropName(pathStr) {
    const parts = pathStr.split('?.');
    return parts[parts.length - 1];
}

/**
 * Tagged template literal that produces {prop, val} objects for microDataJoin.
 */
export function md(strings, ...values) {
    const result = [];
    for (let i = 0; i < strings.length; i++) {
        if (strings[i]) result.push(strings[i]);
        if (i < values.length) {
            const v = values[i];
            if (v && typeof v === 'object' && PATH_SYMBOL in v) {
                const pathStr = v[PATH_SYMBOL];
                result.push({ prop: extractPropName(pathStr), val: pathStr });
            }
            else if (Array.isArray(v)) {
                result.push(v.map(el => {
                    if (el && typeof el === 'object' && PATH_SYMBOL in el) {
                        const pathStr = el[PATH_SYMBOL];
                        return { prop: extractPropName(pathStr), val: pathStr };
                    }
                    return el;
                }));
            }
            else if (v && typeof v === 'object' && 'prop' in v) {
                const processed = { ...v };
                if (processed.val && typeof processed.val === 'object' && PATH_SYMBOL in processed.val) {
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
