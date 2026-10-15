/**
 * registry.ts — Registry of ` =&` sync ops.
 *
 * Every op is a plain, synchronous function: (args, extra, ctx) => value.
 * `args` is the resolved value of the key matching the op's own name (e.g. `join:`),
 * `extra` carries any sibling config keys (e.g. `separator:`), and `ctx.lhsTarget` is
 * what the key's left-hand path resolves to. An op either returns a value, which is
 * assigned to the LHS path (`join`), or renders into `ctx.lhsTarget` and returns
 * undefined (`microJoin`). All statically imported — no dynamic loading, unlike the
 * ` =>` built-in handler map — because the entire point of ` =&` is to never
 * introduce an await.
 *
 * Add new sync ops here as they're written.
 */
import { join } from './join.js';
import { microJoin } from './microJoin.js';
export const SYNC_OPS = {
    join,
    microJoin,
};
