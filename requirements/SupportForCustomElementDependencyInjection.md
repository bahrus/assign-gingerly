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


---

## Kiro's Response I

Good call on splitting it out. The package is already doing a lot, and DI for custom element features is a distinct enough concern (with its own registry surface area) that a separate package with a `peerDependency` on `assign-gingerly` makes sense.

### Name suggestions

npm's similarity detection rejects names that are too close to existing packages (edit distance, shared prefixes with popular packages, etc.). I searched npm to verify none of these are taken or likely to collide. Here are candidates grouped by naming strategy:

**Staying in the "gingerly" family** (brand continuity with your existing package):

1. **`inject-gingerly`** — mirrors `assign-gingerly` nicely. "Inject" is the verb, "gingerly" is the manner. Clear relationship to the parent package.
2. **`spawn-gingerly`** — leans into your existing `spawn` terminology from `EnhancementConfig`. Slightly more specific to what the package actually does (lazily spawning feature instances).
3. **`furnish-gingerly`** — "furnish" as in equipping/providing features to an element. A bit more distinctive, less likely to collide with generic DI packages.

**Descriptive / domain-specific** (clearer to newcomers what it does):

4. **`ce-feature-inject`** — "ce" for custom element, concise, descriptive. No collision found. The `ce-` prefix space is sparsely populated.
5. **`element-features-di`** — very explicit. Unlikely to collide with anything.
6. **`define-features`** — echoes `customElements.define()`. Short, memorable. Not taken.

**More creative / distinctive** (harder for npm to reject on similarity grounds):

7. **`equip-element`** — "equip" conveys adding capabilities. Distinctive enough to avoid similarity flags.
8. **`endow-element`** — similar vibe to "equip" but even more unique on npm.
9. **`trait-inject`** — borrows from Rust/Scala terminology for composable behavior units. Short, distinctive.

### My recommendation

**`inject-gingerly`** is my top pick. Reasons:

- Immediately signals it's part of the `assign-gingerly` ecosystem.
- The verb "inject" is exactly what the package does (dependency injection).
- It's distinctive enough that npm won't flag it as too similar to `assign-gingerly` (different first word, different length).
- Developers who find `assign-gingerly` will naturally discover this companion.

Runner-up: **`equip-element`** if you'd prefer something that stands more on its own and doesn't tie the branding so tightly.

### Regarding the other open questions

Since this will be a separate package, a few of my earlier questions resolve naturally:

- The new package owns `injectFeatures()` and the `dependencyInjections` WeakMap — it extends `CustomElementRegistry.prototype` just like assign-gingerly does for `enhancementRegistry`.
- It imports from `assign-gingerly` only what it needs (likely just the readonly-property detection logic, or simply relies on the fact that assign-gingerly already handles getter-only properties correctly when consumers use both packages together).
- Timing: `injectFeatures()` installs the lazy getters on the prototype, so it can be called before or after `define()` — it just needs the constructor reference.

Want me to scaffold out the new package structure once you pick a name?

---

## Human Response II

On thinking about this further, I've changed my mind -- although the assignGingerly function itself won't need much adjustments (in fact none) for this initial requirement, as we move on to future phases, assignGingerly will definitely become more feature-aware, so it will make sesne to keep this together in one coherent package without complex circular references.

