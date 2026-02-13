/**
 * Helper function to check if a string key represents an += command
 */
function isIncCommand(key) {
    return key.endsWith(' +=');
}
/**
 * Helper function to parse an += command and extract the path
 */
function parseIncCommand(key) {
    if (!isIncCommand(key)) {
        return null;
    }
    return key.substring(0, key.length - 3); // Remove ' +=' suffix
}
/**
 * Helper function to check if a key represents a =! command
 */
function isToggleCommand(key) {
    return key.endsWith(' =!');
}
/**
 * Helper function to parse a =! command and extract the path
 */
function parseToggleCommand(key) {
    if (!isToggleCommand(key)) {
        return null;
    }
    return key.substring(0, key.length - 3); // Remove ' =!' suffix
}
/**
 * Helper function to check if a key represents a -= delete command
 */
function isDeleteCommand(key) {
    return key.endsWith(' -=');
}
/**
 * Helper function to parse a -= delete command and extract the path
 */
function parseDeleteCommand(key) {
    if (!isDeleteCommand(key)) {
        return null;
    }
    return key.substring(0, key.length - 3); // Remove ' -=' suffix
}
/**
 * Helper function to parse a path string with ?. notation
 */
function parsePath(path) {
    return path
        .split('.')
        .map(part => part.replace(/\?/g, ''))
        .filter(part => part.length > 0);
}
/**
 * Helper function to check if a path starts with ?. notation
 */
function isNestedPath(path) {
    return path.startsWith('?.');
}
/**
 * Helper function to get or create a nested object
 */
function ensureNestedPath(obj, pathParts) {
    let current = obj;
    for (const part of pathParts.slice(0, -1)) {
        if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
            current[part] = {};
        }
        current = current[part];
    }
    return current;
}
/**
 * Helper function to get a value at a nested path without creating intermediate objects
 */
function getNestedValue(obj, pathParts) {
    let current = obj;
    for (const part of pathParts) {
        if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
            return undefined;
        }
        current = current[part];
    }
    return current;
}
/**
 * Helper function to get the shallowest top-level key from a nested path
 */
function getTopLevelKey(path) {
    const pathParts = parsePath(path);
    return pathParts.length > 0 ? pathParts[0] : null;
}
/**
 * Main assignTentatively function with reversal support
 */
