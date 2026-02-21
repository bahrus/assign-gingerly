/**
 * Registry for named parsers that can be referenced by string name
 * Enables JSON serialization of configs with custom parsers
 */
export class ParserRegistry {
  private parsers = new Map<string, (v: string | null) => any>();
  
  /**
   * Register a parser with a given name
   * @param name - The name to register the parser under
   * @param parser - The parser function
   */
  register(name: string, parser: (v: string | null) => any): void {
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
  get(name: string): ((v: string | null) => any) | undefined {
    return this.parsers.get(name);
  }
  
  /**
   * Check if a parser is registered
   * @param name - The name to check
   * @returns True if the parser exists
   */
  has(name: string): boolean {
    return this.parsers.has(name);
  }
  
  /**
   * Unregister a parser
   * @param name - The name of the parser to remove
   * @returns True if the parser was removed, false if it didn't exist
   */
  unregister(name: string): boolean {
    return this.parsers.delete(name);
  }
  
  /**
   * Get all registered parser names
   * @returns Array of parser names
   */
  getNames(): string[] {
    return Array.from(this.parsers.keys());
  }
}

/**
 * Global parser registry instance
 * Use this to register parsers that can be referenced by name in configs
 */
export const globalParserRegistry = new ParserRegistry();

// Register common built-in parsers
globalParserRegistry.register('timestamp', (v) => 
  v ? new Date(v).getTime() : null
);

globalParserRegistry.register('date', (v) => 
  v ? new Date(v) : null
);

globalParserRegistry.register('csv', (v) => 
  v ? v.split(',').map(s => s.trim()) : []
);

globalParserRegistry.register('int', (v) => 
  v ? parseInt(v, 10) : null
);

globalParserRegistry.register('float', (v) => 
  v ? parseFloat(v) : null
);

globalParserRegistry.register('boolean', (v) => 
  v !== null
);

globalParserRegistry.register('json', (v) => {
  if (v === null || v === '') return null;
  try {
    return JSON.parse(v);
  } catch (e) {
    throw new Error(`Failed to parse JSON: "${v}". Error: ${e}`);
  }
});
