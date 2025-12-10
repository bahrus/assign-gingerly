/**
 * Interface for registry items that define dependency injection mappings
 */
export interface IBaseRegistryItem<T = any> {
  spawn: { new (): T } | Promise<{ new (): T }>;
  map: { [key: string | symbol]: keyof T };
  enhKey?: string;
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
  define(items: IBaseRegistryItem | IBaseRegistryItem[]): void;
  getItems(): IBaseRegistryItem[];
  findBySymbol(symbol: symbol | string): IBaseRegistryItem | undefined;
}

/**
 * Main assignGingerly function
 */
export declare function assignGingerly(
  target: any,
  source: Record<string | symbol, any>,
  options?: IAssignGingerlyOptions
): Promise<any>;

export default assignGingerly;
