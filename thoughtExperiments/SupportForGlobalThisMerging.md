# Support for Global This Merging

---

## Human Ask

I'm trying to figure out if assign-gingerly is the right fit for supporting the following need (legacy below):

```html
    
<script type=module>
    (await import('trans-render/lib/weave.js'))
    .weave({
        baseURL:  "globalThis://newton-microservice/href"
    })
    .into('qmywdO1vr0SwyuIe4fvzxQ')
    .andWeave({
        myCustomHeader: 'goodbye'
    })
    .into('rPpwNLcYsUOjFcg+N8lmOA');
</script>
<form id=testForm be-reformable='{
    "...": "qmywdO1vr0SwyuIe4fvzxQ",
    "path": "api/v2/:operation/:expression",
    "headerFields": ["#myHeader"],
    "headers": {
        "...": "rPpwNLcYsUOjFcg+N8lmOA"
    }
}'
>
<label>
    header:
    <input id=myHeader value=hello>
</label>
<label>
    Operation:
    <input :operation value=integrate>
</label>

<label>
    Expression:
    <input :expression value="x^2">
</label>
    <input name="hello" value=test>
</form>
<script>
    testForm.addEventListener('fetch-ready', e => {
        console.log({e});
    })
</script>
```

I'd like to couch it as something that could be more generalized:

```JavaScript
oForm.assignGingerly({
    "...": "globalThis://qmywdO1vr0SwyuIe4fvzxQ",
    "path": "api/v2/:operation/:expression",
    "headerFields": ["#myHeader"],
    "headers": {
        "...": "rPpwNLcYsUOjFcg+N8lmOA"
    }
}, {
    protocols: {
        globalThis: myGlobalThisHandler
    }
})
```

Other protocols could include IndexedDB, SessionStorage, LocalStorage,  JsonImport, etc.

But I think maybe some of them should be built in, starting with globalThis, and I think localStorage and sessionStorage.

Or maybe we should add another subregistry in the customElementRegistry, for protocols?