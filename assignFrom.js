/**
 * assignFrom.ts — Synchronous assign-from-source function.
 *
 * Resolves RHS path strings synchronously via getValues, then assigns into the target.
 * Supports looped substitution, #[x] refs, inferredAssignments, and handleSpreads — all sync.
 *
 * For async protocol handlers or awaitable handler execution, use assignFromAsync.
 *
 * Handler commands (` =>`) are fire-and-forget (kicked off asynchronously, not awaited).
 */
import { getValues, getValue } from './getValues.js';
import assignGingerly from './assignGingerly.js';
import { resolveIdVariable, parseIdRef } from './resolveIdRef.js';
import { processInferredAssignments } from './inferredAssignments.js';
/**
 * Supported substitution variables and their option keys.
 */
export const SUBSTITUTION_VARS = [
    { placeholder: '${x}', optionKey: 'where_x_in' },
    { placeholder: '${y}', optionKey: 'where_y_in' },
    { placeholder: '${z}', optionKey: 'where_z_in' },
];
/**
 * Check if a key ends with the handler operator ' =>'.
 */
export function isHandlerCommand(key) {
    return key.endsWith(' =>');
}
/**
 * Check if a key ends with the ternary operator ' ?='.
 */
export function isTernaryCommand(key) {
    return key.endsWith(' ?=');
}
/**
 * Parse a ?= ternary command and extract the LHS path.
 */
export function parseTernaryCommand(key) {
    if (!isTernaryCommand(key))
        return null;
    return key.substring(0, key.length - 3); // Remove ' ?=' suffix
}
/**
 * Resolve a single value — if it's a `?.` path string, resolve against source.
 * If it's a protocol string, resolve via protocol. Otherwise pass through as literal.
 */
function resolveTernaryValue(value, source, options) {
    if (typeof value === 'string' && value.startsWith('?.')) {
        return getValue(value, source, {
            withMethods: options.withMethods,
            aka: options.aka,
            protocols: options.protocols,
            root: options.root
        });
    }
    if (typeof value === 'string' && value.includes('://') && options.protocols) {
        // Check if it matches a known protocol
        const protoEnd = value.indexOf('://');
        const protocol = value.substring(0, protoEnd);
        if (options.protocols[protocol]) {
            return getValue(value, source, {
                withMethods: options.withMethods,
                aka: options.aka,
                protocols: options.protocols,
                root: options.root
            });
        }
    }
    return value;
}
/**
 * Check if a value in a result position is a nested ternary expression.
 * Trigger: an array of length ≥ 2 whose first element is a `?.`-prefixed
 * string (truthiness mode) or an array (comparison mode). Other arrays
 * are treated as literal values.
 */
function isNestedTernary(value) {
    if (!Array.isArray(value) || value.length < 2)
        return false;
    const first = value[0];
    return Array.isArray(first) || (typeof first === 'string' && first.startsWith('?.'));
}
/**
 * Resolve a value in a result position (then/else/neither, comparison results,
 * chain candidates). Nested ternary expressions are evaluated recursively;
 * everything else goes through resolveTernaryValue.
 */
function resolveResult(value, source, options) {
    if (isNestedTernary(value)) {
        return evaluateTernary(value, source, options);
    }
    return resolveTernaryValue(value, source, options);
}
/**
 * Evaluate a ?= ternary expression.
 *
 * Supported forms:
 * - [ifTruthy, thenResult]                         — guard (skip if falsy)
 * - [ifTruthy, thenResult, elseResult]             — ternary
 * - [ifTrue, trueResult, falseResult, neither]     — three-state (true/false/nullish)
 * - [[lhs, rhs], ifEqual, ifNotEqual?]             — equality comparison
 * - [[lhs, rhs], ifEqual]                          — equality guard
 * - [c1, '||', c2, '||', c3, ...]                  — first truthy candidate (c1 || c2 || c3)
 * - [c1, '??', c2, '??', c3, ...]                  — first non-nullish candidate (c1 ?? c2 ?? c3)
 * - [c1, t1, [c2, t2, e2]]                         — nested ternary in any result position
 *
 * Returns TERNARY_SKIP to signal "skip assignment" (guard forms when condition
 * not met). A skip from a nested guard propagates outward.
 */
