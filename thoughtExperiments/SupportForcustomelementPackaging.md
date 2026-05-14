# Support for Custom Element Packaging

In the old days, people would be able to define a custom element via a single reference.  Originally via a link to an html import file, but then the platform removed that support (which made me quite unhappy), so that was quickly followed by a single .js file. 

But then pointed out that to avoid namespace conflicts, it was best to separate the class definition from the registration code.  So now there were two files, but only one link to the registration module.

With the introduction of 