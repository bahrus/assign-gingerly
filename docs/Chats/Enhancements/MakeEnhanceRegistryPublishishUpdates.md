# Make Enhancement Registry Publish Updates

please make:

```TypeScript
export class EnhancementRegistry {
```

extend EventTarget and define an event:

```TypeScript
export class EnhancementRegisteredEvent extends Event implements IEnhancementRegisteredEvent {
    static eventName = 'register';
    
    constructor(
        public config: EnhancementConfig | EnhancementDonfig[], 
    ) {
        super(MountEvent.eventName);
    }
}
```

The enhancementRegistry class should emit an event of type EnhancementRegisteredEvent every time (a) new enhancement config(s) is/are passed in.
