# Ternary Assignment

---

## Human Ask

It would be nice to support ternary, conditional assignment with AssignFrom.  One approach would be to use an asynchronous(ish) built in handler, or protocol.

Let's first explore whether there's some other syntax that feels non-hackish and avoids the ceremony of a handler or protocol

Dynamic:


```JS
const vm = {
    isHappy: true,
    happyMessage: 'I am happy',
    sadMessage: 'I am sad'
}
assignFrom(oElement, {
    '?.textContent': '?.isHappy?.@?.happyMessage?.@:?.sadMessage'
})
```

Constant:

```JS
const vm = {
    isHappy: true,
    happyMessage: 'I am happy',
    sadMessage: 'I am sad'
}
assignFrom(oElement, {
    '?.textContent': '?.isHappy?.@?.`I am happy`?.@:?.`I am sad`'
})
```

Worth doing?  Any better ideas?



