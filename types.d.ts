export type EnhKey = string | symbol;

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
  
  spawn: { new (oElement?: Element, ctx?: SpawnContext<T>, initVals?: Partial<T>): T  };
  
  attrs: AttrPatterns<T>;
  //keys of type string are attribute "coordinates"
  //and not used in assign-gingerly
  //keys of type symbol are used for dependency injection
  //and are used by assign-gingerly
  map: { [key: string | symbol]: keyof T };
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
    
}

export type pathString = `?.${string}`;

export interface AttrConfig<T = any> {
  /**
   * Type of the property value (JSON-serializable string format)
   */
  instanceOf?: 'Object' | 'String' | 'Number' | 'Boolean' | 'Array' 
              | typeof Object | typeof String | typeof Number | typeof Boolean | typeof Array;
  
  /**
   * Property name on the spawned class instance to map to
   * Use '.' to map to the root object
   */
  mapsTo: 
    | '.' 
    | keyof T 
    | pathString 
    | `!delete ${pathString}`
    | `!toggle ${pathString}`
    | `!inc ${pathString}`
  
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

export interface AttrPatterns<T = any> {
  /**
   * Base prefix for attribute names
   */
  base: string;
  
  /**
   * Configuration for the base pattern
   */
  _base: AttrConfig<T>;
  
  /**
   * User-defined patterns:
   * - Keys without underscore: template strings (e.g., '${base}:hello')
   * - Keys with underscore: configuration objects (e.g., _a: { instanceOf: 'String', mapsTo: 'hello' })
   */
  [key: string]: string | AttrConfig<T>;
}


export interface SpawnContext<T = any> {
  mountInfo: IBaseRegistryItem<T>;
}

/**
 * Interface for the options passed to assignGingerly
 */
export interface IAssignGingerlyOptions {
  registry?: typeof BaseRegistry | BaseRegistry;
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
