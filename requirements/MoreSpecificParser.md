# More Specific Parser

types/assign-gingerly/typpes.d.ts has this definition:

```TypeScript
export interface AttrConfig<T = any> {
    ...
    /**
   * Parser to transform attribute string value
   * - Function: Inline parser function (not JSON serializable)
   * - String: Named parser reference (JSON serializable)
   *   - Simple name: Looks up in global parser registry (e.g., 'timestamp', 'csv')
   *   - Dot notation: Looks up static method on custom element (e.g., 'my-widget.parseSpecial')
   *     Falls back to global registry if custom element not found
   */
   parser?: ((attrValue: string | null) => any) | string;
}
```

Currently, there's kind of a fuzzy "try this, and if that fails, try that" logic as far as supporting the "Dot notation".  This requirement is to remove the "Dot notation" option for the string value and replace with a two-value tuple:



```TypeScript
export type CustomElementName = string;
export type CustomElementConstructorStaticMethodName = string;
export interface AttrConfig<T = any> {
    ...
  parser?: 
    | ((attrValue: string | null) => any) 
    | string 
    
    | [CustomElementName, CustomElementConstructorStaticMethodName]
  ;
}
```