const TERNARY_SKIP = Symbol('ternary-skip');
function evaluateTernary(arr, source, options) {
    const condition = arr[0];
    if (Array.isArray(condition)) {
        // Comparison mode: [[lhs, rhs], ...] or [[lhs, op, rhs], ...]
        const lhs = resolveTernaryValue(condition[0], source, options);
        if (condition.length === 2) {
            // Equality: [[lhs, rhs], result, elseResult?]
            const rhs = resolveTernaryValue(condition[1], source, options);
            if (lhs === rhs) {
                return resolveResult(arr[1], source, options);
            }
            else {
                return arr.length > 2 ? resolveResult(arr[2], source, options) : TERNARY_SKIP;
            }
        }
        else {
            // Operator: [[lhs, op, rhs], result, elseResult?]
            const op = condition[1];
            const rhs = resolveTernaryValue(condition[2], source, options);
            const satisfied = compareWithOp(lhs, op, rhs);
            if (satisfied) {
                return resolveResult(arr[1], source, options);
            }
            else {
                return arr.length > 2 ? resolveResult(arr[2], source, options) : TERNARY_SKIP;
            }
        }
    }
    else {
        // Chain shortcut: [c1, '||', c2, ...] or [c1, '??', c2, ...]
        // Checked before the length-based dispatch so a length-4 chain
        // isn't misread as the three-state form.
        if (arr[1] === '||' || arr[1] === '??') {
            return evaluateChain(arr, source, options);
        }
        // Truthiness mode
        const resolved = resolveTernaryValue(condition, source, options);
        if (arr.length === 4) {
            // [ifTrue, trueResult, falseResult, neitherResult]
            if (resolved == null)
                return resolveResult(arr[3], source, options);
            return resolved ? resolveResult(arr[1], source, options) : resolveResult(arr[2], source, options);
        }
        else if (arr.length === 3) {
            // [ifTruthy, thenResult, elseResult]
            return resolved ? resolveResult(arr[1], source, options) : resolveResult(arr[2], source, options);
        }
        else {
            // [ifTruthy, thenResult] — guard, skip if falsy
            return resolved ? resolveResult(arr[1], source, options) : TERNARY_SKIP;
        }
    }
}
/**
 * Evaluate a chain shortcut: [c1, '||', c2, ...] or [c1, '??', c2, ...].
 *
 * - '||' returns the first truthy candidate (JS `c1 || c2 || c3`).
 * - '??' returns the first non-nullish candidate (JS `c1 ?? c2 ?? c3`).
 *
 * Candidates sit at even indices and are resolved lazily — evaluation stops
 * at the first match. What happens when no candidate passes depends on the
 * trailing element:
 * - Ends with a candidate ([c1, '||', c2]): the last candidate doubles as the
 *   fallback (returned even when it fails the test, matching JS semantics).
 * - Ends with a non-marker element after the last candidate ([c1, '||', c2, fb]):
 *   that element is the explicit fallback.
 * - Ends with a dangling marker ([c1, '||'] or [c1, '||', c2, '||']): guard form —
 *   nothing to assign (TERNARY_SKIP).
 *
 * Mixing marker types in one chain is not supported; the first marker sets the mode.
 *
 * Candidates may themselves be nested ternaries (see resolveResult). A nested
 * guard that skips counts as a failed candidate — the chain continues; if it
 * was the final fallback, the skip propagates.
 */
