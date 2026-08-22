/**
 * Registry for parsers scoped to a synthesizer element (be-hive, htmx-container, etc.)
 * Enables lazy-loading of complex parsers with Promise-based waiting
 */
export class ScopedParserRegistry {
    parsers = new Map();
    pendingWaits = new Map();
    /**
     * Register a parser with a given name
     * Resolves any pending waiters for this parser
     * @param name - The name to register the parser under
     * @param parser - The parser function or class constructor
     */
    register(name, parser) {
        if (this.parsers.has(name)) {
            console.warn(`Parser "${name}" already registered in scoped registry, overwriting`);
        }
        this.parsers.set(name, parser);
        // Resolve any pending waiters for this parser
        const waiters = this.pendingWaits.get(name);
        if (waiters) {
            waiters.forEach(({ resolve }) => resolve());
            this.pendingWaits.delete(name);
        }
    }
    /**
     * Get a parser by name
     * @param name - The name of the parser
     * @returns The parser function, class constructor, or undefined if not found
     */
    get(name) {
        return this.parsers.get(name);
    }
    /**
     * Check if a parser is registered
     * @param name - The name to check
     * @returns True if the parser exists
     */
    has(name) {
        return this.parsers.has(name);
    }
    /**
     * Wait for multiple parsers to be registered
     * @param names - Array of parser names to wait for
     * @param timeout - Timeout in milliseconds (default: 60000)
     * @returns Promise that resolves when all parsers are registered
     * @throws Error listing missing parsers if timeout expires
     */
    waitFor(names, timeout = 60000) {
        // Check if all parsers are already registered
        const missing = names.filter(name => !this.has(name));
        if (missing.length === 0) {
            return Promise.resolve();
        }
        // Create promise that resolves when all parsers are registered
        return new Promise((resolve, reject) => {
            let timeoutId;
            // Set timeout that rejects with descriptive error
            timeoutId = setTimeout(() => {
                const stillMissing = names.filter(name => !this.has(name));
                reject(new Error(`Timeout waiting for parsers: ${stillMissing.join(', ')}`));
            }, timeout);
            // Track which parsers we're waiting for
            let remainingCount = missing.length;
            // Create waiter for each missing parser
            missing.forEach(name => {
                const waiter = {
                    resolve: () => {
                        remainingCount--;
                        if (remainingCount === 0) {
                            if (timeoutId !== undefined) {
                                clearTimeout(timeoutId);
                            }
                            resolve();
                        }
                    },
                    reject
                };
                // Add waiter to pending list
                if (!this.pendingWaits.has(name)) {
                    this.pendingWaits.set(name, []);
                }
                this.pendingWaits.get(name).push(waiter);
            });
        });
    }
    /**
     * Get all registered parser names
     * @returns Array of parser names
     */
    getNames() {
        return Array.from(this.parsers.keys());
    }
}
