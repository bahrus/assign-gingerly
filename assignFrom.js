/**
 * Resolve RHS path strings against a source object, then assign the
 * resolved values into a target using assignGingerly.
 *
 * Combines resolveValues + assignGingerly into a single call.
 * Inherits all assignGingerly options (withMethods, aka, signal, etc.).
 *
 * @param target - Object to merge resolved values into
 * @param pattern - Object whose RHS values may contain `?.` path strings
 * @param options - Options including `from` (source object) and any assignGingerly options
 * @returns The target object after merging
 *
 * @example
 * const source = { theme: { color: 'red' }, label: 'Hello' };
 * const target = { color: 'blue', text: '' };
 * assignFrom(target, {
 *   color: '?.theme?.color',
 *   text: '?.label'
 * }, { from: source });
 * // target is now { color: 'red', text: 'Hello' }
 */
import { resolveValues } from './resolveValues.js';
import assignGingerly from './assignGingerly.js';
/**
 * Check if a key ends with the handler operator ' =>'.
 */
function isHandlerCommand(key) {
    return key.endsWith(' =>');
}
/**
 * Supported substitution variables and their option keys.
 */
const SUBSTITUTION_VARS = [
    { placeholder: '${x}', optionKey: 'where_x_in' },
    { placeholder: '${y}', optionKey: 'where_y_in' },
    { placeholder: '${z}', optionKey: 'where_z_in' },
];
/**
 * Recursively substitute a placeholder in all string values of an object.
 * Returns a new object (shallow clone at each level) with substitutions applied.
 */
