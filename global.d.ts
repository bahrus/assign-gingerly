// Type declarations for Map.prototype.getOrInsert and WeakMap.prototype.getOrInsert
// Feature is now supported in all modern browsers (Chrome 146+, Firefox 134+, Safari 18.2+)
// See: https://web-platform-dx.github.io/web-features-explorer/features/getorinsert/

interface Map<K, V> {
  /**
   * Returns the value associated with the key if it exists, otherwise inserts
   * the value returned by the insert callback and returns it.
   * @param key The key to look up
   * @param insert A callback that returns the value to insert if the key doesn't exist
   * @returns The existing or newly inserted value
   */
  getOrInsertComputed(key: K, insert: () => V): V;
}

interface WeakMap<K extends object, V> {
  /**
   * Returns the value associated with the key if it exists, otherwise inserts
   * the value returned by the insert callback and returns it.
   * @param key The key to look up
   * @param insert A callback that returns the value to insert if the key doesn't exist
   * @returns The existing or newly inserted value
   */
  getOrInsertComputed(key: K, insert: () => V): V;
}
