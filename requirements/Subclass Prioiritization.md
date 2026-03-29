## Part II Subclass Prioritization

When a framework passes properties to a web component, the web component may not have upgraded yet, but when the component does upgrade, it can get the last values passed in (which may include previously merging passed in values depending on the framework), and pick it up from there.

The issue becomes trickier when we consider passing properties to enhancements which may or not have been upgraded.  We can so so with delicacy:

```JavaScript
const result = assignGingerly({}, {
    "[Symbol.for('TFWsx0YH5E6eSfhE7zfLxA')]": true,
    "[Symbol.for('BqnnTPWRHkWdVGWcGQoAiw')]": true,
    style: {
      height: '40px'
    }
    enh: {
      mellowYellow?.madAboutFourteen': true
    }
});
```

The focus here is on the last property setting:

```JavaScript
const result = assignGingerly({}, {
    enh: {
      mellowYellow?.madAboutFourteen': true
    }
});
```

But what if there are scenarios where that seems like overkill -- we have a framework or scenario where we 

1.  Just want to pass the full set of property values in one go, not worry about setting things delicately.
2.  Not worry whether the enhancement class instance has been attached to the .enh property gateway yet or not.
3.  When sending updates to the enhancement, maybe we prefer passing the full state each time.  And of course in this scenario, we don't want to replace the instantiated enhancement with a simple object.

The last requirement we implemented simplified the way we can set style and enh properties because they are read only, which allowed us to specify style above (in addition to enh).

Is there some other rule we can follow, some other assumption that would allow us to simplify the property setting above to: 


```JavaScript
const result = assignGingerly({}, {
    enh: {
      mellowYellow: {
        madAboutFourteen: true 
      }
    }
});
```

without replacing the mellowYellow enhancement instance with the passed in object?

?

## Kiro's suggestions:

