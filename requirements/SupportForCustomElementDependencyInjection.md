# Support for Custom Element Dependency Injection

I think support the support this package provides for enhancing elements is quite solid now.

But the README Promises support for something called "custom element features", which I've been thinking about more lately.  I proposed a standard (without too much vetting or discussion) to the WHATWG.  Unfortunately, what I proposed doesn't really seem easily polyfillable without performing deep surgery on existing API's.

Regardless, here is that proposal, which I would like to achieve in spirit, if not in letter.

<details>
    <summary>Impractical standards proposal begins here</summary>

## How custom elements can opt in

So far we've been discussing using enhancements to enhance *third party* elements, built-in or custom.  Some of these enhancements/behaviors would provide functionality that is quite perpendicular to what the custom element provides -- e.g. logging, persistence, binding.  Others will be more aligned with the functionality the element provides.

But I think some of the infrastructure behind this proposal could be useful to [first party developers](https://github.com/WICG/webcomponents/issues/814#issuecomment-3392840225) as well.  In particular, it would be great if we empower custom element authors with:

1. ...the ability to break down one behavior into various aspects via quite semantic attributes, and roll them up into one behavior/enhancement.
2. ...dynamically name-spacing support for property names within registries, or, in contrast... 
3. ...leveraging the support of enhancements, but with more locked down prototype based properties
3. ...supporting lazy-loading of such functionality as needed.
4. ...declarative mapping of functionality similar to dependency injection.

... while leveraging the exact same class definition as above.

### Use cases?

One of the "slam dunk" use cases that come to mind is applying behaviors/enhancements that have proven really useful when applied to built-in elements, but now apply these same libraries to custom elements that aim to emulate the same built-in abilities.  The ability to acquire the traits of built-in elements may be becoming more achievable as the platform provides said behaviors [via internals](https://github.com/MicrosoftEdge/MSEdgeExplainers/blob/main/ElementInternalsType/explainer.md).

Another use case is for robust web components that do far more than just being a cool button or tab control -- components that provide business functionality, including managing domain objects.  These components would benefit from specializing, and breaking down the large component into smaller sub units.  Some sub units could utilize store libraries, like MobX stores, for example.

And another important use case is providing a nicely structured API to implement built-in behaviors provided by the platform, and orchestrating the handoff of access to internals and private data.

One way a first-party component could adopt a first-party or third-party behavior/enhancement would be to do this by simply spawning and/or attaching the enhancement as discussed above, "at arms length".

But suppose a behavior/enhancement's functionality is core to a custom element's mission, or close enough for government work? Suppose the custom element wants to provide key information that is not accessible from outside, like private data and/or the internals?  And/or suppose the custom element wants to nail down the name of the "custom prop" directly onto its namespaced object / prototype chain, so dependencies can leverage TypeScript and not have to be so vigilant about collisions between different (versioned) libraries that use the same name (beyond vigilance towards the shadow scoped name of the element itself).  As well as pinning down the (base) attribute(s) tied to the enhancement?

I propose a significant amendment to this proposal, support for...:


# Custom Element Features

## Dynamically, imperatively attaching a feature

Here, no "enh-" prefix is required for attributes.  In fact, enh- prefixed attributes will be ignored.

```TypeScript
interface PhotoTaker{}
class MyPhotoTaker implements PhotoTaker{
    constructor(customElement: HTMLElement, {info}: {info: MyPhotoTakerFeatureInfo}){
        super();
        ...
    }
    set internals?(elementInternals: HTMLElementInternals){
        ...
    }
}
interface BadgeMaker{}
class YourBadgeMaker implements BadgeMaker{
    constructor(customElement: HTMLElement, {info}: {info: YourPhotoTakerFeatureInfo}){
        super();
        ...
    }
    set internals?(elementInternals: HTMLElementInternals){
        ...
    }
}

interface ClubMemberProps {
    photoTaker:  PhotoTaker | undefined;
    badgeMaker:  BadgeMaker | undefined;
}

class ClubMember extends HTMLElement implements ClubMemberProps{
    constructor(){ 
        super();
        this.addEventListener('feature-added', e => {
            ...
        });
        this.attachInternals()
            .attachFeature<PhotoTaker, ClubMember>(MyPhotoTakerMountInfo)
            .toInstance(this)  //toInstance should expect an instance of ClubMember, TypeScript definers
            .atProp('photoTaker') // atProp should expect a keyof ClubMember for its parameter, TypeScript definers
            .attachFeature<BadgeMaker, ClubMember>(YourBadgeMakerMountInfo)
            .toInstance(this)
            .atProp('badgeMaker');
    }

    //use a decorator or some other means to convert these fields
    //into propertiees as needed
    photoTaker: PhotoTaker;

    badgeMaker: BadgeMaker;

}

```

I think this would allow for testable Mock Objects, especially if these methods (especially .attachFeature) is/are made overridable by a super class.

This code can be run at any time, not just in the constructor.

We would not call customElementRegistry.mount for this.

Instead, we define a small variation of MountInfo, called FeatureInfo.  The type definition for FeatureInfo would closely resemble that of MountInfo, but some fields of MountInfo don't quite make sense in this context, and other fields may make more sense in the context of features:


```TypeScript
type Feature = {new(): unknown} | () => Promise<{new(): unknown}>
interface FeatureInfo {
    spawn: Feature
    baseAttr?: Base
    attrMap?:...
    map?...
    //Instantiate the feature immediately when the custom element is created.
    //Applicable to the declarative support described below.
    loadEagerly?: boolean
    lifeCycleKeys:{
        internalsSetter: 'internals'
    }

}
```

I don't it makes sense for FeatureInfo to support enhKey, whereInstanceOf, for example.

## Support for adding features to the custom element prototype declaratively with dependency injection

In addition, we should provide for a way to declaratively attach when we don't need to be so dynamic:

```TypeScript
class ClubMember extends HTMLElement {
    
    photoTaker: PhotoTaker | undefined;
    badgeMaker: BadgeMaker | undefined;
}

customElementRegistry.define('club-member', ClubMember, {
    features: {
        photoTaker: MyPhotoTakerMountInfo,
        badgeMaker: YourBadgeMakerMountInfo
    }
});

```

Here the platform would attach the feature in the base HTML class (preferably in the constructor, I think) using the afore mentioned methods, if loadEagerly is set to true.  If loadEagerly is false (the default), the platform will only instantiate it when it finds a matching attribute or detects property access in ways that have been described above.

Both ways of attaching the enhancement (imperatively and declaratively) would result the custom element instance in the platform dispatching a non bubbling event, "featureadded", allowing the userland code to pass in such things as private data and element internals to the enhancement.  It would be great if the platform could prevent outsiders from dispatching this event.





## Support for private features

What if the feature need not expose any public interface?

Simply prefix the key with a #.  This will cause the FeatureAdded event to fire, without attempting to attach the feature, allowing the custom element to assign the feature to a private property if needed.

```TypeScript
class ClubMember extends HTMLElement {
    
    #photoTaker: MyPhotoTaker | undefined;
    #badgeMaker: YourBadgeMaker | undefined;
}

customElementRegistry.define('club-member', ClubMember, {
    features: {
        '#photoTaker': MyPhotoTakerFeatureInfo,
        '#badgeMaker': YourBadgeMakerFeatureInfo
    }
});

```

Done!

The next two asks are probably the lowest in the priority list, as I can see it being a hard sell.  They've also not yet been vetted with an actual implementation anywhere that I know of.

## Support for nested features

For really large components that make use of many features / behaviors / enhancements / whatever, it would be nice to be able to group them into "property bag" categories, so that the api becomes more scalable and manageable (unlike the platform).

I think given that these categories would tend to be fairly stable over time, and not have much custom logic if any,  we could leave much up to the developer to "hard code" these property bag classes without the benefit of dependency injection:

```TypeScript
class MyPhotoTaker implements PhotoTaker{}
class MyBadgeMaker implements BadgeMaker{}

// Properties could be added to the prototype, probably producing better performance
class RegistrationFeatures {
    photoTaker: PhotoTaker | undefined;
    badgeMaker: BadgeMaker | undefined;
}

class ClubMember extends HTMLElement{
    #registrationFeatures: Features;
    get registrationFeatures(){
        return this.#registrationFeatures;
    }
    
    constructor(){
        this.#registrationFeatures = new RegistrationFeatures();
    }
}

customElementRegistry.define('club-member', ClubMember, {
    features: {
        '?.registrationFeatures?.photoTaker': MyPhotoTakerFeatureInfo,
        '?.registrationFeatures?.badgeMaker': YourPhotoTakerFeatureInfo,
    }
})
```

So the platform should be able to assume that whenever it comes time to attach the features, the RegistrationFeatures instance will already be assigned to the registrationFeatures property, so there is no ambiguity about how to instantiate it.  I.e. we limit the dependency injection to that last property path (photoTaker/badgeMaker).


## Support for Prop-Passthrough's to custom element features

Unfortunately, some of the questionable design decisions made long ago behind DOM API's are likely to percolate to questionable design decisions to custom elements, with the advent of exposing platform behaviors.  I think the platform would have benefited from structuring functionality a little more, as it did with styles (and unlike aria, for example).  In particular, to emulate the built-in button, developers will want to add [properties to the top level](https://github.com/MicrosoftEdge/MSEdgeExplainers/blob/main/ElementInternalsType/explainer.md):

```TypeScript
class CustomButton extends HTMLElement {
    static buttonActivationBehaviors = true;

    constructor() {
        super();
        this.internals_ = this.attachInternals();
    }

    get commandForElement() {
        return this.internals_.commandForElement ?? null;
    }

    set commandForElement(element) {
        this.internals_.commandForElement = element;
    }

    get command() {
        return this.internals_.command ?? '';
    }

    set command(value) {
        this.internals_.command = value;
    }
}
customElements.define('custom-button', CustomButton);
```

Because there may be a growing number of such built-in behaviors that the developer will want to emulate, developers will naturally and understandably flock toward the mixin model, to avoid unnecessary clutter, versus more compositional approaches, just to seem more "native-like", indistinguishable from built-in buttons.  This could, in my view, encourage [problematic dependency anti-patterns](https://legacy.reactjs.org/blog/2016/07/13/mixins-considered-harmful.html).

I harbor no illusions that developers will be unanimously abandoning brittle mixins in favor of this platform nicety described below.  The amount of custom code that the developer would inject to achieve this built-in functionality in the property getters / setters would start out, at least, to be quite small. Thus the benefits of DI (testing, loose coupling, etc) would be small.  Still, I think it is worthwhile considering offering this ability, because I could see interest growing in this ability in scenarios where the amount of custom code that gets embedded in the getters / setters increases, so the benefits begin to outweigh the "costs".

### Scenario I - Static, declarative approach

In the above example, the "internals_" property is actually made publicly accessible, which is how MDN documents this feature.  Safari makes [it private](https://webkit.org/blog/13711/elementinternals-and-form-associated-custom-elements/) in their demonstrations.  Going with the latter approach, and adopting the more static, declarative way of attaching features, suppose we did this:


```TypeScript
class Behaviors {
    Command: ICommand
}
class CustomButton extends HTMLElement {
    static buttonActivationBehaviors = true;
    #internals;

    #behaviors: Behaviors;
    get behaviors() {
        return this.#behaviors;
    }

    constructor() {
        super();
        this.#behaviors = new Behaviors;
        this.#internals = this.attachInternals();
        //optional -- can skip this is theres no need to be untrusting
        //of how your users register your component.
        this.addEventListener('feature-added', e => {
            //optional, if there's any reason to be wary of trusting how
            //the custom was registered (I don't see a scenario where that would be the case)
            if(!(e.target instanceof CommandCustomElementFeature)) return; 

            //alternatively, this can be done by the platform, 
            //based on a static autoInjectInternals setting
            //as shown below
            e.target.internals = this.#internals;
        })
    }

    //optional
    static autoInjectInternals: true

}

interface CustomButton {
    behaviors: {
        command: CommandInterface
    }
}

//or a mixin would work well also, I think
class CommandCustomElementFeature implements CommandInterface{
    #internals;
    constructor(customElement: HTMLElement, commandFeatureInfo: FeatureInfo){
        super();
        this.channelEvent(new FeatureAddedEvent()); //FeatureAddedEvent would be a platform provided event
    }

    get commandForElement() {
        return this.#internals.commandForElement ?? null;
    }

    set commandForElement(element) {
        this.#internals.commandForElement = element;
    }

    get command() {
        return this.#internals.command ?? '';
    }

    set command(value) {
        this.#internals.command = value;
    }

    //standard name recognized by the platform
    set internals(nv){
        this.#internals = nv;
    }
}
customElements.define('custom-button', CustomButton, {
    features: {
        '?.behaviors?.command': {
            spawn: CommandCustomElementFeature,
            baseAttr: 'command',
            map: {
                '0.0': {
                    instanceOf: String,
                    mapsTo: 'command'
                },
            },
            passThrough: ['command', 'commandForElement']
            
        }
    }
});
```

What the platform would do with the passThrough setting:
   
Add simple pass-through properties 'command' and 'commandForElement' to the top level of the CustomButton class, with  setters which would spawn the CommandCustomElementFeature if needed, and pass the values through to the same named property of the custom element feature class instance, however deeply we specify as far as the path.

I think it's okay to use the "behaviors" property here, for custom elements only, since "HTMLElement" is kind of like "Object" in this context and I can't see it interfering with future built in behaviors added to higher order elements, nor cause developer confusion.

## See what we did there?

Other than the entirely optional double-checking in the feature-added event handler, the top level custom element has fully, 100% delegated implementation of the command behavior.  It doesn't even need to add "command" to the list of observed attributes, because the feature is taking care of watching for that attribute.  It's really "clean", and can focus on whatever top level functionality it needs to focus on that makes the custom button "custom".

</details>

# Human ask

## The practical proposal sketch

A custom element author needs to "opt in" to support properties added to the custom element prototype, that can be dynamically injected with class instances.  Unfortunately, because JavaScript ultimately isn't a typed language, we can't really enforce interface implementations, but we could theoretically add sanity checks:

```TypeScript
interface PhotoTaker {
    takePicture();
    someProp: string
}
class PhotoTakerDefaultImpl implements PhotoTaker{
    takePicture(){
        ...
    }
}
class ClubMember extends HTMLElement  {
    static DIProps = {
        photoTaker: {
            //optional
            fallbackSpawn: PhotoTakerDefaultImpl
            //optional
            validateShape(spawnedInstance){
                if(!(typeof spawnedInstance.takePicture !== 'function')) return false;
                return true;
            }

        }
    }
}
class PhotoTakerMock implements PhotoTaker {
    takePicture(){...}
}
customElementRegistry.define('club-member', ClubMember);
customElementRegistry.injectFeatures(ClubMember, {
    photoTaker: {
        //optional
        spawn: PhotoTakerMock
    }
});
```

This would add lazy getter properties (not setters) to the ClubMember prototype, in particular something like the equivalent of:

```JavaScript
class ClubMember extends HTMLElement{
    #photoTaker: PhotoTaker;
    get photoTaker(){
        if(this.#photoTaker === undefined){
            const {customElementRegistry} = this;
            const {dependencyInjections} = customElementRegistry;
            if(!dependencyInjections.has(ClubMember)){
                throw "Weird Error, should be there"; 
            }
            const features = dependencyInjections.get(ClubMember)!;
            const {photoTaker as di} = features;
            if(!di){
                throw "Another weird error, this shouldn't happen either";
            }
            const optIn = ClubMember.DIProps.photoTaker;
            if(!optIn) throw "Not supported";
            let {spawn} = di;
            if(!spawn) spawn = optIn.spawn;
            if(!spawn) throw "No implementation found";
            //get ctx, initVals similar to element enhancements
            const instance = new spawn(this, ctx, initVals);
            if(optIn.validate){
                if(!optIn.validate(instance)) throw "Doesn't look right".
            }
            this.#photoTaker = instance;
            

        }
        return this.#photoTaker;
    }
}
```

Then if assignGingerly encounters:

```JavaScript
const clubMember = document.createElement('club-member');
assignGingerly(clubMember, {
    photoTaker: {
        someProp: 'hello
    }
})
```

it... actually wouldn't need to do anything special, now that we have special treatment for readonly properties.






---

## Kiro's Comments / Questions

Thanks for the detailed writeup. The progression from the idealized WHATWG proposal down to the practical "Human ask" section is clear — you want DI for custom element features without deep platform surgery. A few observations and questions to sharpen the requirements before implementation:

### 1. Scope of this work within assign-gingerly

The practical proposal at the bottom introduces `customElementRegistry.injectFeatures(...)` and a `static DIProps` convention. Is the intent that assign-gingerly itself provides:

- (a) The lazy getter installation logic (reading `static DIProps`, wiring up the prototype getter), **and**
- (b) The `injectFeatures` registry method (or a polyfill of it on `CustomElementRegistry.prototype`),

...or is (b) expected to live in a separate package (like mount-observer) that depends on assign-gingerly?

My read is that assign-gingerly already extends `CustomElementRegistry` with `enhancementRegistry` / `itemscopeRegistry`, so adding a `dependencyInjections` map here feels consistent. Just want to confirm.

### 2. Timing: when do lazy getters get installed?

The pseudocode shows the getter accessing `this.customElementRegistry` — but `HTMLElement` instances don't natively have that property. Two possible moments to wire things up:

- **At `define()` time** — monkey-patch the prototype immediately when `customElements.define('club-member', ClubMember)` is called (or via a wrapper).
- **At `injectFeatures()` time** — install getters only when `injectFeatures` is called, which could happen before or after `define()`.

Which ordering should be supported? If `injectFeatures` can be called *before* `define`, the getter installation can't rely on the registry having the constructor registered yet. If it's always *after*, we can look up the registry from the constructor.

### 3. Multiple registries (shadow DOM scoped registries)

With scoped custom element registries on the horizon, a single `customElementRegistry.injectFeatures(ClubMember, ...)` call assumes one global registry. Should the API accept an optional registry parameter, or is it always tied to the registry where the element was defined?

### 4. Constructor signature for spawned features

The pseudocode shows:

```JavaScript
const instance = new spawn(this, ctx, initVals);
```

What are `ctx` and `initVals` in this context? For element enhancements they come from attribute parsing and the enhancement config. For DI features on a custom element, where do they originate? Possibilities:

- `ctx` could carry a reference to the registry + the DIProps config entry.
- `initVals` could come from the object being assigned via `assignGingerly` (the `photoTaker: { someProp: 'hello' }` example at the end).

Or should the constructor signature be simpler for DI features — just `new spawn(hostElement)` — since the feature is "first-party" and can access what it needs through the host?

### 5. Interaction with assignGingerly's readonly property detection

You mention at the end that assignGingerly "wouldn't need to do anything special" because of existing readonly property treatment. Let me confirm the expected flow:

1. `injectFeatures` installs a **getter-only** property (`photoTaker`) on the prototype.
2. `assignGingerly(clubMember, { photoTaker: { someProp: 'hello' } })` detects it's a getter-only accessor.
3. It reads the getter (which lazily spawns the feature instance), then recursively merges `{ someProp: 'hello' }` into that instance.

That's elegant — the existing machinery handles it. Just confirming that's the intended interaction.

### 6. validateShape — runtime only, or also TypeScript?

The `validateShape` callback is a runtime guard. Is there also an expectation of TypeScript generics on `DIProps` to enforce the interface at compile time? Something like:

```TypeScript
static DIProps: DIPropsConfig<ClubMember> = {
    photoTaker: {
        fallbackSpawn: PhotoTakerDefaultImpl,
        // TypeScript enforces PhotoTakerDefaultImpl implements PhotoTaker
    }
}
```

Or is this intentionally loose to keep the API simple and JSON-friendly?

### 7. Suggested implementation plan (if the above is confirmed)

1. Define a `DIPropsConfig` type and a `DependencyInjectionEntry` interface.
2. Add a `dependencyInjections` WeakMap on `CustomElementRegistry.prototype` (keyed by constructor).
3. Implement `injectFeatures(Ctor, config)` — merges config with `Ctor.DIProps`, installs lazy getters on `Ctor.prototype`.
4. Ensure assignGingerly's existing readonly/accessor detection handles the lazy getter correctly (likely already works, needs a test).
5. Add tests: basic DI, fallback spawn, validateShape rejection, interaction with assignGingerly merging.

Let me know which of these questions change the direction, and I'll start on a more concrete design doc or jump straight to implementation.

---

## Human Response I

Hmm, actually, this package is getting quite large as it is.  I'm thinking this feature would perhaps make more sense as a separate package that depends on this one, thanks for suggesting that possibility.  

What name suggestions do you have for such a package, that hasn't yet been registered in npm?  npm is really finicky about not allowing names that are too close to other ones.  Can you suggest names that are highly likely to be accepted by npm?
