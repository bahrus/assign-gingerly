# Support for View Transition for LazyLoad and LazyLoadSwitch.


---

## Human Ask

The lazy-load and especially LazyLoadSwitch are heavily influenced by the [be-switched](https://raw.githubusercontent.com/bahrus/be-switched/refs/heads/baseline/README.md)

One feature that enhancement supports that the LazyLoad handlers don't yet support is [view transitions](https://github.com/bahrus/be-switched/tree/baseline#use-view-transitions).

The implementation took quite a few iterations to get right, implemented by Kiro.  I wish I had asked kiro to document a "lessons learned" from the experience, but in the absence of that, a [deep study of the code](https://raw.githubusercontent.com/bahrus/be-switched/refs/heads/baseline/be-switched.js) will have to suffice, and is deeply recommended before embarking.  Also, I definitely want a demo and/or test page I can open and test visually for this feature.

be-switched as a single configurable property, transitional, to specify to engage in this api.  The rest relies on css (conventions) to configure how the transition should behave, and does use some "namespaced" css defaults for this, as I recall.

I'm not an expert at all in view transitions, so I open the floor to how you recommend configuring and implementing this feature below.

