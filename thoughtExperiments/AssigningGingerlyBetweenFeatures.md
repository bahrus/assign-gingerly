# Assigning Gingerly Between Features

---

## Human Ask

I'm finding an increasing number of use cases where one custom element feature provides information needed by another custom element feature.  The most glaring one for me is the [roundabout-feature](https://github.com/bahrus/face-up), because it tends to be the feature that ties everything together.  We have one though experiment that focuses on inheritance, which is one angle to approach this problem.  I'm thinking that another approach would be to inherit all the features except the round-about feature, and make that the one that gets a fresh coat of paint when defining the end user custom element.

The first such scenario, which seems surmountable in a way, is the [face-up enhancement](https://github.com/bahrus/face-up).  It [documents](https://github.com/bahrus/face-up#roundabout-integration) and [publishes a specific, static module](https://raw.githubusercontent.com/bahrus/face-up/refs/heads/baseline/RAConfig.mjs) that will want to be merged into to the round about settings.  But this requires a certain amount of coordination, which is okay, I guess.

What is tipping me over the edge enough to bring up this topic (in addition to the topic of custom element inheritance) is another feature I'm planning, that takes a document fragment from the live DOM tree, and turns it into template that can be used by the custom element to clone in each instance.  I want that feature to optionally look for microdata itemprop attributes, and form some roundabout merges and withAttrs and propagator settings that the roundabout feature would want to incorporate in.  This can't be published as a static module.

Basically, I would like to make sure we have a predictable chain, timing wise, and feature A, if passed a flag to do so, to be able to optionally say, "hey, feature B, I think you will want to merge this information into your settings" when it's your turn to register.

How would you orchestrate that?

