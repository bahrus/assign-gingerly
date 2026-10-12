# Tree Phase II - A formal View Model Integration

## Bruce's Ask

The way a previous iteration [tree-demo.html](../../../../demos/tree-demo.html) worked is it took the [raw data retrieved from the api call](../../../../demos/data/launch.json), and it ran it through a "toViewModel" method that replaces the raw data with a similar structure, that is completely tailored to binding the UI to it.

This approach was replaced by "pipes" which allows a formal way to apply computed values that derive from the raw data.  There is still a minimal "currentVm()" left over.

The pipes look as follows:

```JS
const pipes = {
    parseDate: Date.parse,
    longUtc: new Intl.DateTimeFormat(undefined, { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }).format,
    metersLabel: ({ meters }) => `${meters} m`,
    feetLabel: ({ feet }) => `${feet} ft`,
    kgLabel: ({ kg }) => `${kg.toLocaleString()} kg`,
    lbLabel: ({ lb }) => `${lb.toLocaleString()} lb`,
    coreSummary: ({ serial, flight, reused, landing_success, landing_type }) =>
        `${serial}, flight ${flight}${reused ? ' (reused)' : ''}; landing: ${landing_success ? 'success' : 'not successful'} (${landing_type})`,
    linkList: links => Object.entries(links)
        .filter(([, href]) => typeof href === 'string') // wikipedia: null → skipped
        .map(([name, href]) => ({ name, href })),
};
```



