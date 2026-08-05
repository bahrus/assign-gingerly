/**
 * Determines if a function is an async spawner (returns a Promise<Constructor>)
 * rather than a synchronous constructor.
 *
 * Heuristic:
 * - AsyncFunction (async () => ...) → async spawner
 * - Arrow function (no .prototype) → async spawner (assumed to return Promise<Constructor>)
 * - Class or function declaration (has .prototype) → synchronous constructor
 */
export function isAsyncSpawn(fn: any): boolean {
    if (typeof fn !== 'function') return false;
    // Explicit async function
    if (fn.constructor.name === 'AsyncFunction') return true;
    // Arrow function or non-constructor function (no .prototype)
    if (fn.prototype === undefined) return true;
    return false;
}
