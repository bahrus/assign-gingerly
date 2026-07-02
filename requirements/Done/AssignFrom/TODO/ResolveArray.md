# Resolve Array

It would be nice to support resolving an array, only inside a resolve section of a handler config.  For example:

```JavaScript
const vm = {
    lastName: 'Targaryen'
    firstName: 'Helaena'
}
assignFrom(oElement, {
    '?.textContent' : {
        do: 'join',
        resolve: {
            stringArr: ['?.lastName', ', ', '?.firstName']
        }
    }
},{

})
```