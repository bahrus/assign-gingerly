# ActOn (🎯)

```html
<mood-stone>
    <div>
        Is Happy: <span id=happy></span>
        Age: <span id=age></span>
    </div>
    <button 🔀='{
        "assign": {
            "?.isHappy =!": ".",
            "?.age +=": 10
        "
    }'>Merge</button>
</mood-stone>
```
<script type=module>
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
        assignFrom(this, {
            '?.button =>': {
                do: 'builtIns.actOn' //or '🎯',
                // get: {

                // },
                act: {
                    assignFromSource:{
                        "?.isHappy =!": ".",
                        "?.age +=": 10
                    }
                },
                // use inferencer to get default if not specified
                on: 'click', 
            }
        }, {from: this})
    }
}
customElements.define('mood-stone', MoodStone);
</script>
...
