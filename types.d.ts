export type EnhKey = string | symbol;

// type NoUnderscore<T extends string> = T extends `_${string}` ? never : T;

// type YesUnderscore = `_${string}`;

// export type StringWithAutocompleteOptions<TOptions> = 
//     | (string & {})
//     | TOptions;

// export type StringNotStartWithUnderscoreAutocompleteOptions<TOptions> = 
//     | (NoUnderscore<string> & {})
//     | TOptions;

// export type StringStartWithUnderscoreAutocompleteOptions<TOptions> = 
//     | (YesUnderscore & {})
//     | TOptions;

//used by mount-observer, not by assign-gingerly
type DisposeEvent = 
    | 'disconnect' 
    | 'dismount'
    // cannot polyfill
    | 'exit' // element moved outside customElementRegistry
    //reference count outside any enhancements goes to zero
    | 'dispose'

/**
 * Interface for registry items that define dependency injection mappings
 */
export interface IBaseRegistryItem<T = any> {
  
  spawn: { 
    new (obj?: any, ctx?: SpawnContext<T>, initVals?: Partial<T>): T;
    canSpawn?: (obj: any, ctx?: SpawnContext<T>) => boolean;
  };
  
  //Applicable to passing in the initVals during the spawn lifecycle event
  withAttrs?: AttrPatterns<T>;
  
  //Allow unprefixed attributes for custom elements and SVG when element tag name matches pattern
  allowUnprefixed?: string | RegExp;
  
  //keys of type symbol are used for dependency injection
  //and are used by assign-gingerly
  symlinks?: { [key: symbol]: keyof T };
  //only applicable when spawning from a DOM Element reference
  enhKey?: EnhKey;
  lifecycleKeys?: {
    dispose?: string | symbol,
    resolved?: string | symbol
  }
  //used by mount-observer, not by assign-gingerly
  //impossible to polyfill, but will always be disposed
  //when oElement's reference count goes to zero
  disposeOn?: DisposeEvent | DisposeEvent[]

  whereElementMatches?: string

  whereInstanceOf?: Constructor | Constructor[]
    
}

export type Constructor = new (...args: any[]) => any;

export type pathString = `?.${string}`;

export interface AttrConfig<T = any> {
  /**
   * Type of the property value (JSON-serializable string format)
   */
  instanceOf?: 'Object' | 'String' | 'Number' | 'Boolean' | 'Array' 
              | typeof Object | typeof String | typeof Number | typeof Boolean | typeof Array;

  
  /**
   * Property name on the spawned class instance to map to
   * Use '.' to map to the root object using assignGingerly
   * Is optional.
   * If not specified, we assume it is the key without the underscore first
   * character, unless the key is _base in which case it assume mapsTo = "."
   */
  mapsTo?: 
    | '.' 
    | keyof T 
    | pathString 
    | `${pathString} +=`
    | `${pathString} =!`
    | `${pathString} -=`
  
  /**
   * Optional parser function to transform attribute string value
   */
  parser?: (attrValue: string | null) => any;
  
  // /**
  //  * Whether to only read the initial value (true) or continue observing changes (false)
  //  * Defaults to true (initial read only)
  //  */
  // initialOnly?: boolean;
}

export type AttrPatterns<T = any> = {
  /**
   * Base prefix for attribute names
   */
  base: string;

  /**
   * Configuration for the base pattern
   */
  _base?: AttrConfig<T>;
} & {
  // Provide autocomplete for all properties of T (optional)
  [K in keyof T]?: string | AttrConfig<T>;
} & {
  // Provide autocomplete for underscore-prefixed config keys
  [K in keyof T as `_${string & K}`]?: AttrConfig<T>;
} & {
  // Allow any other string keys for custom patterns
  [key: string]: string | AttrConfig<T>;
};


export interface SpawnContext<T = any> {
  mountInfo: IBaseRegistryItem<T>;
}

/**
 * Interface for the options passed to assignGingerly
 */
export interface IAssignGingerlyOptions {
  registry?: typeof BaseRegistry | BaseRegistry;
  bypassChecks?: boolean;
}

/**
 * Base registry class for managing dependency injection
 */
export declare class BaseRegistry {
  private items;
  push(items: IBaseRegistryItem | IBaseRegistryItem[]): void;
  getItems(): IBaseRegistryItem[];
  findBySymbol(symbol: symbol | string): IBaseRegistryItem | undefined;
  findByEnhKey(enhKey: string | symbol): IBaseRegistryItem | undefined;
}

/**
 * Main assignGingerly function
 */
export declare function assignGingerly(
  target: any,
  source: Record<string | symbol, any>,
  options?: IAssignGingerlyOptions
): any;

export default assignGingerly;