function evaluateChain(arr, source, options) {
    const isNullish = arr[1] === '??';
    const n = arr.length;
    const endsWithMarker = arr[n - 1] === '||' || arr[n - 1] === '??';
    const lastCandidateIdx = n - (endsWithMarker || n % 2 === 0 ? 2 : 1);
    let lastVal;
    for (let i = 0; i <= lastCandidateIdx; i += 2) {
        lastVal = resolveResult(arr[i], source, options);
        if (lastVal === TERNARY_SKIP)
            continue; // nested guard skipped — try next candidate
        const pass = isNullish ? lastVal != null : !!lastVal;
        if (pass)
            return lastVal;
    }
    if (endsWithMarker)
        return TERNARY_SKIP;
    // Odd count: last candidate doubles as fallback. Even count: explicit trailing fallback.
    return n % 2 === 1 ? lastVal : resolveResult(arr[n - 1], source, options);
}
/**
 * Compare two values with a given operator.
 */
function compareWithOp(lhs, op, rhs) {
    switch (op) {
        case '===': return lhs === rhs;
        case '!==': return lhs !== rhs;
        case '>': return lhs > rhs;
        case '>=': return lhs >= rhs;
        case '<': return lhs < rhs;
        case '<=': return lhs <= rhs;
        default: return lhs === rhs; // fallback to equality
    }
}
/**
 * Recursively substitute a placeholder in all string values of an object.
 */
export function substituteInValue(value, placeholder, replacement) {
    if (typeof value === 'string') {
        return value.includes(placeholder) ? value.replaceAll(placeholder, replacement) : value;
    }
    if (Array.isArray(value)) {
        return value.map(item => substituteInValue(item, placeholder, replacement));
    }
    if (value && typeof value === 'object') {
        const proto = Object.getPrototypeOf(value);
        if (proto === Object.prototype || proto === null) {
            const result = {};
            for (const [k, v] of Object.entries(value)) {
                result[k] = substituteInValue(v, placeholder, replacement);
            }
            return result;
        }
    }
    return value;
}
/**
 * Check if a pattern entry (key + value) contains a given placeholder.
 */
export function entryContainsPlaceholder(key, value, placeholder) {
    if (key.includes(placeholder))
        return true;
    return valueContainsPlaceholder(value, placeholder);
}
/**
 * Check if a value (string, object, or array) contains a placeholder.
 */
export function valueContainsPlaceholder(value, placeholder) {
    if (typeof value === 'string')
        return value.includes(placeholder);
    if (Array.isArray(value))
        return value.some(item => valueContainsPlaceholder(item, placeholder));
    if (value && typeof value === 'object') {
        const proto = Object.getPrototypeOf(value);
        if (proto === Object.prototype || proto === null) {
            return Object.values(value).some(v => valueContainsPlaceholder(v, placeholder));
        }
    }
    return false;
}
/**
 * Expand looped substitution variables in a pattern.
 */
export function expandSubstitutions(pattern, options) {
    let entries = Object.entries(pattern);
    for (const { placeholder, optionKey } of SUBSTITUTION_VARS) {
        const values = options[optionKey];
        if (!values || values.length === 0)
            continue;
        const expanded = [];
        for (const [key, value] of entries) {
            if (entryContainsPlaceholder(key, value, placeholder)) {
                for (const replacement of values) {
                    const newKey = key.includes(placeholder)
                        ? key.replaceAll(placeholder, replacement)
                        : key;
                    const newValue = substituteInValue(value, placeholder, replacement);
                    expanded.push([newKey, newValue]);
                }
            }
            else {
                expanded.push([key, value]);
            }
        }
        entries = expanded;
    }
    return mergeHandlerDuplicates(entries);
}
/**
 * Convert entries to an object, merging duplicate handler (` =>`) keys into arrays.
 */
export function mergeHandlerDuplicates(entries) {
    const result = {};
    for (const [key, value] of entries) {
        if (key.endsWith(' =>') && key in result) {
            const existing = result[key];
            if (Array.isArray(existing)) {
                existing.push(value);
            }
            else {
                result[key] = [existing, value];
            }
        }
        else {
            result[key] = value;
        }
    }
    return result;
}
/**
 * Recursively walk an object and handle "..." spread keys.
 */
