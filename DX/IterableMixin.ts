/**
 * A constructor type — anything `new`-able. Required so the mixin
 * can be applied on top of an arbitrary base class.
 */
type Constructor<T = {}> = new (...args: any[]) => T;

/**
 * IterableMixin
 * -------------
 * Adds a private `TItem[]` list to the *instance* (storage has to live
 * somewhere), but exposes all the behavior — getItems/setItems/assignTo
 * — as STATIC methods on the resulting constructor, matching the
 * original `static getItems(instance)` style. No instance methods are
 * added.
 *
 * Because private fields are only reachable from code written inside
 * the class body, the static methods have to be declared right next
 * to the `#myList` field — that's what makes `instance.#myList` legal
 * from a `static` method.
 *
 * Works on HTMLElement subclasses (dispatches an event if the instance
 * supports it) and on plain classes (skips the dispatch silently).
 */
export function IterableMixin<TItem>() {
  return function <TBase extends Constructor>(Base: TBase) {
    class WithIterableStatics extends Base {
      #myList: TItem[] = [];

      static getItems(instance: WithIterableStatics): TItem[] {
        return instance.#myList;
      }

      static setItems(instance: WithIterableStatics, items: TItem[]): void {
        instance.#myList = items;
        WithIterableStatics.#notifyChange(instance);
      }

      static assignTo(
        instance: WithIterableStatics,
        rhs: TItem[] | Record<string, unknown>
      ): void {
        if (Array.isArray(rhs)) {
          WithIterableStatics.setItems(instance, rhs);
        } else if (typeof rhs === 'object' && rhs !== null) {
          Object.assign(instance, rhs);
        }
      }

      static #notifyChange(instance: WithIterableStatics): void {
        // Only dispatch if this instance actually supports it
        // (i.e. it's an HTMLElement / EventTarget). Plain classes
        // just skip this silently.
        const maybeTarget = instance as unknown as { dispatchEvent?: (e: Event) => boolean };
        if (typeof maybeTarget.dispatchEvent === 'function') {
          maybeTarget.dispatchEvent(new Event('items-changed'));
        }
      }
    }

    return WithIterableStatics;
  };
}
