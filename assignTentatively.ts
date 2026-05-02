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
 * Helper function to check if a key represents a -= delete command
 */
function isDeleteCommand(key: string): boolean {
  return key.endsWith(' -=');
}

/**
 * Helper function to parse a -= delete command and extract the path
 */
function parseDeleteCommand(key: string): string | null {
  if (!isDeleteCommand(key)) {
    return null;
  }
  return key.substring(0, key.length - 3); // Remove ' -=' suffix
}

/**
 * Helper function to parse a path string with ?. notation
 * Always splits on '?.' delimiter, preserving dots that are part of values
 * (e.g., CSS class selectors like '.username')
 * Paths must use ?. notation — plain dot notation is not supported.
 */
function parsePath(path: string): string[] {
  return path
    .split('?.')
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
        if (isNestedPath(path)) {
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
        } else {
          // Plain key - direct operation on target
          if (path in target) {
            if (!(path in reversal)) {
              reversal[path] = target[path];
            }
            target[path] += value;
          } else {
            target[path] = value;
          }
        }
      }
      continue;
    }

    // Handle =! commands (immediately, no delay)
    if (isToggleCommand(key)) {
      const lhsPath = parseToggleCommand(key);
      if (lhsPath) {
        const rhsPath = value;
        
        let lhsParent: any;
        let lhsLastKey: string;
        let lhsPathParts: string[];
        
        if (isNestedPath(lhsPath)) {
          lhsPathParts = parsePath(lhsPath);
          const topLevelKey = lhsPathParts[0];
          
          // Track if we created a new top-level path (BEFORE calling ensureNestedPath)
          if (!(topLevelKey in target)) {
            trackedCreatedPaths.add(topLevelKey);
          }
          
          lhsLastKey = lhsPathParts[lhsPathParts.length - 1];
          lhsParent = ensureNestedPath(target, lhsPathParts);
        } else {
          lhsPathParts = [lhsPath];
          lhsLastKey = lhsPath;
          lhsParent = target;
        }

        // Determine what to negate
        let valueToNegate;
        if (rhsPath === '.') {
          // Self-reference
          if (lhsLastKey in lhsParent) {
            valueToNegate = lhsParent[lhsLastKey];
          } else {
            valueToNegate = undefined;
          }
        } else if (isNestedPath(rhsPath)) {
          // RHS nested path: navigate to get the value (don't create paths)
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
        } else {
          // Plain key RHS
          valueToNegate = (rhsPath in target) ? target[rhsPath] : true;
        }

        // Store original value for reversal if it exists
        if (lhsLastKey in lhsParent) {
          const fullPath = `?.${lhsPathParts.join('?.')}`;
          if (!(fullPath in reversal)) {
            reversal[fullPath] = lhsParent[lhsLastKey];
          }
        }
        
        lhsParent[lhsLastKey] = !valueToNegate;
      }
      continue;
    }

    // Handle -= delete commands (immediately, no delay)
    if (isDeleteCommand(key)) {
      const path = parseDeleteCommand(key);
      if (path !== null) {
        // Determine the parent object
        let parent = target;
        let canDelete = true;
        let pathParts: string[] = [];

        if (isNestedPath(path)) {
          pathParts = parsePath(path);
          if (pathParts.length === 0) {
            parent = target;
          } else {
            for (const part of pathParts) {
              if (parent && typeof parent === 'object' && part in parent) {
                parent = parent[part];
              } else {
                canDelete = false;
                break;
              }
            }
          }
        } else if (path.length > 0) {
          // Plain key - navigate one level
          pathParts = [path];
          if (parent && typeof parent === 'object' && path in parent) {
            parent = parent[path];
          } else {
            canDelete = false;
          }
        }
        // else: empty path = delete from root

        if (canDelete && typeof parent === 'object' && parent !== null) {
          // RHS can be a string (single property) or array (multiple properties)
          const propertiesToDelete = Array.isArray(value) ? value : [value];
          
          for (const prop of propertiesToDelete) {
            if (prop in parent) {
              // Store original value for reversal
              const fullPath = pathParts.length > 0 
                ? `?.${pathParts.join('?.')}?.${prop}` 
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
    const deleteKey = ` -=`;
    if (!(deleteKey in reversal)) {
      reversal[deleteKey] = [];
    }
    // Store as array to handle multiple created paths
    if (!Array.isArray(reversal[deleteKey])) {
      reversal[deleteKey] = [reversal[deleteKey]];
    }
    reversal[deleteKey].push(topLevelKey);
  }

  return target;
}

export default assignTentatively;
