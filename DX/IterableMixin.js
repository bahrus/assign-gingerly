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
export function IterableMixin() {
    return function (Base) {
        class WithIterableStatics extends Base {
            #myList = [];
            static getItems(instance) {
                return instance.#myList;
            }
            static setItems(instance, items) {
                instance.#myList = items;
                WithIterableStatics.#notifyChange(instance);
            }
            static assignTo(instance, rhs) {
                if (Array.isArray(rhs)) {
                    WithIterableStatics.setItems(instance, rhs);
                }
                else if (typeof rhs === 'object' && rhs !== null) {
                    Object.assign(instance, rhs);
                }
            }
            static #notifyChange(instance) {
                // Only dispatch if this instance actually supports it
                // (i.e. it's an HTMLElement / EventTarget). Plain classes
                // just skip this silently.
                const maybeTarget = instance;
                if (typeof maybeTarget.dispatchEvent === 'function') {
                    maybeTarget.dispatchEvent(new Event('items-changed'));
                }
            }
        }
        return WithIterableStatics;
    };
}
/* ---------------------------------------------------------------- */
/* Usage examples                                                    */
/* ---------------------------------------------------------------- */
// 1) Custom element — same call shape as the original class.
// class MyIterableCustomElement extends IterableMixin<string>()(HTMLElement) {}
// const el = new MyIterableCustomElement();
// el.addEventListener('items-changed', () => console.log('list changed!'));
// MyIterableCustomElement.setItems(el, ['a', 'b', 'c']);
// console.log(MyIterableCustomElement.getItems(el));
// // 2) Plain class, no DOM dependency — dispatch is skipped, no error.
// class PlainList extends IterableMixin<number>()(class {}) {}
// const plain = new PlainList();
// PlainList.setItems(plain, [1, 2, 3]);
// console.log(PlainList.getItems(plain));
// 3) Composable with other mixins the usual way:
// class Combined extends OtherMixin()(IterableMixin<string>()(HTMLElement)) {}
