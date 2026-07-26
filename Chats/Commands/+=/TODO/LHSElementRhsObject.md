# Lhs Element, Rhs Object

---

## Human Ask

When it comes to the += operator, the README.md currently lays out the following rules for how it behaves:

**Behavior by type:**

| LHS type | RHS type | Result |
|----------|----------|--------|
| number | number | addition (`2 += 3` → `5`) |
| string | any | string concatenation (`"hello" += 3` → `"hello3"`) |
| array | array | array concatenation (`[1,2] += [3,4]` → `[1,2,3,4]`) |
| array | non-array | push single item (`[1,2] += 3` → `[1,2,3]`) |
| undefined/missing | any | direct assignment |

This proposal is to deal more carefully with LHS DOM, RHS Object.

```html
<mood-stone>
    <div>
        Is Happy: <span id=happy></span>
        Age: <span id=age></span>
    </div>
    <button data-diff=10>Merge</button>
</mood-stone>
```

```JS
class MoodStone extends HTMLElement{
    #isHappy;
    get isHappy(){
        return this.#isHappy;
    }
    set isHappy(nv){
        this.#isHappy = nv;
        this.querySelector('#happy').textContent = nv ? '😊' : '😢'
    }
    #age;
    get age(){
        return this.#age;
    }
    set age(nv){
        this.#age = nv;
        this.querySelector('#age').textContent = nv;

    }
    connectedCallback(){
        this.isHappy = true;
        this.age = 0;
        assignFrom(this /* this is the target */, {
            '?.button +=': {
                on: 'click', //default based on inferencer
                // works from assignGingerly
                assignToTarget: {
                    "?.isHappy =!": ".",
                    "?.age +=": '?.dataset.diff'
                },
                //works from assignFrom
                fromLHS: {
                    "
                }
                //works from assignFrom
                fromSource:{

                }
            }, //can also be an array
                
        }, {from: this /* this is the Source */});
}
customElements.define('mood-stone', MoodStone);
```


