# React

Option A:

Define a handler:

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
        assignFrom(this /* this is the target */, {
            '?.button =>': {
                do: 'builtIns.react',
                act: {
                    on: 'click', //default based on inferencer
                    fromSource:{
                        assignTarget: {
                            "?.isHappy =!": ".",
                            "?.age +=": 10
                        }
                    }
                }, //can also be an array
                
            }
        }, {from: this /* this is the Source */})
}
customElements.define('mood-stone', MoodStone);
</script>
...

To reduce ceremonial noise:


```JS
assignFrom(this /* this is the target */, {
    '?.button +=': {
        on: 'click', //default based on inferencer
        // works from assign gingerly
        assignTarget: {
            "?.isHappy =!": ".",
            "?.age +=": 10
        },
        fromSource:{

        }
    }, //can also be an array
        
}, {from: this /* this is the Source */})
```