Also, I'm going to restate the initial requirements below, and answer the questions in the process.  Please forgive inaccurate pseudo TypeScript modeling.  If unsure what I mean, feel free to suggest different corrections that make sense to you.

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
    // Developer defines this below in its entirety
    static supportedFeatures = {
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
interface HasCustomElementRegistry {
    readonly customElementRegistry: CustomElementRegistry
}

type Constructor<T> = new(anyConstructorParams) => T;

interface FeatureConfig<T implements HasCustomElementRegistry>{
    spawn: Constructor<any>
}

declare global {
  interface CustomElementRegistry {
    assignFeatures<T implements HasCustomElementRegistry>(ctr: Constructor<T>, features: Record<keyof T, >)
  }
  
  interface Element {
    enh: any; // Enhancement container
  }
}
customElementRegistry.assignFeatures(ClubMember, {
    photoTaker: {
        //optional
        spawn: PhotoTakerMock
    }
});
```

What assignFeatures does:

1.  Confirms that each of the keys passed into the second argument has a corresponding opt in from the class constructor's static supportedFeatures object.  If not, throws an error.
2.  object-extension adds another registry:

Object.defineProperty(CustomElementRegistry.prototype, 'featuresRegistry', {
}

similar to the enhancementRegistry.  The key is the class constructor passed into assignFeatures.  One can add more and more features with the same class constructor via multiple calls to assignFeatures, as long as the keys are different with each call for the same constructor.

2.  For each key in the second argument of assignFeatures:
    1.  If the class constructor prototype already has a property defined with the name of key throw an error.
    2.  On the class prototype, use Object.defineProperty and define the getter only (no setter), where the name of the property is the key.
3.  The code of the programmatically defined getter does something like:

```JavaScript
Object.defineProperty(CustomElementRegistry.prototype, key, {
    get: function () {
        //privateStorage is a map that is stored somewhere tied to the instance of the class
        if(privateStorage[key] === undefined){
            const {customElementRegistry} = this;
            const {featuresRegistry} = customElementRegistry;
            if(!featuresRegistry.has(ctr)){
                throw "Weird Error, should be there"; 
            }
            const features = featuresRegistry.get(ctr)!;
            const feature = features[key];
            if(!feature){
                throw "Another weird error, this shouldn't happen either";
            }
            let {spawn} = feature;
            const optIn = ctr.supportedFeatures[key];
            if(!optIn) throw "Weird error, shouldn't happen";
            if(!spawn) spawn = optIn.fallbackSpawn;
            if(!spawn) throw "No implementation found";
            //get ctx, initVals similar to element enhancements
            //we can create a separate requirement to focus on how we get the ctx, initVals
            //so for first implementation, just instantiate spawn with a single parameter
            const instance = new spawn(this, ctx, initVals);
            if(optIn.validate){
                if(!optIn.validate(instance)) throw "Doesn't look right".
            }
            privateStorage[key] = instance
            

        }
        return privateStorage[key];
    },
    enumerable: true,   // Makes the property show up in loops like for...in
    configurable: false // Prevents deletion or redefinition of the property
});
```





---

## Kiro's Response II

Good — keeping it in `assign-gingerly` makes sense given the future feature-awareness you're planning. Avoids the circular dependency headache entirely.

And the rename from `injectFeatures` → `assignFeatures` is a nice touch. It's consistent with the package's identity ("assign" is the verb this package owns), and `assignFeatures` reads naturally as "assign these feature implementations to this custom element class."

So the name question is settled — it stays in `assign-gingerly`. Let me respond to the restated requirements:

### What I understand the implementation to be

1. **`object-extension.ts`** adds a `featuresRegistry` property to `CustomElementRegistry.prototype` (a `Map<Constructor, Record<string, FeatureConfig>>`), similar to how it already adds `enhancementRegistry`.

2. **`assignFeatures(ctr, features)`** is a new method on `CustomElementRegistry.prototype` that:
   - Validates each key in `features` exists in `ctr.supportedFeatures` — throws if not.
   - Validates the key doesn't already have a property descriptor on `ctr.prototype` — throws if it does.
   - Merges the features into `featuresRegistry` under the `ctr` key (additive across multiple calls, but no duplicate keys for the same constructor).
   - Defines a getter-only property on `ctr.prototype` for each key.

3. **The getter** (per-key, per-constructor):
   - Uses a private storage mechanism (WeakMap keyed by instance, or a per-instance Map) to cache the spawned feature.
   - On first access: looks up the `featuresRegistry`, resolves `spawn` (falling back to `supportedFeatures[key].fallbackSpawn`), instantiates it, optionally validates shape, caches it, returns it.
   - On subsequent access: returns cached instance.

4. **assignGingerly integration** — works automatically because the getter-only property triggers the existing readonly/accessor merge path. No changes needed to assignGingerly for phase 1.

### A few implementation details to confirm

**Private storage mechanism:**

Since we can't actually use `#privateFields` on a class we're monkey-patching from outside, the realistic options are:

- **(A) WeakMap keyed by instance** — `const featureStorage = new WeakMap<object, Record<string, any>>()`. The getter closes over this WeakMap. Clean, no memory leaks, no collision risk.
- **(B) A non-enumerable symbol property on the instance** — `this[Symbol.for('assign-gingerly:features')]`. Slightly more inspectable for debugging, but pollutes the instance.

I'd lean toward **(A)** — a module-scoped WeakMap. It's the standard pattern for "private state on objects you don't own." Does that match your thinking?

**Regarding `configurable: false`:**

You specified `configurable: false` on the getter. That's a strong lock — it means:
- The property can never be redefined or deleted from the prototype.
- If someone calls `assignFeatures` again with the same key for the same constructor, it'll throw (which is your intent based on the "already has a property" check).

This is fine and intentional — once a feature slot is claimed, it's permanent. Just noting that it also means you can't "hot-reload" a different spawn during development without a page refresh. Acceptable tradeoff?

**Regarding `enumerable: true`:**

You specified the getter should be enumerable. That means `Object.keys(instance)` and `for...in` will include these feature properties. This is a deliberate choice to make features discoverable/visible — correct? (Most prototype getters in the DOM are non-enumerable, but your use case is different since these are meant to be part of the public API.)

**Constructor signature — phase 1 simplification:**

You noted we can defer `ctx` and `initVals` to a future requirement. For phase 1, should the spawn constructor receive:

- `new spawn(hostElement)` — just the element instance, or
- `new spawn(hostElement, featureConfig)` — element + the config object from `supportedFeatures[key]` so the feature can read its own configuration?

I'd suggest `new spawn(hostElement)` for phase 1 simplicity, with the understanding that phase 2 will expand the signature.

**The `customElementRegistry` property on `this`:**

The getter references `this.customElementRegistry`. This property doesn't exist natively on `HTMLElement`. I assume `object-extension.ts` already defines this (since it's needed for `enhancementRegistry` access too)? If not, we'll need to add it — likely a getter on `Element.prototype` that returns `customElements` (the global registry), or for scoped registries, walks up the DOM to find the relevant one.

### Suggested file placement

Since this stays in `assign-gingerly`:

- **Types**: Add `SupportedFeatures`, `FeatureConfig`, and the `assignFeatures` signature to the existing type declarations.
- **Implementation**: A new `assignFeatures.ts` / `assignFeatures.js` module, exported from the package.
- **Registry setup**: The `featuresRegistry` definition goes in `object-extension.ts` alongside the existing registry definitions.

### Ready to implement

Once you confirm the above (especially the WeakMap vs symbol question and the phase-1 constructor signature), I can start writing the code. The scope is well-defined enough to move forward.
