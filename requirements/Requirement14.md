#  Add whenResolved to ElementEnhancementContainer

Define an exportable module "waitForEvent.ts"

Pseudocode:

```JavaScript
export function waitForEvent<TEvent extends Event = Event>(et: EventTarget, eventName: string, failureEventName?: string): Promise<TEvent>{
    return new Promise((resolved, rejected) => {
        et.addEventListener(eventName, e => {
            resolved(e as TEvent);
        }, {once: true});
        if(failureEventName !== undefined){
            et.addEventListener(failureEventName, e => {
                rejected(e as TEvent);
            },  {once: true});
        }

    });
}
```


```JavaScript
const spawnedInstance = await oElement.enh.whenResolved(registryItem: IBaseRegistryItem)
```

What this does (pseudocode):

```JavaScript
const resolved  = registryItem.lifecycleKeys?.resolved;
if(resolved === undefined) throw 'Must specify resolved key';

const spawnedInstance = oElement.enh.get(registryItem: IBaseRegistryItem);

if(spawnedInstance[resolved]) return spawnedInstance;

if(!(spawnedInstance instanceof EventTarget)) throw 'Invalid class type';

const {waitForEvent} = await import('./waitForEvent.js');
await waitForEvent(resolvedKey);
if(spawnedInstance[resolved]) return spawnedInstance;
throw 'Rejected'
```

1.  Throws an error if registryItem.lifecycleKeys.resolved is not diffined