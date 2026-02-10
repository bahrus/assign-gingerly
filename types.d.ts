export type EnhKey = string | symbol;

//used by mount-observer, not by assign-gingerly
type DisposeEvent = 
    | 'disconnect' 
    | 'dismount'
    | 'exit'

/**
 * Interface for registry items that define dependency injection mappings
 */
export interface IBaseRegistryItem<T = any> {
  spawn: { new (oElement?: Element, ctx?: SpawnContext<T>, initVals?: Partial<T>): T  };
  //keys of type string are attribute "coordinates"
  //and not used in assign-gingerly
  //keys of type symbol are used for dependency injection
  //and are used by assign-gingerly
  map: { [key: string | symbol]: keyof T };
  enhKey?: EnhKey;
  lifecycleKeys?: {
    dispose?: string | symbol
  }
  //used by mount-observer, not by assign-gingerly
  //impossible to polyfill, but will always be disposed
  //when oElement's reference count goes to zero
  disposeOn?: DisposeEvent | DisposeEvent[]
    
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
