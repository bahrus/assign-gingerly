# Disposing of an enhancement

This requirement adds a dispose method to the ElementEnhancementContainer class:

```JavaScript
oElement.enh.dispose(registryItem: IBaseRegistryItem);
```

What this does (pseudo code):  

```JavaScript
import {getInstanceMap} from './assignGingerly.js';
const spawnedInstance = oElement.enh.get(registryItem);
if(!spawnedInstance) return;
const dispose = registryItem?.lifecycleKeys?.dispose;
if(dispose){
    spawnedInstance[dispose](registryItem);
}
const map = getInstanceMap(oElement).remove(registryItem);
```


