# Parked Enhancements

### Parked (TODO, as you suggested)

1. **Log unfilled holes and unknown hole names** once there's a debugging or tracing facility. For now they're silent, by design.
2. **Holes inside a nested `<template>`,** if a strong use case comes up. It's refused now, so adding it later is safe (see above).
3. **A hole inside another hole** (in its fallback), on the same terms.
4. **SVG children inside holes:** a hole can be an SVG element, and text and attributes work. But elements Tree creates inside it are HTML elements, so this waits on SVG namespace support in Tree's `createElement`. That's worth its own TODO; say if you'd like me to file it.