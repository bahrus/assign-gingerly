/**
 * Registry for named parsers that can be referenced by string name
 * Enables JSON serialization of configs with custom parsers
 */
export class ParserRegistry {
    parsers = new Map();
    /**
     * Register a parser with a given name
     * @param name - The name to register the parser under
     * @param parser - The parser function
     */
    register(name, parser) {
        if (this.parsers.has(name)) {
            console.warn(`Parser "${name}" already registered, overwriting`);
        }
        this.parsers.set(name, parser);
    }
    /**
     * Get a parser by name
     * @param name - The name of the parser
     * @returns The parser function or undefined if not found
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
     * Unregister a parser
     * @param name - The name of the parser to remove
     * @returns True if the parser was removed, false if it didn't exist
     */
    unregister(name) {
        return this.parsers.delete(name);
    }
    /**
     * Get all registered parser names
     * @returns Array of parser names
     */
    getNames() {
        return Array.from(this.parsers.keys());
    }
}
/**
 * Global parser registry instance
 * Use this to register parsers that can be referenced by name in configs
 */
export const globalParserRegistry = new ParserRegistry();
// Register common built-in parsers
globalParserRegistry.register('timestamp', (v) => v ? new Date(v).getTime() : null);
globalParserRegistry.register('date', (v) => v ? new Date(v) : null);
globalParserRegistry.register('csv', (v) => v ? v.split(',').map((s) => s.trim()) : []);
globalParserRegistry.register('int', (v) => v ? parseInt(v, 10) : null);
globalParserRegistry.register('float', (v) => v ? parseFloat(v) : null);
globalParserRegistry.register('boolean', (v) => v !== null);
globalParserRegistry.register('json', (v) => {
    if (v === null || v === '')
        return null;
    try {
        return JSON.parse(v);
    }
    catch (e) {
        throw new Error(`Failed to parse JSON: "${v}". Error: ${e}`);
    }
});
import { ScopedParserRegistry } from './ScopedParserRegistry.js';
/**
 * Symbol for storing scoped parser registry on synthesizer elements
 * Using Symbol.for ensures the same symbol is used across different versions of the package
 */
const SCOPED_REGISTRY_SYMBOL = Symbol.for('assign-gingerly.scopedParserRegistry');
/**
 * Get the scoped parser registry for a synthesizer element
 * Creates a new registry if one doesn't exist
 * @param synthesizerElement - The synthesizer element (be-hive, htmx-container, alpine-scope, etc.)
 * @returns The scoped parser registry for this element
 */
export function getParserRegistry(synthesizerElement) {
    let registry = synthesizerElement[SCOPED_REGISTRY_SYMBOL];
    if (!registry) {
        registry = new ScopedParserRegistry();
        synthesizerElement[SCOPED_REGISTRY_SYMBOL] = registry;
    }
    return registry;
}
/**
 * Register a parser in a synthesizer element's scoped registry
 * @param synthesizerElement - The synthesizer element to register the parser with
 * @param name - Parser name
 * @param parser - Parser function
 */
export function registerParser(synthesizerElement, name, parser) {
    const registry = getParserRegistry(synthesizerElement);
    registry.register(name, parser);
}
