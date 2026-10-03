# DOM Element Isms Handler

## Bruce

I'm not set on the name for this, so very open to suggestions.

## Use Case

The typical use case is a JSON object is retrieved from an API, and we want to 

1.  Map the JSON object to a DOM tree the first time
2.  Update the DOM with a retrieval of new JSON

This can be handled by a specific rendering technology like template literals.  That is not what this handler focuses on.  Instead, the assumption is that we will want each node to be managed by a class.  In some cases, it could be a custom element.  In some cases it could be a a built in element with an itemscope manager.  In some cases it could be a custom element with an itemscope manager.

From the point of view of this handler, we assume there is itemscope manager, tied to the name of the property.

## Simple example

```html
<details id=api-response>
    <summary>API Response</summary>
</details>
```

```TS
const vm = {
    image:{
        url: 'https:...',
        description: 'Lunar Surface'
    }
}

class ImageHandler {
    static instantiate(image: Image, ctx: TBD){
        const img = document.createElement('img');
        const {url, description} = image;
        img.src = url;
        img.alt = description;
        return img;
    }
}

customElements.itemscopeRegistry.define('image', {
    manager: ImageHandler
});

await assignFrom(document.getElementById('api-response'), {
    '?. =>': {
        do: 'builtIns.DEIsms',
    }
}, {
    from: vm
})
```

This would result in:

```html
<details id=api-response>
    <summary>API Response</summary>
</details>
```

