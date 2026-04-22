import type { EnhancementConfig } from "./types/assign-gingerly/types";

/**
 * Symbol for smart value assignment
 * When used with element.set[value], it infers and sets the appropriate value property
 */
export const value = Symbol.for('assign-gingerly:value');

/**
 * Symbol for smart display assignment
 * When used with element.set[display], it infers and sets the appropriate display property
 */
export const display = Symbol.for('assign-gingerly:display');

/**
 * Enhancement class that provides smart value and display property inference
 * Automatically determines the correct property to set based on element type
 */
export class Infer<TValue = any, TDisplay = any> {
    #weakRef: WeakRef<Element>;

    get enhancedElement(){
        return this.#weakRef.deref()!;
    }
    
    constructor(enhancedElement?: Element){
        this.#weakRef = new WeakRef(enhancedElement!);
    }

    #value: TValue | undefined;
    
    get value(): TValue | undefined {
        return this.#value;
    }
    
    set value(nv: TValue){
        this.#value = nv;
        const {enhancedElement} = this;
        (enhancedElement as any)[inferValueProperty(enhancedElement)] = nv;
    }

    #display: TDisplay | undefined;
    
    get display(): TDisplay | undefined {
        return this.#display;
    }
    
    set display(nv: TDisplay){
        this.#display = nv;
        const {enhancedElement} = this;
        (enhancedElement as any)[inferDisplayProperty(enhancedElement)] = nv;
    }
}

/**
 * Registry item for the Infer enhancement
 * Register this with customElements.enhancementRegistry to enable smart value/display assignment
 */
export const registryItem: EnhancementConfig = {
    spawn: Infer,
    enhKey: 'infer',
    symlinks: {
        [value]: 'value',
        [display]: 'display'
    }
}

/**
 * Infer the most appropriate value property for an element
 * @param element - The element to infer the property for
 * @returns The property name to use for value assignment
 */
export function inferValueProperty(element: Element): string {
    const tagName = element.tagName.toLowerCase();
    
    // Input elements - check type attribute
    if (tagName === 'input') {
        const type = element.getAttribute('type')?.toLowerCase();
        if (type === 'checkbox' || type === 'radio') {
            return 'checked';
        }
        return 'value';
    }
    
    // Form controls with value property
    if (tagName === 'textarea' || tagName === 'select') {
        return 'value';
    }
    
    // Semantic HTML elements with specific properties
    if (tagName === 'time') {
        return 'dateTime';
    }
    
    if (tagName === 'data') {
        return 'value';
    }
    
    if (tagName === 'meter' || tagName === 'progress') {
        return 'value';
    }
    
    if (tagName === 'output') {
        return 'value';
    }
    
    // Check for itemprop attribute as a hint
    const itemprop = element.getAttribute('itemprop');
    if (itemprop) {
        return itemprop;
    }
    
    // Default fallback
    return 'textContent';
}

/**
 * Infer the most appropriate display property for an element
 * @param element - The element to infer the property for
 * @returns The property name to use for display assignment
 */
export function inferDisplayProperty(element: Element): string {
    const tagName = element.tagName.toLowerCase();
    
    // Form controls display their value
    if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
        return 'value';
    }
    
    // Time elements display formatted time
    if (tagName === 'time') {
        return 'textContent';
    }
    
    // Data elements display human-readable content
    if (tagName === 'data') {
        return 'textContent';
    }
    
    // Progress/meter elements use ARIA for display
    if (tagName === 'meter' || tagName === 'progress') {
        return 'ariaValueText';
    }
    
    // Default fallback
    return 'textContent';
}

export default registryItem;
