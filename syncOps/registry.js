/**
 * registry.ts — Registry of ` =&` sync ops.
 *
 * Every op is a plain, synchronous, side-effect-free function: (args, extra) => value.
 * `args` is the resolved value of the key matching the op's own name (e.g. `join:`),
 * `extra` carries any sibling config keys (e.g. `separator:`). All statically
 * imported — no dynamic loading, unlike the ` =>` built-in handler map — because
 * the entire point of ` =&` is to never introduce an await.
 *
 * Add new sync ops here as they're written.
 */
import { join } from './join.js';
export const SYNC_OPS = {
    join,
};