export function assignTentatively(target, source, options) {
    if (!target || typeof target !== 'object') {
        return target;
    }
    const reversal = options?.reversal || {};
    const trackedCreatedPaths = new Set();
    // Process all keys from source
    for (const key of Object.keys(source)) {
        const value = source[key];
        // Handle += commands (immediately, no delay)
        if (isIncCommand(key)) {
            const path = parseIncCommand(key);
            if (path) {
                const pathParts = parsePath(path);
                const topLevelKey = pathParts[0];
                // Track if we created a new top-level path (BEFORE calling ensureNestedPath)
                if (!(topLevelKey in target)) {
                    trackedCreatedPaths.add(topLevelKey);
                }
                const lastKey = pathParts[pathParts.length - 1];
                const parent = ensureNestedPath(target, pathParts);
                // If property already exists, store original value for reversal
                if (lastKey in parent) {
                    const fullPath = `?.${pathParts.join('?.')}`;
                    if (!(fullPath in reversal)) {
                        reversal[fullPath] = parent[lastKey];
                    }
                    parent[lastKey] += value;
                }
                else {
                    // Property doesn't exist, create it with the value
                    parent[lastKey] = value;
                }
            }
            continue;
        }
        // Handle =! commands (immediately, no delay)
        if (isToggleCommand(key)) {
            const lhsPath = parseToggleCommand(key);
            if (lhsPath) {
                const rhsPath = value;
                const pathParts = parsePath(lhsPath);
                const topLevelKey = pathParts[0];
                // Track if we created a new top-level path (BEFORE calling ensureNestedPath)
                if (!(topLevelKey in target)) {
                    trackedCreatedPaths.add(topLevelKey);
                }
                const lastKey = pathParts[pathParts.length - 1];
                const parent = ensureNestedPath(target, pathParts);
                // Determine what to negate
                let valueToNegate;
                if (rhsPath === '.') {
                    // Self-reference
                    if (lastKey in parent) {
                        valueToNegate = parent[lastKey];
                    }
                    else {
                        valueToNegate = undefined;
                    }
                }
                else {
                    // RHS path: navigate to get the value (don't create paths)
                    const rhsPathParts = parsePath(rhsPath);
                    let current = target;
                    let exists = true;
                    for (const part of rhsPathParts) {
                        if (current && typeof current === 'object' && part in current) {
                            current = current[part];
                        }
                        else {
                            exists = false;
                            break;
                        }
                    }
                    valueToNegate = exists ? current : true;
                }
                // Store original value for reversal if it exists
                if (lastKey in parent) {
                    const fullPath = `?.${pathParts.join('?.')}`;
                    if (!(fullPath in reversal)) {
                        reversal[fullPath] = parent[lastKey];
                    }
                }
                parent[lastKey] = !valueToNegate;
            }
            continue;
        }
        // Handle -= delete commands (immediately, no delay)
        if (isDeleteCommand(key)) {
            const path = parseDeleteCommand(key);
            if (path !== null) {
                const pathParts = parsePath(path);
                // Determine the parent object
                let parent = target;
                let canDelete = true;
                // If path is empty or just '?', delete from root
                if (pathParts.length === 0) {
                    parent = target;
                }
                else {
                    // Navigate to parent without creating intermediate paths
                    for (const part of pathParts) {
                        if (parent && typeof parent === 'object' && part in parent) {
                            parent = parent[part];
                        }
                        else {
                            canDelete = false;
                            break;
                        }
                    }
                }
                if (canDelete && typeof parent === 'object' && parent !== null) {
                    // RHS can be a string (single property) or array (multiple properties)
                    const propertiesToDelete = Array.isArray(value) ? value : [value];
                    for (const prop of propertiesToDelete) {
                        if (prop in parent) {
                            // Store original value for reversal
                            const fullPath = pathParts.length > 0
                                ? `?.${pathParts.join('?.')}.${prop}`
                                : `?.${prop}`;
                            if (!(fullPath in reversal)) {
                                reversal[fullPath] = parent[prop];
                            }
                            delete parent[prop];
                        }
                    }
                }
            }
            continue;
        }
        if (isNestedPath(key)) {
            const pathParts = parsePath(key);
            const topLevelKey = pathParts[0];
            // Track if we created a new top-level path (BEFORE calling ensureNestedPath)
            if (!(topLevelKey in target)) {
                trackedCreatedPaths.add(topLevelKey);
            }
            const lastKey = pathParts[pathParts.length - 1];
            const parent = ensureNestedPath(target, pathParts);
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                // Recursively apply assignTentatively for nested objects
                if (!(lastKey in parent) || typeof parent[lastKey] !== 'object') {
                    // Store original value for reversal if it existed
                    if (lastKey in parent) {
                        const fullPath = `?.${pathParts.join('?.')}`;
                        if (!(fullPath in reversal)) {
                            reversal[fullPath] = parent[lastKey];
                        }
                    }
                    parent[lastKey] = {};
                }
                // For nested objects, recursively apply with nested reversal tracking
                const nestedReversal = {};
                assignTentatively(parent[lastKey], value, { reversal: nestedReversal });
                // Merge nested reversals
                for (const revKey of Object.keys(nestedReversal)) {
                    if (!(revKey in reversal)) {
                        reversal[revKey] = nestedReversal[revKey];
                    }
                }
            }
            else {
                // Store original value for reversal if it exists
                if (lastKey in parent) {
                    const fullPath = `?.${pathParts.join('?.')}`;
                    if (!(fullPath in reversal)) {
                        reversal[fullPath] = parent[lastKey];
                    }
                }
                parent[lastKey] = value;
            }
        }
        else {
            // Non-nested key
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                // Recursively apply assignTentatively for nested objects
                if (!(key in target) || typeof target[key] !== 'object') {
                    // Store original value for reversal if it existed
                    if (key in target) {
                        if (!(key in reversal)) {
                            reversal[key] = target[key];
                        }
                    }
                    target[key] = {};
                }
                const nestedReversal = {};
                assignTentatively(target[key], value, { reversal: nestedReversal });
                // Merge nested reversals
                for (const revKey of Object.keys(nestedReversal)) {
                    if (!(revKey in reversal)) {
                        reversal[revKey] = nestedReversal[revKey];
                    }
                }
            }
            else {
                // Store original value for reversal if it exists
                if (key in target) {
                    if (!(key in reversal)) {
                        reversal[key] = target[key];
                    }
                }
                target[key] = value;
            }
        }
    }
    // Add delete commands for created top-level paths to reversal
    for (const topLevelKey of trackedCreatedPaths) {
        const deleteKey = ` -=`;
        if (!(deleteKey in reversal)) {
            reversal[deleteKey] = topLevelKey;
        }
    }
    return target;
}
export default assignTentatively;