function substituteInValue(value, placeholder, replacement) {
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
function entryContainsPlaceholder(key, value, placeholder) {
    if (key.includes(placeholder))
        return true;
    return valueContainsPlaceholder(value, placeholder);
}
/**
 * Check if a value (string, object, or array) contains a placeholder.
 */
function valueContainsPlaceholder(value, placeholder) {
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
 * Applies cartesian expansion: x values are expanded first, then y, then z.
 * Each variable multiplies the entries — result count = x.length × y.length × z.length.
 *
 * Returns the expanded pattern (or the original if no substitutions apply).
 */
function expandSubstitutions(pattern, options) {
    let entries = Object.entries(pattern);
    for (const { placeholder, optionKey } of SUBSTITUTION_VARS) {
        const values = options[optionKey];
        if (!values || values.length === 0)
            continue;
        const expanded = [];
        for (const [key, value] of entries) {
            if (entryContainsPlaceholder(key, value, placeholder)) {
                // Expand this entry for each value in the variable array
                for (const replacement of values) {
                    const newKey = key.includes(placeholder)
                        ? key.replaceAll(placeholder, replacement)
                        : key;
                    const newValue = substituteInValue(value, placeholder, replacement);
                    expanded.push([newKey, newValue]);
                }
            }
            else {
                // No placeholder in this entry — pass through
                expanded.push([key, value]);
            }
        }
        entries = expanded;
    }
    return mergeHandlerDuplicates(entries);
}
/**
 * Convert entries to an object, merging duplicate handler (` =>`) keys into arrays.
 * For normal (non-handler) keys, later entries overwrite earlier ones (standard object behavior).
 * For handler keys, duplicate entries are combined into an array (Multiple Handlers pattern).
 */
function mergeHandlerDuplicates(entries) {
    const result = {};
    for (const [key, value] of entries) {
        if (key.endsWith(' =>') && key in result) {
            // Duplicate handler key — merge into array
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
export async function assignFrom(target, pattern, options, permissions) {
    // First: expand looped substitution variables (${x}, ${y}, ${z})
    const expandedPattern = expandSubstitutions(pattern, options);
    // Separate handler commands ( =>), #[x] keys, and normal keys
    const handlerKeys = [];
    const normalPattern = {};
    const idRefNormalKeys = [];
    const idRefHandlerKeys = [];
    for (const key of Object.keys(expandedPattern)) {
        if (isHandlerCommand(key)) {
            if (key.startsWith('#[')) {
                idRefHandlerKeys.push(key);
            }
            else {
                handlerKeys.push(key);
            }
        }
        else if (key.startsWith('#[')) {
            idRefNormalKeys.push(key);
        }
        else {
            normalPattern[key] = expandedPattern[key];
        }
    }
    // Process normal keys via resolveValues + assignGingerly
    if (Object.keys(normalPattern).length > 0) {
        const resolved = await resolveValues(normalPattern, options.from, {
            withMethods: options.withMethods,
            aka: options.aka,
            protocols: options.protocols
        });
        // Recursively handle "..." spread keys at all nesting levels
        handleSpreads(resolved);
        assignGingerly(target, resolved, options);
    }
    // Process #[x] normal keys — resolve element, then apply remaining path + value
    if (idRefNormalKeys.length > 0 && options.withIds) {
        const { resolveIdVariable, parseIdRef } = await import('./resolveIdRef.js');
        for (const key of idRefNormalKeys) {
            const parsed = parseIdRef(key);
            if (!parsed)
                continue;
            const el = resolveIdVariable(parsed.varName, target, options.withIds);
            if (!el)
                continue;
            const value = expandedPattern[key];
            if (parsed.remainingPath) {
                // Resolve the RHS value
                const resolvedValue = await resolveValues({ __v: value }, options.from, { withMethods: options.withMethods, aka: options.aka, protocols: options.protocols });
                // Apply remaining path on the resolved element
                assignGingerly(el, { [parsed.remainingPath]: resolvedValue.__v }, options);
            }
            else {
                // No remaining path — resolve and assign directly to the element
                const resolvedValue = await resolveValues(typeof value === 'object' && value !== null ? value : { __v: value }, options.from, { withMethods: options.withMethods, aka: options.aka, protocols: options.protocols });
                if ('__v' in resolvedValue) {
                    // Single value — can't assign to element root without a path
                }
                else {
                    assignGingerly(el, resolvedValue, options);
                }
            }
        }
    }
    // Process handler commands ( =>) — dynamically imported only when needed
    if (handlerKeys.length > 0) {
        const { processHandlerCommands } = await import('./processHandlerCommands.js');
        await processHandlerCommands(target, handlerKeys, expandedPattern, options, permissions);
    }
    // Process #[x] handler keys — resolve element, then pass to handler processing
    if (idRefHandlerKeys.length > 0 && options.withIds) {
        const { resolveIdVariable, parseIdRef } = await import('./resolveIdRef.js');
        const { processHandlerCommands } = await import('./processHandlerCommands.js');
        for (const key of idRefHandlerKeys) {
            const parsed = parseIdRef(key);
            if (!parsed)
                continue;
            const el = resolveIdVariable(parsed.varName, target, options.withIds);
            if (!el)
                continue;
            // Build a synthetic key for processHandlerCommands:
            // The resolved element becomes the target, remaining path is the LHS
            const syntheticKey = parsed.remainingPath
                ? `${parsed.remainingPath} =>`
                : ' =>';
            const syntheticPattern = {
                [syntheticKey]: expandedPattern[key]
            };
            await processHandlerCommands(el, [syntheticKey], syntheticPattern, options, permissions);
        }
    }
    // Process inferred assignments — dynamically imported only when option is present
    if (options.inferredAssignments) {
        const { processInferredAssignments } = await import('./inferredAssignments.js');
        await processInferredAssignments(target, options.from, options.inferredAssignments);
        // Set up MutationObserver for new matching elements if beVigilant
        if (options.inferredAssignments.beVigilant) {
            if (!options.signal) {
                throw new Error('assignFrom: inferredAssignments.beVigilant requires options.signal (AbortSignal) for cleanup');
            }
            const { setupVigilantObserver } = await import('./beVigilant.js');
            setupVigilantObserver(target, options.from, options.inferredAssignments, options.signal);
        }
    }
    // Process bulk enhancements — dynamically imported only when option is present
    if (options.enhance && options.enhance.length > 0) {
        const { enhanceAll } = await import('./enhanceAll.js');
        await enhanceAll(target, options.enhance, permissions);
    }
    return target;
}
/**
 * Recursively walk an object and handle "..." spread keys.
 * When a "..." key is found, its value (which should be an object after protocol resolution)
 * is spread into the parent, replacing the "..." entry.
 */
function handleSpreads(obj) {
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
