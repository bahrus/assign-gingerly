# Dispatch (📡)

---

## Human Ask

```html
<my-custom-element>
    <template shadowrootmode=open>
        ...
        <input>
    </template>
</my-custom-element>
```

```JS
const myInputEventName = 'WIMiQo2ad06bD4A9EN43DA';
class MyCustomElement extends HTMLElement{
    #abortController;
    myInputEvent = ;
    connectedCallback(){
        this.#abortController = new AbortController();
        this.addEventListener(myInputEventName, e => {

        })
        ...
        assignFrom(this, {
            '?.shadowRoot?.querySelector?.input =>': {
                do: 'builtIns.dispatch', // or 📡
                get: {
                    on: 'input', // default based on inferencer
                    dispatch: {
                        type: myInputEventName,
                        bubbles: true, //default
                        cancelable: false, //default
                        composed: false, //default
                    },
                    //if true, stops propagation
                    replace: false

                },
                signal: this.#abortController.signal;
            }
        })
    }

    [myInputEventName](self: MyCustomElement, e: Event){

    }
}
```