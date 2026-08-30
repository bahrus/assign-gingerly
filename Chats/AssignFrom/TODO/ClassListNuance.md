# ClassList nuance

## Bruce's Request

One fundamentally important operation why *might* not yet support with the existing assignFrom functionality is:

```JS
const vm: {
    isTrue: boolean
} = {isTrue: false}
if(vm.isTrue) {
    oElement.classList.add('isTrueCls');
}else{
    oElement.classList.remove('isTrueCls');
}
```

Am I mistaken?  If so, please provide the syntax I'm missing / forgetting.

If not, how would you recommend enhancing the syntax to support this?