export function handleSpreads(obj) {
    for (const [key, value] of Object.entries(obj)) {
        if (key !== '...' && typeof value === 'object' && value !== null && !Array.isArray(value)) {
            const proto = Object.getPrototypeOf(value);
            if (proto === Object.prototype || proto === null) {
                obj[key] = handleSpreads(value);
            }
        }
    }
    if ('...' in obj) {
        const spreadValue = obj['...'];
        delete obj['...'];
        if (spreadValue && typeof spreadValue === 'object') {
            Object.assign(obj, spreadValue);
        }
    }
    return obj;
}
/**
 * Categorize pattern keys into handler keys, #[x] keys, and normal keys.
 */
export function categorizeKeys(expandedPattern) {
    const handlerKeys = [];
    const normalPattern = {};
    const idRefNormalKeys = [];
    const idRefHandlerKeys = [];
    const ternaryKeys = [];
    for (const key of Object.keys(expandedPattern)) {
        if (isHandlerCommand(key)) {
            if (key.startsWith('#[')) {
                idRefHandlerKeys.push(key);
            }
            else {
                handlerKeys.push(key);
            }
        }
        else if (isTernaryCommand(key)) {
            ternaryKeys.push(key);
        }
        else if (key.startsWith('#[')) {
            idRefNormalKeys.push(key);
        }
        else {
            normalPattern[key] = expandedPattern[key];
        }
    }
    return { handlerKeys, normalPattern, idRefNormalKeys, idRefHandlerKeys, ternaryKeys };
}
/**
 * Merge pin and at into a single lookup map for resolveIdVariable.
 */
function getEffectiveIds(options) {
    if (!options.pin && !options.at)
        return undefined;
    if (options.pin && !options.at)
        return options.pin;
    if (!options.pin && options.at)
        return options.at;
    return { ...options.pin, ...options.at };
}
/**
 * Process #[x] normal keys synchronously.
 */
function processIdRefNormalKeys(idRefNormalKeys, expandedPattern, target, options, permissionProcessor) {
    const ids = getEffectiveIds(options);
    if (!ids)
        return;
    const { withMethods, aka, akaMethods, protocols, from } = options;
    for (const key of idRefNormalKeys) {
        const parsed = parseIdRef(key);
        if (!parsed)
            continue;
        const el = resolveIdVariable(parsed.varName, target, ids);
        if (!el)
            continue;
        const value = expandedPattern[key];
        if (parsed.remainingPath) {
            const resolvedValue = getValues({ __v: value }, from, { withMethods, aka, akaMethods, protocols, root: target });
            assignGingerly(el, { [parsed.remainingPath]: resolvedValue.__v }, options, permissionProcessor);
        }
        else {
            const resolvedValue = getValues(typeof value === 'object' && value !== null ? value : { __v: value }, from, { withMethods, aka, akaMethods, protocols, root: target });
            if (!('__v' in resolvedValue)) {
                assignGingerly(el, resolvedValue, options, permissionProcessor);
            }
        }
    }
}
/**
 * Synchronous assignFrom — resolves values, assigns to target, all without awaiting.
 *
 * Handler commands (` =>`), beVigilant, and enhance are fire-and-forget (async, non-blocking).
 * For awaitable handler execution, use assignFromAsync.
 *
 * @param target - Object to merge resolved values into
 * @param pattern - Object whose RHS values may contain `?.` path strings
 * @param options - Options including `from` (source object)
 * @param permissionProcessor - Optional security permissionProcessor
 * @returns The target object after merging
 */
