/**
 * Interface for assignTentatively options with reversal tracking
 */
export interface IAssignTentativelyOptions {
  reversal?: Record<string | symbol, any>;
}

/**
 * Helper function to check if a string key represents an += command
 */
function isIncCommand(key: string): boolean {
  return key.endsWith(' +=');
}

/**
 * Helper function to parse an += command and extract the path
 */
function parseIncCommand(key: string): string | null {
  if (!isIncCommand(key)) {
    return null;
  }
  return key.substring(0, key.length - 3); // Remove ' +=' suffix
}

/**
 * Helper function to check if a key represents a =! command
 */
function isToggleCommand(key: string): boolean {
  return key.endsWith(' =!');
}

/**
 * Helper function to parse a =! command and extract the path
 */
function parseToggleCommand(key: string): string | null {
  if (!isToggleCommand(key)) {
    return null;
  }
  return key.substring(0, key.length - 3); // Remove ' =!' suffix
}

/**
 * Helper function to check if a key represents a ??x delete command
 */
function isDeleteCommand(key: string): boolean {
  return key.includes('??');
}

/**
 * Helper function to parse a ??x delete command and extract the path and property
 */
function parseDeleteCommand(key: string): { path: string; property: string } | null {
  if (!isDeleteCommand(key)) {
    return null;
  }
  const parts = key.split('??');
  if (parts.length !== 2) {
    return null;
  }
  return { path: parts[0], property: parts[1] };
}

/**
 * Helper function to parse a path string with ?. notation
 */
function parsePath(path: string): string[] {
  return path
    .split('.')
    .map(part => part.replace(/\?/g, ''))
    .filter(part => part.length > 0);
}

/**
 * Helper function to check if a path starts with ?. notation
 */
function isNestedPath(path: string): boolean {
  return path.startsWith('?.');
}

/**
 * Helper function to get or create a nested object
 */
function ensureNestedPath(obj: any, pathParts: string[]): any {
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
function getNestedValue(obj: any, pathParts: string[]): any {
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
function getTopLevelKey(path: string): string | null {
  const pathParts = parsePath(path);
  return pathParts.length > 0 ? pathParts[0] : null;
}

/**
 * Main assignTentatively function with reversal support
 */
export function assignTentatively(
  target: any,
  source: Record<string | symbol, any>,
  options?: IAssignTentativelyOptions
): any {
  if (!target || typeof target !== 'object') {
    return target;
  }

  const reversal = options?.reversal || {};
  const trackedCreatedPaths = new Set<string>();

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
        } else {
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
          } else {
            valueToNegate = undefined;
          }
        } else {
          // RHS path: navigate to get the value (don't create paths)
          const rhsPathParts = parsePath(rhsPath);
          let current = target;
          let exists = true;
          
          for (const part of rhsPathParts) {
            if (current && typeof current === 'object' && part in current) {
              current = current[part];
            } else {
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

    // Handle ??x delete commands (immediately, no delay)
    if (isDeleteCommand(key)) {
      const parsed = parseDeleteCommand(key);
      if (parsed && value === null) {
        const { path, property } = parsed;
        const pathParts = parsePath(path);

        // Navigate to parent without creating intermediate paths
        let parent = target;
        let canDelete = true;

        for (const part of pathParts) {
          if (parent && typeof parent === 'object' && part in parent) {
            parent = parent[part];
          } else {
            canDelete = false;
            break;
          }
        }

        if (canDelete && typeof parent === 'object' && parent !== null && property in parent) {
          // Store original value for reversal
          const fullPath = path ? `${path}?.${property}` : `?.${property}`;
          if (!(fullPath in reversal)) {
            reversal[fullPath] = parent[property];
          }
          delete parent[property];
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
        const nestedReversal: Record<string | symbol, any> = {};
        assignTentatively(parent[lastKey], value, { reversal: nestedReversal });
        // Merge nested reversals
        for (const revKey of Object.keys(nestedReversal)) {
          if (!(revKey in reversal)) {
            reversal[revKey] = nestedReversal[revKey];
          }
        }
      } else {
        // Store original value for reversal if it exists
        if (lastKey in parent) {
          const fullPath = `?.${pathParts.join('?.')}`;
          if (!(fullPath in reversal)) {
            reversal[fullPath] = parent[lastKey];
          }
        }
        parent[lastKey] = value;
      }
    } else {
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
        const nestedReversal: Record<string | symbol, any> = {};
        assignTentatively(target[key], value, { reversal: nestedReversal });
        // Merge nested reversals
        for (const revKey of Object.keys(nestedReversal)) {
          if (!(revKey in reversal)) {
            reversal[revKey] = nestedReversal[revKey];
          }
        }
      } else {
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
    const deleteKey = `??${topLevelKey}`;
    if (!(deleteKey in reversal)) {
      reversal[deleteKey] = null;
    }
  }

  return target;
}

export default assignTentatively;
