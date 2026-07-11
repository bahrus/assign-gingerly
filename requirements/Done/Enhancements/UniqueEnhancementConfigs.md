# Unique Enhancement Configs

assignGingerly.ts has the following:

```TypeScript

/**
 * Base registry class for managing enhancement configurations
 */
export class EnhancementRegistry {
  #items: EnhancementConfig[] = [];
  ...
}
```

Please switch #items to be a set of EnhancementConfig.  getItems should still return an array.