export function assignFrom(target, pattern, options, permissionProcessor) {
    // Expand looped substitution variables
    const expandedPattern = expandSubstitutions(pattern, options);
    // Categorize keys
    const { handlerKeys, normalPattern, idRefNormalKeys, idRefHandlerKeys, ternaryKeys } = categorizeKeys(expandedPattern);
    const resolveOptions = { ...options, root: target };
    // Process ?= ternary keys (sync)
    if (ternaryKeys.length > 0) {
        const ternaryResolved = {};
        for (const key of ternaryKeys) {
            const lhsPath = parseTernaryCommand(key);
            if (!lhsPath)
                continue;
            const arr = expandedPattern[key];
            if (!Array.isArray(arr) || arr.length < 2)
                continue;
            const result = evaluateTernary(arr, options.from, resolveOptions);
            if (result !== TERNARY_SKIP) {
                ternaryResolved[lhsPath] = result;
            }
        }
        if (Object.keys(ternaryResolved).length > 0) {
            assignGingerly(target, ternaryResolved, options, permissionProcessor);
        }
    }
    // Process normal keys via getValues (sync) + assignGingerly
    if (Object.keys(normalPattern).length > 0) {
        // Resolve #[x] references on RHS values before getValues
        if (options.pin || options.at) {
            const ids = getEffectiveIds(options);
            for (const key of Object.keys(normalPattern)) {
                const value = normalPattern[key];
                if (typeof value === 'string' && value.startsWith('#[')) {
                    const closeIdx = value.indexOf(']');
                    if (closeIdx !== -1) {
                        const varName = value.substring(2, closeIdx);
                        const el = resolveIdVariable(varName, target, ids);
                        if (el) {
                            const remainingPath = value.substring(closeIdx + 1);
                            if (remainingPath) {
                                normalPattern[key] = getValue(remainingPath, el, {
                                    withMethods: options.withMethods,
                                    aka: options.aka,
                                    akaMethods: options.akaMethods,
                                    protocols: options.protocols,
                                    root: target
                                });
                            }
                            else {
                                normalPattern[key] = el.id; // bare #[x] → ID string
                            }
                        }
                    }
                }
            }
        }
        const resolved = getValues(normalPattern, options.from, resolveOptions);
        handleSpreads(resolved);
        assignGingerly(target, resolved, options, permissionProcessor);
    }
    // Process #[x] normal keys (sync)
    if (idRefNormalKeys.length > 0) {
        processIdRefNormalKeys(idRefNormalKeys, expandedPattern, target, options, permissionProcessor);
    }
    // Process handler commands — fire-and-forget (async)
    if (handlerKeys.length > 0) {
        import('./processHandlerCommands.js').then(({ processHandlerCommands }) => {
            processHandlerCommands(target, handlerKeys, expandedPattern, options, permissionProcessor);
        });
    }
    // Process #[x] handler keys — fire-and-forget (async)
    if (idRefHandlerKeys.length > 0 && (options.pin || options.at)) {
        const ids = getEffectiveIds(options);
        import('./processHandlerCommands.js').then(({ processHandlerCommands }) => {
            for (const key of idRefHandlerKeys) {
                const parsed = parseIdRef(key);
                if (!parsed)
                    continue;
                const el = resolveIdVariable(parsed.varName, target, ids);
                if (!el)
                    continue;
                const syntheticKey = parsed.remainingPath ? `${parsed.remainingPath} =>` : ' =>';
                const syntheticPattern = { [syntheticKey]: expandedPattern[key] };
                processHandlerCommands(el, [syntheticKey], syntheticPattern, options, permissionProcessor);
            }
        });
    }
    // Process inferred assignments (sync)
    if (options.infer) {
        processInferredAssignments(target, options.from, options.infer);
        // beVigilant — fire-and-forget (async)
        if (options.infer.beVigilant) {
            if (!options.signal) {
                throw new Error('assignFrom: infer.beVigilant requires options.signal (AbortSignal) for cleanup');
            }
            import('./beVigilant.js').then(({ setupVigilantObserver }) => {
                setupVigilantObserver(target, options.from, options.infer, options.signal);
            });
        }
    }
    // Process bulk enhancements — fire-and-forget (async)
    if (options.enhance && options.enhance.length > 0) {
        import('./enhanceAll.js').then(({ enhanceAll }) => {
            enhanceAll(target, options.enhance, permissionProcessor);
        });
    }
    return target;
}
export default assignFrom;
